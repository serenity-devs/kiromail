import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { env } from "./config";
import { sql } from "./db";
import { validateListValues } from "./list-fields";
import { acceptTransactionalMessage } from "./transactional-service";
import { eventKey } from "./email";

export type PublicTokenPurpose = "confirm" | "preferences" | "unsubscribe";

type TokenRow = {
  id: string;
  purpose: PublicTokenPurpose;
  contact_id: string;
  subscription_id: string | null;
  list_id: string | null;
  detail: Record<string, unknown>;
  expires_at: Date;
  used_at: Date | null;
};

export function hashPublicToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPublicIdentity(value: string) {
  return createHmac("sha256", env.sessionSecret).update(value.trim().toLowerCase()).digest("hex");
}

export function requestIp(request: Request) {
  const candidate = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return isIP(candidate) ? candidate : "";
}

function escapeHtml(value: string) {
  return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

export async function requestPublicSubscription(input: {
  listKey: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  fields: Record<string, unknown>;
  consentText: string;
  ip: string;
  userAgent: string;
}) {
  const email = input.email.trim().toLowerCase();
  const identityHash = hashPublicIdentity(`${input.listKey}:${email}`);
  const ipHash = hashPublicIdentity(input.ip || "unknown");
  const [recent] = await sql<{ count:number }[]>`
    SELECT count(*)::int AS count FROM public_requests
    WHERE created_at>now()-interval '1 hour' AND (identity_hash=${identityHash} OR ip_hash=${ipHash})
  `;
  await sql`INSERT INTO public_requests(kind,identity_hash,ip_hash) VALUES('subscribe',${identityHash},${ipHash})`;
  if (recent.count >= 8) return { accepted: true, rateLimited: true };
  const [list] = await sql<{id:string;name:string;double_opt_in:boolean;consent_text_default:string}[]>`
    SELECT id,name,double_opt_in,consent_text_default FROM lists
    WHERE key=${input.listKey} AND status='active' AND public_signup_enabled
  `;
  if (!list) return { accepted: true, unavailable: true };
  const validation = await validateListValues(list.id,input.fields,!list.double_opt_in);
  if (!validation.valid) return { accepted: false, errors: validation.errors };
  const storedFields = JSON.parse(JSON.stringify(input.fields)) as never;
  const consentText = input.consentText || list.consent_text_default;
  const result = await sql.begin(async (tx) => {
    const [privacySuppression] = await tx<{id:string}[]>`SELECT id FROM suppressions WHERE lower(email)=lower(${email}) AND scope='all' AND status='active' AND reason IN('privacy','merged') LIMIT 1`;
    if (privacySuppression) return { contactId:"",blocked:true,subscriptionId:null,pending:false };
    let [contact] = await tx<{id:string;status:string}[]>`SELECT id,status FROM contacts WHERE lower(email)=${email} AND merged_into_contact_id IS NULL AND anonymized_at IS NULL FOR UPDATE`;
    if (!contact) [contact] = await tx<{id:string;status:string}[]>`
      INSERT INTO contacts(email,first_name,last_name,phone,status,source) VALUES(${email},${input.firstName},${input.lastName},${input.phone},'active','public_form') RETURNING id,status
    `;
    else await tx`UPDATE contacts SET first_name=CASE WHEN ${input.firstName}='' THEN first_name ELSE ${input.firstName} END,last_name=CASE WHEN ${input.lastName}='' THEN last_name ELSE ${input.lastName} END,phone=CASE WHEN ${input.phone}='' THEN phone ELSE ${input.phone} END,updated_at=now() WHERE id=${contact.id}`;
    const [existing] = await tx<{id:string;status:string}[]>`SELECT id,status FROM subscriptions WHERE contact_id=${contact.id} AND list_id=${list.id} FOR UPDATE`;
    if (existing?.status === 'unsubscribed' || existing?.status === 'archived' || contact.status !== 'active') return { contactId:contact.id,blocked:true,subscriptionId:existing?.id ?? null,pending:false };
    const status = list.double_opt_in ? 'pending' : 'active';
    if (existing?.status === 'active') return { contactId:contact.id,blocked:false,subscriptionId:existing.id,pending:false };
    let subscriptionId = existing?.id;
    if (existing) await tx`UPDATE subscriptions SET source='public_form',custom_values=${tx.json(storedFields)},consent_text=${consentText},consent_ip=${input.ip || null},consent_user_agent=${input.userAgent},updated_at=now() WHERE id=${existing.id}`;
    else {
      const [subscription] = await tx<{id:string}[]>`
        INSERT INTO subscriptions(contact_id,list_id,status,source,custom_values,subscribed_at,confirmed_at,consent_text,consent_ip,consent_user_agent)
        VALUES(${contact.id},${list.id},${status},'public_form',${tx.json(storedFields)},now(),${status === 'active' ? new Date() : null},${consentText},${input.ip || null},${input.userAgent}) RETURNING id
      `;
      subscriptionId=subscription.id;
      await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,legal_basis,ip,user_agent,detail)
        VALUES(${contact.id},${subscription.id},${list.id},${status === 'active' ? 'subscribed' : 'consent_updated'},'public_form',${consentText},'consent',${input.ip || null},${input.userAgent},${tx.json({ pending:status === 'pending' })})`;
    }
    return { contactId:contact.id,blocked:false,subscriptionId:subscriptionId!,pending:status === 'pending' };
  });
  if (!result.blocked && result.pending && result.subscriptionId) {
    const token = await issuePublicToken({purpose:'confirm',contactId:result.contactId,subscriptionId:result.subscriptionId,listId:list.id,expiresInDays:2,revokePrevious:true});
    const url=`${env.appUrl}/confirm/${encodeURIComponent(token.token)}`;
    await acceptTransactionalMessage({to:{email,name:input.firstName},subject:`Confirma tu suscripción a ${list.name}`,html:`<div style="max-width:620px;margin:0 auto;padding:36px;font-family:Arial,sans-serif;color:#17282a"><h1 style="font-family:Georgia,serif;font-weight:500">Confirma tu suscripción</h1><p>Has solicitado recibir <strong>${escapeHtml(list.name)}</strong>.</p><p><a href="${url}" style="display:inline-block;padding:13px 20px;border-radius:5px;background:#183e3f;color:white;text-decoration:none">Confirmar suscripción</a></p><p style="color:#737b78;font-size:12px">Si no hiciste esta solicitud, ignora este mensaje. El enlace caduca en 48 horas.</p></div>`,text:`Confirma tu suscripción a ${list.name}: ${url}`,metadata:{kind:'subscription_confirmation',list_id:list.id,subscription_id:result.subscriptionId},track_opens:false,track_clicks:false},`public-confirm:${token.id}`,{id:"public-confirmation",kind:"system"});
  }
  return { accepted: true, pending: result.pending };
}

export async function issuePublicToken(input: {
  purpose: PublicTokenPurpose;
  contactId: string;
  subscriptionId?: string | null;
  listId?: string | null;
  expiresInDays?: number;
  detail?: Record<string, unknown>;
  revokePrevious?: boolean;
}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 30) * 86_400_000);
  const detail = JSON.parse(JSON.stringify(input.detail ?? {})) as never;
  const row = await sql.begin(async (tx) => {
    if (input.revokePrevious) await tx`
      UPDATE public_tokens SET revoked_at=now()
      WHERE contact_id=${input.contactId} AND purpose=${input.purpose}
        AND (${input.subscriptionId ?? null}::uuid IS NULL OR subscription_id=${input.subscriptionId ?? null})
        AND revoked_at IS NULL AND used_at IS NULL
    `;
    const [created] = await tx<{ id: string }[]>`
      INSERT INTO public_tokens (token_hash,purpose,contact_id,subscription_id,list_id,detail,expires_at)
      VALUES (${hashPublicToken(token)},${input.purpose},${input.contactId},${input.subscriptionId ?? null},${input.listId ?? null},${tx.json(detail)},${expiresAt})
      RETURNING id
    `;
    return created;
  });
  return { id: row.id, token, expiresAt };
}

export async function resolvePublicToken(token: string, purpose?: PublicTokenPurpose, allowUsed = false) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const [row] = await sql<TokenRow[]>`
    SELECT id,purpose,contact_id,subscription_id,list_id,detail,expires_at,used_at
    FROM public_tokens
    WHERE token_hash=${hashPublicToken(token)} AND revoked_at IS NULL AND expires_at>now()
      AND (${purpose ?? null}::text IS NULL OR purpose=${purpose ?? null})
      AND (${allowUsed} OR used_at IS NULL)
  `;
  return row ?? null;
}

export async function loadPreferenceCenter(token: string) {
  const access = await resolvePublicToken(token, "preferences", true);
  if (!access) return null;
  const [contact] = await sql<{ id:string;email:string;first_name:string;last_name:string;phone:string;custom_fields:Record<string,unknown> }[]>`
    SELECT id,email,first_name,last_name,phone,custom_fields FROM contacts WHERE id=${access.contact_id}
  `;
  if (!contact) return null;
  const subscriptions = await sql<{id:string;list_id:string;list_name:string;list_description:string;list_color:string;status:string;source:string;custom_values:Record<string,unknown>;subscribed_at:Date|null;fields:Array<Record<string,unknown>>}[]>`
    SELECT s.id,s.list_id,l.name AS list_name,l.description AS list_description,l.color AS list_color,s.status,s.source,s.custom_values,s.subscribed_at,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('key',f.key,'label',f.label,'type',f.type,'help_text',f.help_text,'options',f.options,'required',f.required) ORDER BY f.position)
        FROM list_fields f WHERE f.list_id=l.id AND f.status='active' AND f.visibility='preference_center'),'[]'::jsonb) AS fields
    FROM subscriptions s JOIN lists l ON l.id=s.list_id
    WHERE s.contact_id=${contact.id} AND l.status='active' AND l.preference_center_visible
    ORDER BY l.created_at
  `;
  return { access, contact, subscriptions };
}

export async function confirmSubscription(token: string, ip: string, userAgent: string) {
  const access = await resolvePublicToken(token, "confirm", true);
  if (!access?.subscription_id || !access.list_id) return { confirmed: false as const };
  return sql.begin(async (tx) => {
    const [subscription] = await tx<{ id:string;contact_id:string;list_id:string;status:string }[]>`
      SELECT id,contact_id,list_id,status FROM subscriptions WHERE id=${access.subscription_id} AND list_id=${access.list_id} FOR UPDATE
    `;
    if (!subscription) return { confirmed: false as const };
    if (subscription.status === "pending") {
      await tx`UPDATE subscriptions SET status='active',confirmed_at=now(),subscribed_at=COALESCE(subscribed_at,now()),consent_ip=${ip || null},consent_user_agent=${userAgent},updated_at=now() WHERE id=${subscription.id}`;
      await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,ip,user_agent,detail)
        VALUES(${subscription.contact_id},${subscription.id},${subscription.list_id},'confirmed','double_opt_in','Confirmación mediante enlace',${ip || null},${userAgent},${tx.json({ token_id:access.id })})`;
    }
    await tx`UPDATE public_tokens SET used_at=COALESCE(used_at,now()) WHERE id=${access.id}`;
    await tx`INSERT INTO audit_log(action,entity_type,entity_id,detail) VALUES('confirm','subscription',${subscription.id},${tx.json({ token_id:access.id })})`;
    return { confirmed: true as const, contactId: subscription.contact_id, subscriptionId: subscription.id, alreadyActive: subscription.status === "active" };
  });
}

