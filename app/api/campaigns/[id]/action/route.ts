import { NextResponse } from "next/server";
import { z } from "zod";
import { startCampaign } from "@/lib/campaign-service";
import { sql } from "@/lib/db";
import { apiError, requireApiSession } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiSession("campaigns:send"); if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    z.string().uuid().parse(id);
    const { action } = z.object({ action: z.enum(["send", "pause", "resume", "cancel"]) }).parse(await request.json());
    if (action === "send" || action === "resume") {
      const result = await startCampaign(id);
      return NextResponse.json(result);
    }
    if (action === "pause") await sql`UPDATE campaigns SET status='paused', updated_at=now() WHERE id=${id} AND status='sending'`;
    if (action === "cancel") await sql`UPDATE campaigns SET status='cancelled', updated_at=now() WHERE id=${id} AND status IN ('draft','scheduled','sending','paused')`;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
