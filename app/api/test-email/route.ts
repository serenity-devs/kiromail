import { NextResponse } from "next/server";
import { z } from "zod";
import { sendTestEmail } from "@/lib/campaign-service";
import { apiError, requireApiSession } from "@/lib/http";
import { headerText } from "@/lib/validation";

const schema = z.object({ template_id: z.string().uuid(), email: z.email(), subject: headerText(1,998), from_name: headerText(1,200), from_email: z.email(), reply_to: z.union([z.email(), z.literal("")]) });

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("templates:write"); if (unauthorized) return unauthorized;
  try {
    const input = schema.parse(await request.json());
    return NextResponse.json(await sendTestEmail({ templateId: input.template_id, email: input.email, subject: input.subject, fromName: input.from_name, fromEmail: input.from_email, replyTo: input.reply_to }));
  } catch (error) { return apiError(error); }
}
