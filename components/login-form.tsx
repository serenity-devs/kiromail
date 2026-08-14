"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, LockKeyhole, Mail, Server, ShieldCheck } from "lucide-react";

export function LoginForm({ localMode }: { localMode: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(localMode ? "admin@kiromail.local" : "");
  const [password, setPassword] = useState(localMode ? "kiromail-local-2026" : "");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, mfa_code: mfaCode || undefined }) });
    const result = await response.json();
    if (!response.ok) { if(result.code==="mfa_required")setMfaRequired(true);setError(result.error); setLoading(false); return; }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>KiroMail</span>
          <small><i aria-hidden="true" /> self-hosted</small>
        </div>
        <div className="login-copy">
          <p className="eyebrow light"><span aria-hidden="true">~/</span> email marketing, en tu terreno</p>
          <h1>Campañas claras.<br /><em>Sin ruido alrededor.</em></h1>
          <p>Tu audiencia, tus datos y tus envíos en una herramienta diseñada para trabajar con calma.</p>
          <div className="login-terminal" aria-hidden="true">
            <header>
              <span><i /><i /><i /></span>
              <code>kiro@mail:~</code>
              <b>online</b>
            </header>
            <div>
              <p><span>$</span> status --workspace</p>
              <dl>
                <div><dt>audiencia</dt><dd><CheckCircle2 size={13} /> base propia</dd></div>
                <div><dt>entrega</dt><dd><CheckCircle2 size={13} /> amazon ses</dd></div>
                <div><dt>control</dt><dd><CheckCircle2 size={13} /> infraestructura propia</dd></div>
              </dl>
              <p className="login-terminal-result">3 checks · todo preparado</p>
            </div>
          </div>
        </div>
        <div className="login-points">
          <span><ShieldCheck size={15} /> datos bajo tu control</span>
          <span><Server size={15} /> preparada para producción</span>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="login-form-topline"><span><i aria-hidden="true" /> secure_session</span><code>01</code></div>
          <div className="login-icon"><Mail size={25} /></div>
          <p className="eyebrow">Acceso privado</p>
          <h2>Qué alegría verte.</h2>
          <p className="muted">Entra en tu espacio de campañas.</p>
          <label>Correo electrónico<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {mfaRequired&&<label>Código de verificación<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9A-Fa-f-]{6,32}" value={mfaCode} onChange={(e)=>setMfaCode(e.target.value)} placeholder="123456" required autoFocus/><span>También puedes usar un código de recuperación.</span></label>}
          <Link className="forgot-link" href="/forgot-password">He olvidado mi contraseña</Link>
          {error && <p className="form-error">{error}</p>}
          <button className="button button-primary button-wide" disabled={loading}>{loading ? "Entrando…" : "Entrar"}<ArrowRight size={17} /></button>
          {localMode && <p className="local-hint">Credenciales locales incluidas para esta primera ejecución.</p>}
        </form>
        <p className="login-security"><LockKeyhole size={13} /> acceso cifrado · sesión privada</p>
      </section>
    </main>
  );
}
