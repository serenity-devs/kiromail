import nodemailer from "nodemailer";

export type TransactionalMimeAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  disposition: "attachment" | "inline";
  contentId?: string | null;
};

export type TransactionalMimeInput = {
  messageId: string;
  acceptedAt: Date;
  from: { email: string; name?: string };
  to: { email: string; name?: string };
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: TransactionalMimeAttachment[];
};

const compiler = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: "windows",
});

/**
 * Compone una sola representación RFC/MIME. Este Buffer se persiste y es el
 * que posteriormente se entrega a SMTP o a SES Raw; su byteLength no es una
 * aproximación de la sobrecarga base64, cabeceras o límites multipart.
 */
export async function buildTransactionalMime(input: TransactionalMimeInput): Promise<Buffer> {
  const info = await compiler.sendMail({
    from: { address: input.from.email, name: input.from.name ?? "" },
    to: { address: input.to.email, name: input.to.name ?? "" },
    replyTo: input.replyTo || undefined,
    subject: input.subject,
    html: input.html,
    text: input.text,
    date: input.acceptedAt,
    messageId: `<${input.messageId}@kiromail.local>`,
    headers: {
      "X-KiroMail-Message": input.messageId,
      "X-KiroMail-Channel": "transactional",
    },
    attachments: (input.attachments ?? []).map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: item.contentType,
      contentDisposition: item.disposition,
      cid: item.contentId || undefined,
    })),
    disableFileAccess: true,
    disableUrlAccess: true,
    xMailer: false,
  });
  if (!Buffer.isBuffer(info.message)) throw new Error("El compilador MIME no devolvió un Buffer");
  return info.message;
}

export function assertMimeWithinLimit(mime: Buffer, limitBytes: number) {
  if (!Number.isSafeInteger(limitBytes) || limitBytes <= 0) throw new Error("TRANSACTIONAL_MIME_MAX_BYTES debe ser un entero positivo");
  if (mime.byteLength > limitBytes) {
    const error = new Error(`El mensaje MIME ocupa ${mime.byteLength} bytes y supera el límite de ${limitBytes} bytes`);
    Object.assign(error, { code: "message_too_large", status: 413, mimeByteSize: mime.byteLength, mimeLimitBytes: limitBytes });
    throw error;
  }
  return mime.byteLength;
}
