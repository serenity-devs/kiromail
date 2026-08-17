import { NextResponse } from "next/server";
import { z } from "zod";
import { sendTestEmail } from "@/lib/campaign-service";
import { apiError, requireApiSession } from "@/lib/http";
import { headerText } from "@/lib/validation";

const schema = z.object({
  template_id: z.string().uuid().optional(), campaign_id: z.string().uuid().optional(), email: z.email(), subject: headerText(1,998),
  from_name: headerText(1,200).optional(), from_email: z.email().optional(), reply_to: z.union([z.email(), z.literal("")]).optional(),
}).refine((value) => Boolean(value.template_id) !== Boolean(value.campaign_id), { message: "Indica una plantilla o una campaña" });

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("templates:write"); if (unauthorized) return unauthorized;
  try {
    const input = schema.parse(await request.json());
    const source = input.campaign_id ? { campaignId: input.campaign_id } : { templateId: input.template_id! };
    return NextResponse.json(await sendTestEmail({ ...source, email: input.email, subject: input.subject, fromName: input.from_name, fromEmail: input.from_email, replyTo: input.reply_to }));
  } catch (error) { return apiError(error); }
}
