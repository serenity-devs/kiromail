import { NextResponse } from "next/server";
import { openApiDocument } from "@/lib/openapi";

export function GET(request: Request) {
  const download = new URL(request.url).searchParams.get("download") === "1";
  return NextResponse.json(openApiDocument, {
    headers: {
      "Cache-Control": "public, max-age=300",
      ...(download ? { "Content-Disposition": 'attachment; filename="serenity-mail-openapi.json"' } : {}),
    },
  });
}