export async function loadPublicUnsubscribe(token:string){
  const access=await resolvePublicToken(token,"unsubscribe",true);if(!access?.subscription_id)return null;
  const[context]=await sql<{subscription_id:string;list_id:string;email:string;list_name:string;status:string}[]>`
    SELECT s.id AS subscription_id,s.list_id,c.email,l.name AS list_name,s.status FROM subscriptions s JOIN contacts c ON c.id=s.contact_id JOIN lists l ON l.id=s.list_id
    WHERE s.id=${access.subscription_id} AND s.contact_id=${access.contact_id} AND (${access.list_id}::uuid IS NULL OR s.list_id=${access.list_id})
  `;
  return context?{access,...context}:null;
}

export async function unsubscribeWithPublicToken(token:string,ip:string,userAgent:string){
  const context=await loadPublicUnsubscribe(token);if(!context)return null;
  const campaignId=typeof context.access.detail.campaign_id==="string"?context.access.detail.campaign_id:null;
  await sql.begin(async tx=>{
    const[changed]=await tx<{id:string}[]>`UPDATE subscriptions SET status='unsubscribed',unsubscribed_at=COALESCE(unsubscribed_at,now()),updated_at=now() WHERE id=${context.subscription_id} AND status<>'unsubscribed' RETURNING id`;
    if(changed)await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,ip,user_agent,detail) VALUES(${context.access.contact_id},${context.subscription_id},${context.list_id},'unsubscribed','email_link','Baja desde campaña',${ip||null},${userAgent},${tx.json({token_id:context.access.id,campaign_id:campaignId})})`;
    await tx`UPDATE public_tokens SET used_at=COALESCE(used_at,now()) WHERE id=${context.access.id}`;
    if(campaignId){const recipients=await tx<{id:string;outbound_message_id:string|null;ses_message_id:string|null}[]>`UPDATE campaign_recipients SET status='unsubscribed' WHERE campaign_id=${campaignId} AND subscription_id=${context.subscription_id} RETURNING id,outbound_message_id,ses_message_id`;for(const recipient of recipients)await tx`INSERT INTO email_events(event_key,message_id,recipient_id,campaign_id,contact_id,type,ses_message_id,source,payload) VALUES(${eventKey({type:'unsubscribe',recipientId:recipient.id})},${recipient.outbound_message_id},${recipient.id},${campaignId},${context.access.contact_id},'unsubscribe',${recipient.ses_message_id},'link',${tx.json({listId:context.list_id,tokenId:context.access.id})}) ON CONFLICT(event_key) DO NOTHING`;}
    await tx`INSERT INTO audit_log(action,entity_type,entity_id,detail) VALUES('unsubscribe','subscription',${context.subscription_id},${tx.json({token_id:context.access.id,campaign_id:campaignId,list_id:context.list_id})})`;
  });
  return{unsubscribed:true,campaignId,listName:context.list_name,email:context.email};
}

export async function applyPreferences(input: {
  token: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  country: string;
  activeListIds: string[];
  fieldValues: Record<string, Record<string, unknown>>;
  unsubscribeAll: boolean;
  ip: string;
  userAgent: string;
}) {
  const center = await loadPreferenceCenter(input.token);
  if (!center) throw new Error("Enlace de preferencias no válido");
  const allowed = new Map(center.subscriptions.map((item) => [item.list_id,item]));
  const activeIds = new Set(input.unsubscribeAll ? [] : input.activeListIds.filter((id) => allowed.has(id)));
  for (const [listId, values] of Object.entries(input.fieldValues)) {
    if (!allowed.has(listId)) continue;
    const publicKeys = new Set((allowed.get(listId)?.fields ?? []).map((field) => String(field.key)));
    for (const key of Object.keys(values)) if (!publicKeys.has(key)) delete values[key];
    const validation = await validateListValues(listId, values, false);
    if (!validation.valid) throw new Error(validation.errors.map((error) => `${error.field}: ${error.message}`).join("; "));
  }
  const globalFields = { ...(center.contact.custom_fields ?? {}), city: input.city, country: input.country };
  await sql.begin(async (tx) => {
    await tx`UPDATE contacts SET first_name=${input.firstName},last_name=${input.lastName},phone=${input.phone},custom_fields=${tx.json(globalFields as never)},updated_at=now() WHERE id=${center.contact.id}`;
    for (const subscription of center.subscriptions) {
      const wantsActive = activeIds.has(subscription.list_id);
      const nextFields = input.fieldValues[subscription.list_id];
      if (nextFields) await tx`UPDATE subscriptions SET custom_values=custom_values||${tx.json(nextFields as never)},updated_at=now() WHERE id=${subscription.id}`;
      if (wantsActive && subscription.status === "unsubscribed") {
        await tx`UPDATE subscriptions SET status='active',reactivated_at=now(),subscribed_at=now(),unsubscribed_at=NULL,consent_ip=${input.ip || null},consent_user_agent=${input.userAgent},updated_at=now() WHERE id=${subscription.id}`;
        await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,ip,user_agent,detail) VALUES(${center.contact.id},${subscription.id},${subscription.list_id},'resubscribed','preference_center','Reactivación explícita en el centro de preferencias',${input.ip || null},${input.userAgent},'{"explicit":true}')`;
      } else if (!wantsActive && subscription.status === "active") {
        await tx`UPDATE subscriptions SET status='unsubscribed',unsubscribed_at=COALESCE(unsubscribed_at,now()),updated_at=now() WHERE id=${subscription.id}`;
        await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,ip,user_agent) VALUES(${center.contact.id},${subscription.id},${subscription.list_id},'unsubscribed','preference_center','Preferencia desactivada por la persona',${input.ip || null},${input.userAgent})`;
      }
    }
    await tx`INSERT INTO audit_log(action,entity_type,entity_id,detail) VALUES('preferences_update','contact',${center.contact.id},${tx.json({ active_list_ids:[...activeIds],unsubscribe_all:input.unsubscribeAll })})`;
  });
  return { updated: true };
}
