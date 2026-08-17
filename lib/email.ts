import { createHash } from "node:crypto";
import { env } from "./config";
import { createUnsubscribeToken } from "./auth";

export type Personalization = Record<string, string | number | null | undefined>;

export function personalize(content: string, data: Personalization) {
  return content.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => String(data[key] ?? ""));
}

export function buildTrackedHtml(input: {
  html: string;
  recipientId: string;
  email: string;
  campaignId: string;
  physicalAddress: string;
  trackOpens: boolean;
  trackClicks: boolean;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
}) {
  const token = input.unsubscribeUrl ? "" : createUnsubscribeToken(input.email, input.campaignId);
  const unsubscribeUrl = input.unsubscribeUrl ?? `${env.appUrl}/unsubscribe/${encodeURIComponent(token)}`;
  let html = input.html;
  if (input.trackClicks) {
    html = html.replace(/href=(['"])(https?:\/\/[^'"]+)\1/gi, (_match, quote: string, url: string) => {
      const tracked = `${env.appUrl}/t/click/${input.recipientId}?url=${encodeURIComponent(url)}`;
      return `href=${quote}${tracked}${quote}`;
    });
  }
  const preferences = input.preferencesUrl ? ` · <a style="color:#5b6d6a" href="${input.preferencesUrl}">Gestionar preferencias</a>` : "";
  const footer = `<div style="max-width:620px;margin:36px auto 0;padding:24px 0;border-top:1px solid #ded8cc;color:#7b7b73;font:12px/1.6 Arial,sans-serif;text-align:center"><p>${input.physicalAddress}</p><p><a style="color:#5b6d6a" href="${unsubscribeUrl}">Darme de baja</a>${preferences}</p></div>`;
  const pixel = input.trackOpens ? `<img src="${env.appUrl}/t/open/${input.recipientId}" width="1" height="1" alt="" style="display:none">` : "";
  return `${html}${footer}${pixel}`;
}

export function buildMarketingTestHtml(input: { html: string; email: string; physicalAddress: string }) {
  return buildTrackedHtml({
    html: input.html,
    recipientId: "test-preview",
    email: input.email,
    campaignId: "test-preview",
    physicalAddress: input.physicalAddress,
    trackOpens: false,
    trackClicks: false,
    unsubscribeUrl: `${env.appUrl}/unsubscribe/test-preview`,
    preferencesUrl: `${env.appUrl}/preferences/test-preview`,
  });
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
