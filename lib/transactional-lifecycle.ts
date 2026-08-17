export type TransactionalTransport = "smtp" | "ses";

/**
 * SES acceptance and the later SES SEND notification are different stages.
 * Keeping distinct event types avoids presenting both as "Enviado".
 */
export function transportAcceptanceEventType(
  transport: TransactionalTransport,
) {
  return transport === "ses" ? "provider_accepted" : "sent";
}

export function transportAcceptedStatus(transport: TransactionalTransport) {
  return transport === "smtp" ? "delivered" : "sent";
}

/**
 * Once a transport has accepted a message, an automatic resend can duplicate it.
 * Leave that message for provider-event reconciliation instead.
 */
export function shouldRequeueTransactionalFailure(errorCode: string) {
  return errorCode !== "provider_acceptance_unconfirmed";
}
