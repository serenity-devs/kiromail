import { NextResponse } from "next/server";

export type ResourceVersion = number | string;
export type VersionedJsonOptions = { cache?: "revalidate" | "no-store" };

export class HttpPreconditionError extends Error {
  constructor(
    readonly status: 412 | 428,
    readonly code: "precondition_failed" | "precondition_required",
    message: string,
  ) {
    super(message);
  }
}

function validPart(value: string) {
  if (!value || /[\x00-\x20",]/.test(value)) throw new Error("Identidad de recurso no válida");
  return value;
}

export function resourceEtag(resource: string, id: string, version: ResourceVersion) {
  return `"${validPart(resource)}:${validPart(id)}:${String(version)}"`;
}

export function requireIfMatch(request: Request, resource: string, id: string) {
  const header = request.headers.get("if-match")?.trim();
  if (!header) {
    throw new HttpPreconditionError(
      428,
      "precondition_required",
      "Este cambio requiere If-Match. Vuelve a leer el recurso y reinténtalo con su ETag actual.",
    );
  }
  if (header === "*") {
    throw new HttpPreconditionError(412, "precondition_failed", "If-Match: * no está permitido para este recurso.");
  }
  const prefix = `"${validPart(resource)}:${validPart(id)}:`;
  for (const candidate of header.split(",").map(value => value.trim())) {
    if (candidate.startsWith(prefix) && candidate.endsWith('"')) {
      const version = candidate.slice(prefix.length, -1);
      if (/^[1-9]\d*$/.test(version)) return Number(version);
    }
  }
  throw new HttpPreconditionError(
    412,
    "precondition_failed",
    "El recurso cambió desde la última lectura. Recarga los datos antes de guardar.",
  );
}

export function preconditionResponse(error: unknown) {
  if (!(error instanceof HttpPreconditionError)) return null;
  return NextResponse.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "private, no-cache" } },
  );
}

export function staleResourceResponse() {
  return NextResponse.json(
    { error: { code: "precondition_failed", message: "El recurso cambió o dejó de ser editable. Recarga los datos antes de guardar." } },
    { status: 412, headers: { "Cache-Control": "private, no-cache" } },
  );
}

export function versionedJson(
  request: Request,
  body: Record<string, unknown>,
  resource: string,
  id: string,
  version: ResourceVersion,
  status = 200,
  options: VersionedJsonOptions = {},
) {
  const etag = resourceEtag(resource, id, version);
  const noStore = options.cache === "no-store";
  const headers = {
    ETag: etag,
    "Cache-Control": noStore ? "no-store" : "private, no-cache",
  };
  const validators = request.headers.get("if-none-match")?.split(",").map(value => value.trim()) ?? [];
  if (!noStore && (request.method === "GET" || request.method === "HEAD") && (validators.includes(etag) || validators.includes("*"))) {
    return new NextResponse(null, { status: 304, headers });
  }
  return NextResponse.json({ ...body, etag }, { status, headers });
}

export function versionedItems<T extends { id: string; revision: ResourceVersion }>(rows: T[], resource: string, id?: (row: T) => string) {
  return rows.map(row => ({ ...row, etag: resourceEtag(resource, id ? id(row) : row.id, row.revision) }));
}
