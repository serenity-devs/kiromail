import { createHash } from "node:crypto";
import { env } from "./config";

export type Personalization = Record<string, string | number | null | undefined>;

export function personalize(content: string, data: Personalization) {
  return content.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => String(data[key] ?? ""));
}

export function withCampaignTemplateVariables(
  data: Personalization,
  input: { unsubscribeUrl?: string; preferencesUrl?: string; physicalAddress: string },
) {
  return {
    ...data,
    unsubscribe_url: input.unsubscribeUrl ?? "",
    preferences_url: input.preferencesUrl ?? "",
    physical_address: input.physicalAddress,
  } satisfies Personalization;
}

export function buildTrackedHtml(input: {
  html: string;
  recipientId: string;
  trackOpens: boolean;
  trackClicks: boolean;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
}) {
  let html = input.html;
  if (input.trackClicks) {
    html = html.replace(/href=(['"])(https?:\/\/[^'"]+)\1/gi, (_match, quote: string, url: string) => {
      if (url === input.unsubscribeUrl || url === input.preferencesUrl) return `href=${quote}${url}${quote}`;
      const tracked = `${env.appUrl}/t/click/${input.recipientId}?url=${encodeURIComponent(url)}`;
      return `href=${quote}${tracked}${quote}`;
    });
  }
  const pixel = input.trackOpens ? `<img src="${env.appUrl}/t/open/${input.recipientId}" width="1" height="1" alt="" style="display:none">` : "";
  return `${html}${pixel}`;
}

export function eventKey(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function buildTransactionalTrackedHtml(input: { html: string; messageId: string; trackOpens: boolean; trackClicks: boolean }) {
  let html = input.html;
  if (input.trackClicks) {
    html = html.replace(/href=(['"])(https?:\/\/[^'"]+)\1/gi, (_match, quote: string, url: string) => {
      const tracked = `${env.appUrl}/t/message/click/${input.messageId}?url=${encodeURIComponent(url)}`;
      return `href=${quote}${tracked}${quote}`;
    });
  }
  const pixel = input.trackOpens
    ? `<img src="${env.appUrl}/t/message/open/${input.messageId}" width="1" height="1" alt="" style="display:none">`
    : "";
  return `${html}${pixel}`;
}
