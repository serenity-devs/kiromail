import { isAutomatedInteraction, recordMessageEvent } from "@/lib/events";

const pixel = Buffer.from("R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=", "base64");

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const userAgent=request.headers.get("user-agent")?.slice(0,500)??"";const purpose=request.headers.get("purpose")??request.headers.get("sec-purpose");
  if (/^[0-9a-f-]{36}$/i.test(id)) await recordMessageEvent(id, "opened", { source: "pixel", user_agent:userAgent },undefined,isAutomatedInteraction(userAgent,purpose)).catch(() => undefined);
  return new Response(pixel, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
}
