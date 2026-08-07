import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./config";
import { sql } from "./db";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

type ContentBlob = {
  id: string;
  sha256: string;
  storage_backend: "filesystem" | "s3";
  storage_key: string;
  mime_type: string;
  byte_size: number;
  encoding: "identity" | "gzip";
};

function storagePath(storageKey: string) {
  const root = path.resolve(env.contentStorageDir);
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Clave de almacenamiento no válida");
  return resolved;
}

function mimeFolder(mimeType: string) {
  return createHash("sha256").update(mimeType).digest("hex").slice(0, 12);
}

let s3Client: S3Client | undefined;
function s3(region: string) {
  if (!env.s3Bucket) throw new Error("S3_BUCKET es obligatorio para el backend S3");
  s3Client ??= new S3Client({ region, endpoint: env.s3Endpoint, forcePathStyle: env.s3ForcePathStyle, credentials: env.awsCredentials });
  return s3Client;
}
function s3Key(storageKey: string) {
  return env.s3Prefix ? `${env.s3Prefix}/${storageKey}` : storageKey;
}

async function storageConfiguration() {
  const [settings] = await sql<{content_storage:"filesystem"|"s3";aws_region:string}[]>`SELECT content_storage,aws_region FROM settings WHERE id=1`;
  return { backend: env.contentStorage ?? settings?.content_storage ?? "filesystem", region: env.awsRegion ?? settings?.aws_region ?? "eu-west-1" };
}

async function writeFilesystem(storageKey: string, compressed: Buffer) {
  const destination = storagePath(storageKey);
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await stat(destination);
  } catch {
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, compressed, { flag: "wx", mode: 0o600 });
    try { await rename(temporary, destination); }
    finally { await rm(temporary, { force: true }).catch(() => undefined); }
  }
}

async function writeS3(storageKey: string, compressed: Buffer, region: string) {
  await s3(region).send(new PutObjectCommand({ Bucket: env.s3Bucket, Key: s3Key(storageKey), Body: compressed, ServerSideEncryption: "AES256", ContentType: "application/octet-stream", Metadata: { encoding: "gzip" } }));
}

export async function storeContent(content: string | Buffer, mimeType: string, expiresAt?: Date | null) {
  const original = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const sha256 = createHash("sha256").update(original).digest("hex");
  const storageKey = path.posix.join(mimeFolder(mimeType), sha256.slice(0, 2), `${sha256}.gz`);
  const [existing] = await sql<ContentBlob[]>`SELECT * FROM content_blobs WHERE sha256=${sha256} AND mime_type=${mimeType} AND encoding='gzip'`;
  if (existing) {
    const [updated] = await sql<ContentBlob[]>`UPDATE content_blobs SET expires_at=CASE WHEN expires_at IS NULL THEN ${expiresAt??null} WHEN ${expiresAt??null}::timestamptz IS NULL THEN expires_at ELSE GREATEST(expires_at,${expiresAt??null}) END WHERE id=${existing.id} RETURNING *`;
    return updated;
  }

  const configuration = await storageConfiguration();
  const compressed = await gzipAsync(original);
  if (configuration.backend === "s3") await writeS3(storageKey,compressed,configuration.region);
  else await writeFilesystem(storageKey,compressed);

  const [blob] = await sql<ContentBlob[]>`
    INSERT INTO content_blobs (sha256, storage_backend, storage_key, mime_type, byte_size, encoding, expires_at)
    VALUES (${sha256}, ${configuration.backend}, ${storageKey}, ${mimeType}, ${original.byteLength}, 'gzip', ${expiresAt ?? null})
    ON CONFLICT (sha256, mime_type, encoding) DO UPDATE SET
      expires_at = CASE
        WHEN content_blobs.expires_at IS NULL THEN EXCLUDED.expires_at
        WHEN EXCLUDED.expires_at IS NULL THEN content_blobs.expires_at
        ELSE GREATEST(content_blobs.expires_at, EXCLUDED.expires_at)
      END
    RETURNING *
  `;
  return blob;
}

export async function readContent(blobId: string) {
  const [blob] = await sql<ContentBlob[]>`SELECT * FROM content_blobs WHERE id=${blobId}`;
  if (!blob) return null;
  let stored: Buffer;
  if (blob.storage_backend === "s3") {
    const configuration = await storageConfiguration();
    const response = await s3(configuration.region).send(new GetObjectCommand({Bucket:env.s3Bucket,Key:s3Key(blob.storage_key)}));
    if (!response.Body) throw new Error("S3 devolvió un objeto vacío");
    stored = Buffer.from(await response.Body.transformToByteArray());
  } else stored = await readFile(storagePath(blob.storage_key));
  const original = blob.encoding === "gzip" ? await gunzipAsync(stored) : stored;
  const actualHash = createHash("sha256").update(original).digest("hex");
  if (actualHash !== blob.sha256) throw new Error("El contenido almacenado no supera la verificación de integridad");
  return { blob, content: original };
}

export async function reconcileContentBlobs() {
  const blobs = await sql<ContentBlob[]>`SELECT * FROM content_blobs ORDER BY created_at`;
  const missing: string[] = [];
  const corrupted: string[] = [];
  const unreadable: string[] = [];
  for (const blob of blobs) {
    try {
      const result = await readContent(blob.id);
      if (!result) missing.push(blob.id);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") missing.push(blob.id);
      else if (code === "EACCES" || code === "EPERM") unreadable.push(blob.id);
      else corrupted.push(blob.id);
    }
  }
  return { checked: blobs.length, missing, corrupted, unreadable };
}

export async function pruneExpiredContent(limit=500) {
  const blobs = await sql<ContentBlob[]>`SELECT * FROM content_blobs WHERE expires_at IS NOT NULL AND expires_at<=now() ORDER BY expires_at LIMIT ${limit}`;
  const configuration = await storageConfiguration();
  let deleted=0;
  const failed:{id:string;error:string}[]=[];
  for(const blob of blobs){
    try{
      if(blob.storage_backend==="s3")await s3(configuration.region).send(new DeleteObjectCommand({Bucket:env.s3Bucket,Key:s3Key(blob.storage_key)}));
      else await rm(storagePath(blob.storage_key),{force:true});
      await sql`DELETE FROM content_blobs WHERE id=${blob.id} AND expires_at<=now()`;
      deleted++;
    }catch(error){failed.push({id:blob.id,error:error instanceof Error?error.message:"Error desconocido"});}
  }
  return{eligible:blobs.length,deleted,failed};
}
