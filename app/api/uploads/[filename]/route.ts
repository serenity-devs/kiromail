import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/lib/config";

const types: Record<string, string> = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  if (!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/i.test(filename)) return new NextResponse("Not found", { status: 404 });
  try {
    const file = await readFile(path.join(env.uploadDir, filename));
    return new NextResponse(file, { headers: { "Content-Type": types[path.extname(filename)] ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
