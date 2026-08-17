export type SesDiagnosticRecipient = {
  emailAddress?: string;
  action?: string;
  status?: string;
  diagnosticCode?: string;
};

export type SesBounceInput = {
  bounceType?: string;
  bounceSubType?: string;
  bouncedRecipients?: SesDiagnosticRecipient[];
};

export type SesDeliveryDelayInput = {
  delayType?: string;
  expirationTime?: string;
  delayedRecipients?: SesDiagnosticRecipient[];
};

export type SesBounceClass = "hard" | "soft" | "undetermined";

function recipientFor(
  recipients: SesDiagnosticRecipient[] | undefined,
  email: string,
) {
  return (
    recipients?.find(
      (recipient) =>
        recipient.emailAddress?.toLowerCase() === email.toLowerCase(),
    ) ?? recipients?.[0]
  );
}

function normalizedRecipient(recipient: SesDiagnosticRecipient | undefined) {
  if (!recipient) return null;
  return {
    email_address: recipient.emailAddress ?? "",
    action: recipient.action ?? null,
    status: recipient.status ?? null,
    diagnostic_code: recipient.diagnosticCode ?? null,
  };
}

export function normalizeSesBounce(
  bounce: SesBounceInput | undefined,
  recipientEmail: string,
) {
  const rawType = bounce?.bounceType?.trim() || "Undetermined";
  const normalizedType = rawType.toLowerCase();
  const bounceClass: SesBounceClass =
    normalizedType === "permanent"
      ? "hard"
      : normalizedType === "transient"
        ? "soft"
        : "undetermined";
  const recipient = recipientFor(bounce?.bouncedRecipients, recipientEmail);
  const bounceSubtype = bounce?.bounceSubType?.trim() || "Undetermined";
  const label =
    bounceClass === "hard"
      ? "Hard bounce de SES"
      : bounceClass === "soft"
        ? "Soft bounce final de SES"
        : "Rebote indeterminado de SES";
  const diagnostic = [
    `${rawType}/${bounceSubtype}`,
    recipient?.status,
    recipient?.action,
    recipient?.diagnosticCode,
  ].filter(Boolean);

  return {
    bounce_class: bounceClass,
    bounce_type: rawType,
    bounce_subtype: bounceSubtype,
    is_permanent: bounceClass === "hard",
    should_suppress: bounceClass === "hard",
    failure_code:
      bounceClass === "hard"
        ? "hard_bounce"
        : bounceClass === "soft"
          ? "soft_bounce_final"
          : "undetermined_bounce",
    failure_reason: `${label} · ${diagnostic.join(" · ")}`.slice(0, 500),
    recipient: normalizedRecipient(recipient),
  };
}

export function normalizeSesDeliveryDelay(
  delay: SesDeliveryDelayInput | undefined,
  recipientEmail: string,
) {
  const recipient = recipientFor(delay?.delayedRecipients, recipientEmail);
  const delayType = delay?.delayType?.trim() || "Undetermined";
  const diagnostic = [
    delayType,
    recipient?.status,
    recipient?.diagnosticCode,
  ].filter(Boolean);

  return {
    delay_type: delayType,
    expiration_time: delay?.expirationTime ?? null,
    failure_code: "delivery_delayed",
    failure_reason: `Entrega retrasada por SES · ${diagnostic.join(" · ")}`.slice(
      0,
      500,
    ),
    recipient: normalizedRecipient(recipient),
  };
}
