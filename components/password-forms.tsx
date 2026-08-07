"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Mail } from "lucide-react";

export function ForgotPasswordForm() {
  const [email,setEmail]=useState("");const[busy,setBusy]=useState(false);const[message,setMessage]=useState("");
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);const response=await fetch("/api/auth/password/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});const result=await response.json();setMessage(result.message??"Si existe la cuenta, recibirás un enlace.");setBusy(false);}
  return <main className="password-page"><form className="password-card" onSubmit={submit}><span className="password-icon"><Mail size={24}/></span><p className="eyebrow">Recuperar acceso</p><h1>Te enviamos un enlace.</h1><p>Introduce el correo de tu usuario. La respuesta será la misma exista o no la cuenta.</p>{message?<div className="password-success"><CheckCircle2 size={20}/><span>{message}</span></div>:<><label>Correo electrónico<input type="email" value={email} onChange={event=>setEmail(event.target.value)} required autoFocus/></label><button className="button button-primary button-wide" disabled={busy}>{busy?"Preparando…":"Enviar enlace"}<ArrowRight size={16}/></button></>}<Link href="/login"><ArrowLeft size={14}/> Volver al acceso</Link></form></main>;
}

export function ResetPasswordForm({token}:{token:string}){
  const router=useRouter();const[password,setPassword]=useState("");const[confirm,setConfirm]=useState("");const[busy,setBusy]=useState(false);const[error,setError]=useState("");
  async function submit(event:React.FormEvent){event.preventDefault();if(password!==confirm){setError("Las contraseñas no coinciden");return;}setBusy(true);setError("");const response=await fetch("/api/auth/password/reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,password})});const result=await response.json();if(!response.ok){setError(result.error??"No se pudo cambiar");setBusy(false);return;}router.replace("/login?reset=1");router.refresh();}
  return <main className="password-page"><form className="password-card" onSubmit={submit}><span className="password-icon"><KeyRound size={24}/></span><p className="eyebrow">Nueva contraseña</p><h1>Recupera tu cuenta.</h1><p>El enlace es de un solo uso. Al guardar se cerrarán todas las sesiones anteriores.</p><label>Nueva contraseña<input type="password" minLength={12} maxLength={512} value={password} onChange={event=>setPassword(event.target.value)} required autoFocus/><small>Mínimo 12 caracteres.</small></label><label>Repetir contraseña<input type="password" minLength={12} maxLength={512} value={confirm} onChange={event=>setConfirm(event.target.value)} required/></label>{error&&<p className="form-error">{error}</p>}<button className="button button-primary button-wide" disabled={busy}>{busy?"Guardando…":"Guardar contraseña"}<ArrowRight size={16}/></button><Link href="/login"><ArrowLeft size={14}/> Volver al acceso</Link></form></main>;
}
