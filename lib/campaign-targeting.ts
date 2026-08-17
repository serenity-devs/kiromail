const sqlIdentifier = /^[a-z_][a-z0-9_]*$/i;
const sqlParameter = /^\$[1-9][0-9]*$/;

function identifier(value: string) {
  if (!sqlIdentifier.test(value)) throw new Error("Identificador SQL no válido");
  return value;
}

/**
 * Matches the definition of a real open used by campaign reporting: probable
 * automated opens are ignored, while legacy rows without event detail still
 * fall back to opened_at.
 */
export function meaningfulCampaignOpenPredicate(recipientAlias: string) {
  const recipient = identifier(recipientAlias);
  return `(EXISTS (SELECT 1 FROM email_events open_event WHERE open_event.recipient_id=${recipient}.id AND open_event.type IN ('open','opened') AND NOT open_event.is_automated) OR (${recipient}.opened_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM email_events any_open_event WHERE any_open_event.recipient_id=${recipient}.id AND any_open_event.type IN ('open','opened'))))`;
}

export function nonOpenerCampaignTargetPredicate(
  sourceCampaignParameter: string,
  contactAlias = "c",
) {
  if (!sqlParameter.test(sourceCampaignParameter))
    throw new Error("Parámetro SQL no válido");
  const contact = identifier(contactAlias);
  const meaningfulOpen = meaningfulCampaignOpenPredicate("origin_recipient");
  return `EXISTS (SELECT 1 FROM campaign_recipients origin_recipient WHERE origin_recipient.contact_id=${contact}.id AND origin_recipient.campaign_id::text=${sourceCampaignParameter}::text AND origin_recipient.sent_at IS NOT NULL AND NOT ${meaningfulOpen})`;
}
