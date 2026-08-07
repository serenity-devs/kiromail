import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config";
import { issuePasswordReset } from "@/lib/auth";
import { acceptTransactionalMessage } from "@/lib/transactional-service";

const schema = z.object({ email: z.email() });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

export async function POST(request: Request) {
  try {
    const { email } = schema.parse(await request.json());
    const reset = await issuePasswordReset(email);
    if (reset) {
      const url = `${env.appUrl.replace(/\/$/, "")}/reset-password/${encodeURIComponent(reset.token)}`;
      await acceptTransactionalMessage({
        to: { email: reset.user.email, name: reset.user.name }, subject: "Restablece tu contraseña de Serenity Mail",
        html: `<div style="max-width:620px;margin:0 auto;padding:36px;font-family:Arial,sans-serif;color:#17282a"><h1 style="font-family:Georgia,serif;font-weight:500">Restablece tu contraseña</h1><p>Hola ${escapeHtml(reset.user.name)},</p><p>Este enlace es válido durante una hora y solo puede utilizarse una vez.</p><p><a href="${url}" style="display:inline-block;padding:13px 20px;border-radius:5px;background:#183e3f;color:white;text-decoration:none">Crear nueva contraseña</a></p><p style="color:#737b78;font-size:12px">Si no lo solicitaste, puedes ignorar este mensaje.</p></div>`,
        text: `Restablece tu contraseña de Serenity Mail: ${url}`, metadata: { kind: "password_reset", reset_id: reset.id }, track_opens: false, track_clicks: false,
      }, `password-reset:${reset.id}`, { id: "password-reset", kind: "system" });
    }
  } catch (error) {
    if (!(error instanceof z.ZodError)) console.error(error);
  }
  return NextResponse.json({ ok: true, message: "Si existe una cuenta activa, recibirás un enlace en unos minutos." });
}
