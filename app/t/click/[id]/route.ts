import { NextResponse } from "next/server";
import { isAutomatedInteraction, recordRecipientEvent } from "@/lib/events";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const target = new URL(request.url).searchParams.get("url") ?? "";
  let destination: URL;
  try {
    destination = new URL(target);
    if (!["http:", "https:"].includes(destination.protocol)) throw new Error();
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const userAgent=request.headers.get("user-agent")?.slice(0,500)??"";const purpose=request.headers.get("purpose")??request.headers.get("sec-purpose");
  if (/^[0-9a-f-]{36}$/i.test(id)) await recordRecipientEvent(id, "click", { source: "redirect",user_agent:userAgent }, destination.toString(),isAutomatedInteraction(userAgent,purpose)).catch(() => undefined);
  return NextResponse.redirect(destination);
}
