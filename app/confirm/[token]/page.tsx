import { resolvePublicToken } from "@/lib/public-preferences";

export default async function ConfirmPage({params}:{params:Promise<{token:string}>}){
  const{token}=await params;const valid=await resolvePublicToken(decodeURIComponent(token),"confirm",true);
  return <main className="public-page"><section className="public-card"><div className="brand-mark brand-mark-large" aria-hidden="true" /><p className="eyebrow">Confirmación de suscripción</p><h1>{valid?"Solo falta confirmar tu email":"Este enlace no es válido"}</h1><p>{valid?"Pulsa el botón para activar esta suscripción. El resto de tus newsletters no cambiará.":"El enlace puede haber caducado, haberse usado ya o haber sido revocado."}</p>{valid&&<form action="/api/public/confirm" method="post"><input type="hidden" name="token" value={token}/><button className="button button-primary button-wide" type="submit">Confirmar suscripción</button></form>}</section></main>;
}
