import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { eventKey } from "@/lib/email";
import { recomputeCampaignStats } from "@/lib/campaign-service";
import { verifySnsEnvelope,type SnsEnvelope } from "@/lib/sns";
import { isAutomatedInteraction } from "@/lib/events";
import { env } from "@/lib/config";
import { normalizeSesBounce,normalizeSesDeliveryDelay,type SesDiagnosticRecipient } from "@/lib/ses-events";

export const runtime="nodejs";

type SesEvent={
  eventType?:string;notificationType?:string;
  mail?:{messageId?:string;timestamp?:string;destination?:string[];tags?:Record<string,string[]>;headers?:unknown;commonHeaders?:unknown};
  bounce?:{timestamp?:string;bounceType?:string;bounceSubType?:string;bouncedRecipients?:SesDiagnosticRecipient[]};
  complaint?:{timestamp?:string;complaintFeedbackType?:string;complainedRecipients?:SesDiagnosticRecipient[]};
  delivery?:{timestamp?:string;recipients?:string[]};
  open?:{timestamp?:string;userAgent?:string};click?:{timestamp?:string;link?:string;userAgent?:string};
  deliveryDelay?:{timestamp?:string;delayType?:string;expirationTime?:string;delayedRecipients?:SesDiagnosticRecipient[]};subscription?:{timestamp?:string};
  reject?:{reason?:string};failure?:{errorMessage?:string};
};
type Message={id:string;kind:string;campaign_id:string|null;campaign_recipient_id:string|null;contact_id:string|null;subscription_id:string|null;to_email:string};

function sanitizedEvent(event:SesEvent){const copy=JSON.parse(JSON.stringify(event)) as SesEvent;if(copy.mail){delete copy.mail.headers;delete copy.mail.commonHeaders;}return copy;}
function occurredAt(event:SesEvent){const value=event.delivery?.timestamp??event.bounce?.timestamp??event.complaint?.timestamp??event.open?.timestamp??event.click?.timestamp??event.deliveryDelay?.timestamp??event.subscription?.timestamp??event.mail?.timestamp;const date=value?new Date(value):new Date();return Number.isNaN(date.getTime())?new Date():date;}
function eventRecipients(event:SesEvent,type:string){const values=type==="bounced"?(event.bounce?.bouncedRecipients??[]).map(item=>item.emailAddress):type==="complained"?(event.complaint?.complainedRecipients??[]).map(item=>item.emailAddress):type==="delivery_delayed"?(event.deliveryDelay?.delayedRecipients??[]).map(item=>item.emailAddress):type==="delivered"?(event.delivery?.recipients??[]):event.mail?.destination??[];return new Set(values.filter(Boolean).map(value=>value!.toLowerCase()));}

