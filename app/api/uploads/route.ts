import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/config";
import { requireApiSession } from "@/lib/http";

export const runtime = "nodejs";

const allowed = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"], ["image/gif", ".gif"]]);

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("templates:write"); if (unauthorized) return unauthorized;
  const data = await request.formData();
  const file = data.get("file");
  if (!(file instanceof File) || !allowed.has(file.type)) return NextResponse.json({ error: "Usa una imagen JPG, PNG, WebP o GIF" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "La imagen supera 5 MB" }, { status: 400 });
  const filename = `${randomUUID()}${allowed.get(file.type)}`;
  await mkdir(env.uploadDir, { recursive: true });
  await writeFile(path.join(env.uploadDir, filename), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `${env.appUrl}/api/uploads/${filename}` });
}
