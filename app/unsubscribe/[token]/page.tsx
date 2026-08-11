import { readUnsubscribeToken } from "@/lib/auth";
import { loadPublicUnsubscribe } from "@/lib/public-preferences";

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decoded=decodeURIComponent(token);
  const modern=await loadPublicUnsubscribe(decoded);
  const legacy=modern?null:readUnsubscribeToken(decoded);
  const valid=Boolean(modern||legacy);
  return (
    <main className="public-page">
      <section className="public-card">
        <div className="brand-mark brand-mark-large" aria-hidden="true" />
        <p className="eyebrow">Preferencias de correo</p>
        <h1>{valid ? "¿Quieres dejar de recibir esta lista?" : "Este enlace ya no es válido"}</h1>
        <p>{valid ? modern?`Daremos de baja ${modern.email} únicamente de «${modern.list_name}». Las demás suscripciones seguirán como están.`:`Daremos de baja ${legacy!.email} de la lista asociada a esta campaña.` : "El enlace puede estar incompleto, haber caducado o haber sido revocado."}</p>
        {valid && (
          <form action={`/api/unsubscribe?token=${encodeURIComponent(token)}`} method="post">
            <button className="button button-primary button-wide" type="submit">Confirmar la baja</button>
          </form>
        )}
      </section>
    </main>
  );
}
