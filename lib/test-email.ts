export type TestEmailResult = {
  sent: true;
  transport: "smtp" | "ses";
  region: string;
  provider_message_id: string;
  status: "provider_accepted" | "delivered";
};

export function testEmailConfirmation(result: TestEmailResult) {
  if (result.transport === "ses") {
    return `Aceptado por Amazon SES${result.provider_message_id ? ` · ${result.provider_message_id}` : ""}`;
  }
  return "Entregado a Mailpit";
}