export async function POST(request:Request){
  try{
    const raw=await request.text();if(Buffer.byteLength(raw,"utf8")>1_000_000)return NextResponse.json({error:"Payload demasiado grande"},{status:413});
    const envelope=JSON.parse(raw) as SnsEnvelope;await verifySnsEnvelope(envelope,request.headers.get("x-amz-sns-message-type"));
    if(envelope.Type==="SubscriptionConfirmation"){
      if(!envelope.SubscribeURL)return NextResponse.json({error:"Falta SubscribeURL"},{status:400});const url=new URL(envelope.SubscribeURL);if(url.protocol!=="https:"||!/^sns(?:\.[a-z0-9-]+)?\.amazonaws\.com(?:\.cn)?$/i.test(url.hostname))return NextResponse.json({error:"SubscribeURL no válida"},{status:400});
      const response=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:"error"});if(!response.ok)throw new Error("SNS rechazó la confirmación");return NextResponse.json({confirmed:true});
    }
    if(envelope.Type!=="Notification")return NextResponse.json({received:true});
    const event=JSON.parse(envelope.Message) as SesEvent;const rawType=(event.eventType??event.notificationType??"").toLowerCase().replace(/\s+/g,"");
    const typeMap:Record<string,string>={send:"sent",delivery:"delivered",open:"opened",click:"clicked",bounce:"bounced",complaint:"complained",reject:"rejected",renderingfailure:"failed",deliverydelay:"delivery_delayed",subscription:"unsubscribed"};const type=typeMap[rawType]??(rawType||"unknown");
    const[tracking]=await sql<{ses_tracking_source:"local"|"ses";mail_transport:"smtp"|"ses"}[]>`SELECT ses_tracking_source,mail_transport FROM settings WHERE id=1`;
    if(["opened","clicked"].includes(type)&&((env.mailTransport??tracking?.mail_transport)!=="ses"||tracking?.ses_tracking_source!=="ses"))return NextResponse.json({received:true,ignored:true,reason:"local_tracking_is_authoritative"});
    const taggedId=event.mail?.tags?.message_id?.[0];const providerId=event.mail?.messageId??null;
    const candidates=taggedId?await sql<Message[]>`SELECT id,kind,campaign_id,campaign_recipient_id,contact_id,subscription_id,to_email FROM outbound_messages WHERE id=${taggedId}`:providerId?await sql<Message[]>`SELECT id,kind,campaign_id,campaign_recipient_id,contact_id,subscription_id,to_email FROM outbound_messages WHERE ses_message_id=${providerId}`:[];
    const recipients=eventRecipients(event,type);const messages=recipients.size?candidates.filter(message=>recipients.has(message.to_email.toLowerCase())):candidates;
    if(!messages.length)return NextResponse.json({received:true,matched:false});
    const payload=sanitizedEvent(event);const automated=isAutomatedInteraction(event.click?.userAgent??event.open?.userAgent);const at=occurredAt(event);const campaignIds=new Set<string>();let inserted=0;
    for(const message of messages){
      const normalizedBounce=type==="bounced"?normalizeSesBounce(event.bounce,message.to_email):null;
      const normalizedDelay=type==="delivery_delayed"?normalizeSesDeliveryDelay(event.deliveryDelay,message.to_email):null;
      const storedPayload=JSON.parse(JSON.stringify(normalizedBounce||normalizedDelay?{...payload,normalized:normalizedBounce??normalizedDelay}:payload)) as never;
      const key=eventKey({sns_message_id:envelope.MessageId,type,message_id:message.id});
      await sql.begin(async tx=>{
        const[created]=await tx<{id:string}[]>`INSERT INTO email_events(event_key,message_id,recipient_id,campaign_id,contact_id,type,ses_message_id,link_url,source,payload,occurred_at,received_at,is_automated)VALUES(${key},${message.id},${message.campaign_recipient_id},${message.campaign_id},${message.contact_id},${type},${providerId},${event.click?.link??null},'ses',${tx.json(storedPayload)},${at},now(),${automated})ON CONFLICT(event_key)DO NOTHING RETURNING id`;if(!created)return;inserted++;
        if(type==="sent")await tx`
          UPDATE outbound_messages SET
            status=CASE
              WHEN status IN('accepted','queued','processing')
                OR (status='failed' AND failure_code IN('worker_error','transport_error','provider_acceptance_unconfirmed'))
              THEN 'sent'
              ELSE status
            END,
            ses_message_id=COALESCE(ses_message_id,${providerId}),sent_at=COALESCE(sent_at,${at}),
            failure_code=CASE WHEN status IN('accepted','queued','processing') OR (status='failed' AND failure_code IN('worker_error','transport_error','provider_acceptance_unconfirmed')) THEN NULL ELSE failure_code END,
            failure_reason=CASE WHEN status IN('accepted','queued','processing') OR (status='failed' AND failure_code IN('worker_error','transport_error','provider_acceptance_unconfirmed')) THEN NULL ELSE failure_reason END,
            updated_at=now()
          WHERE id=${message.id}
        `;
        if(type==="delivered")await tx`
          UPDATE outbound_messages SET status='delivered',ses_message_id=COALESCE(ses_message_id,${providerId}),
            sent_at=COALESCE(sent_at,${at}),delivered_at=COALESCE(delivered_at,${at}),
            failure_code=NULL,failure_reason=NULL,updated_at=now()
          WHERE id=${message.id} AND status NOT IN('bounced','complained','cancelled')
        `;
        if(type==="sent"||type==="delivered")await tx`
          UPDATE message_send_attempts SET status='succeeded',provider_message_id=COALESCE(provider_message_id,${providerId}),finished_at=COALESCE(finished_at,${at})
          WHERE id=(SELECT id FROM message_send_attempts WHERE message_id=${message.id} AND status='started' ORDER BY attempt_number DESC LIMIT 1)
        `;
        if(type==="delivery_delayed")await tx`UPDATE outbound_messages SET status='delayed',failure_code=${normalizedDelay?.failure_code??"delivery_delayed"},failure_reason=${normalizedDelay?.failure_reason??"Retraso temporal comunicado por SES"},updated_at=now() WHERE id=${message.id} AND status NOT IN('delivered','bounced','complained')`;
        if(type==="opened")await tx`UPDATE outbound_messages SET first_opened_at=COALESCE(first_opened_at,${at}),updated_at=now() WHERE id=${message.id}`;
        if(type==="clicked")await tx`UPDATE outbound_messages SET first_clicked_at=COALESCE(first_clicked_at,${at}),updated_at=now() WHERE id=${message.id}`;
        if(type==="bounced")await tx`UPDATE outbound_messages SET status='bounced',failure_code=${normalizedBounce?.failure_code??"undetermined_bounce"},failure_reason=${normalizedBounce?.failure_reason??"Rebote indeterminado comunicado por SES"},updated_at=now() WHERE id=${message.id}`;
        if(type==="complained")await tx`UPDATE outbound_messages SET status='complained',failure_code='complaint',failure_reason=${event.complaint?.complaintFeedbackType??"Queja comunicada por SES"},updated_at=now() WHERE id=${message.id}`;
        if((normalizedBounce?.should_suppress||type==="complained")){if(message.contact_id)await tx`UPDATE contacts SET status=${normalizedBounce?.should_suppress?"bounced":"complained"},updated_at=now() WHERE id=${message.contact_id} AND status<>'blocked'`;await tx`INSERT INTO suppressions(email,reason,source,scope,detail)VALUES(${message.to_email},${normalizedBounce?.should_suppress?"bounce":"complaint"},'ses','all',${tx.json({message_id:message.id,bounce_class:normalizedBounce?.bounce_class,bounce_type:event.bounce?.bounceType,bounce_subtype:event.bounce?.bounceSubType,bounce_recipient:normalizedBounce?.recipient,complaint_feedback_type:event.complaint?.complaintFeedbackType})})ON CONFLICT(lower(email),scope)DO UPDATE SET reason=EXCLUDED.reason,source='ses',detail=EXCLUDED.detail,status='active',resolved_at=NULL,resolved_by=NULL,resolution_note='',updated_at=now() WHERE suppressions.reason NOT IN('privacy','merged')`;}
        if(type==="rejected"||type==="failed")await tx`UPDATE outbound_messages SET status='failed',failure_code=${type},failure_reason=${event.reject?.reason??event.failure?.errorMessage??"SES no pudo procesar el mensaje"},updated_at=now() WHERE id=${message.id}`;
        if(type==="unsubscribed"&&message.subscription_id){const[changed]=await tx`UPDATE subscriptions SET status='unsubscribed',unsubscribed_at=COALESCE(unsubscribed_at,now()),updated_at=now() WHERE id=${message.subscription_id} AND status<>'unsubscribed' RETURNING contact_id,list_id`;if(changed)await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text)VALUES(${changed.contact_id},${message.subscription_id},${changed.list_id},'unsubscribed','ses','Baja notificada por SES')`;}
        if(message.campaign_recipient_id){if(type==="sent")await tx`UPDATE campaign_recipients SET status=CASE WHEN status IN('pending','queued','processing') THEN 'sent' ELSE status END,ses_message_id=COALESCE(ses_message_id,${providerId}),sent_at=COALESCE(sent_at,${at}),processing_at=NULL,updated_at=now() WHERE id=${message.campaign_recipient_id}`;if(type==="delivered")await tx`UPDATE campaign_recipients SET status='delivered',ses_message_id=COALESCE(ses_message_id,${providerId}),sent_at=COALESCE(sent_at,${at}),delivered_at=COALESCE(delivered_at,${at}),processing_at=NULL,updated_at=now() WHERE id=${message.campaign_recipient_id} AND status NOT IN('bounced','complained','unsubscribed')`;if(type==="opened")await tx`UPDATE campaign_recipients SET opened_at=COALESCE(opened_at,${at}),open_count=open_count+1 WHERE id=${message.campaign_recipient_id}`;if(type==="clicked")await tx`UPDATE campaign_recipients SET clicked_at=COALESCE(clicked_at,${at}),click_count=click_count+1 WHERE id=${message.campaign_recipient_id}`;if(type==="bounced")await tx`UPDATE campaign_recipients SET status='bounced',failure_reason=${normalizedBounce?.failure_reason??"Rebote comunicado por SES"},updated_at=now() WHERE id=${message.campaign_recipient_id}`;if(type==="complained"||type==="unsubscribed")await tx`UPDATE campaign_recipients SET status=${type},updated_at=now() WHERE id=${message.campaign_recipient_id}`;if(type==="rejected"||type==="failed")await tx`UPDATE campaign_recipients SET status='failed',failure_reason=${event.reject?.reason??event.failure?.errorMessage??"SES no pudo procesar el mensaje"} WHERE id=${message.campaign_recipient_id}`;}
      });
      if(message.campaign_id)campaignIds.add(message.campaign_id);
    }
    for(const campaignId of campaignIds)await recomputeCampaignStats(campaignId);
    return NextResponse.json({received:true,matched:true,messages:messages.length,inserted,duplicate:inserted===0});
  }catch(error){console.error("SES/SNS event rejected",error);return NextResponse.json({error:"Notificación SNS inválida"},{status:400});}
}
