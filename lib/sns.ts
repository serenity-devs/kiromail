import { createVerify, X509Certificate } from "node:crypto";
import { env } from "./config";

export type SnsEnvelope = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: "1" | "2";
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
};

const certificates = new Map<string,{pem:string;expiresAt:number}>();

export function validSnsCertificateUrl(value:string){
  try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&/^sns(?:\.[a-z0-9-]+)?\.amazonaws\.com(?:\.cn)?$/i.test(url.hostname)&&/^\/SimpleNotificationService-[A-Za-z0-9_-]+\.pem$/.test(url.pathname);}catch{return false;}
}

export function snsStringToSign(envelope:SnsEnvelope){
  const names=envelope.Type==="Notification"?["Message","MessageId",...(envelope.Subject!==undefined?["Subject"]:[]),"Timestamp","TopicArn","Type"]:["Message","MessageId","SubscribeURL","Timestamp","Token","TopicArn","Type"];
  return names.map(name=>`${name}\n${String(envelope[name as keyof SnsEnvelope]??"")}\n`).join("");
}

async function certificate(url:string){
  const cached=certificates.get(url);if(cached&&cached.expiresAt>Date.now())return cached.pem;
  const response=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:"error"});if(!response.ok)throw new Error("No se pudo obtener el certificado SNS");const pem=await response.text();if(pem.length>100_000)throw new Error("Certificado SNS no válido");
  const x509=new X509Certificate(pem);const now=Date.now();if(now<Date.parse(x509.validFrom)||now>Date.parse(x509.validTo))throw new Error("Certificado SNS caducado o todavía no válido");certificates.set(url,{pem,expiresAt:Math.min(Date.parse(x509.validTo),now+3_600_000)});return pem;
}

export async function verifySnsEnvelope(envelope:SnsEnvelope,headerType:string|null){
  if(!["Notification","SubscriptionConfirmation","UnsubscribeConfirmation"].includes(envelope.Type))throw new Error("Tipo SNS no permitido");
  if(headerType&&headerType!==envelope.Type)throw new Error("El tipo SNS de cabecera no coincide");
  if(!["1","2"].includes(envelope.SignatureVersion))throw new Error("Versión de firma SNS no admitida");
  if(!validSnsCertificateUrl(envelope.SigningCertURL))throw new Error("URL de certificado SNS no válida");
  if(!env.snsTopicArns.length)throw new Error("Configura SNS_TOPIC_ARNS antes de aceptar eventos SES");
  if(!env.snsTopicArns.includes(envelope.TopicArn))throw new Error("TopicArn SNS no autorizado");
  const pem=await certificate(envelope.SigningCertURL);const verifier=createVerify(envelope.SignatureVersion==="2"?"RSA-SHA256":"RSA-SHA1");verifier.update(snsStringToSign(envelope),"utf8");verifier.end();if(!verifier.verify(pem,Buffer.from(envelope.Signature,"base64")))throw new Error("Firma SNS no válida");return true;
}
