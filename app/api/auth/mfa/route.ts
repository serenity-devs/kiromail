import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decryptTotpSecret, encryptTotpSecret, generateRecoveryCodes, generateTotpSecret, matchRecoveryCode, totpSetup, verifyTotp } from "@/lib/mfa";
import { verifyPassword } from "@/lib/passwords";

const codeSchema = z.object({ code: z.string().trim().min(6).max(32) });
const disableSchema = codeSchema.extend({ password: z.string().min(1).max(512) });

async function currentMfaUser() {
  const session = await getCurrentSession();
  if (!session) return null;
  const [user] = await sql<{id:string;email:string;password_hash:string;mfa_enabled:boolean;mfa_secret_encrypted:string|null;mfa_recovery_codes:string[]}[]>`
    SELECT id,email,password_hash,mfa_enabled,mfa_secret_encrypted,mfa_recovery_codes FROM users WHERE id=${session.user.id} AND status='active'
  `;
  return user ? { session, user } : null;
}

function requestId(request: Request) {
  return request.headers.get("x-request-id");
}

export async function GET() {
  const current = await currentMfaUser();
  if (!current) return NextResponse.json({error:"Sesión caducada"},{status:401});
  return NextResponse.json({enabled:current.user.mfa_enabled,recovery_codes_remaining:current.user.mfa_recovery_codes?.length??0},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request: Request) {
  const current = await currentMfaUser();
  if (!current) return NextResponse.json({error:"Sesión caducada"},{status:401});
  if (current.user.mfa_enabled) return NextResponse.json({error:"La verificación en dos pasos ya está activa"},{status:409});
  const secret = generateTotpSecret();
  await sql`UPDATE users SET mfa_secret_encrypted=${encryptTotpSecret(secret)},mfa_recovery_codes='[]'::jsonb,updated_at=now() WHERE id=${current.user.id}`;
  await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,request_id,detail)VALUES('mfa_setup_started','user',${current.user.id},${current.user.id},${requestId(request)},'{}')`;
  return NextResponse.json(await totpSetup(secret,current.user.email),{headers:{"Cache-Control":"private, no-store"}});
}

export async function PUT(request: Request) {
  const current = await currentMfaUser();
  if (!current) return NextResponse.json({error:"Sesión caducada"},{status:401});
  if (current.user.mfa_enabled) return NextResponse.json({error:"La verificación en dos pasos ya está activa"},{status:409});
  const input = codeSchema.safeParse(await request.json().catch(()=>null));
  if (!input.success) return NextResponse.json({error:"Introduce un código de seis cifras"},{status:422});
  if (!current.user.mfa_secret_encrypted || !verifyTotp(decryptTotpSecret(current.user.mfa_secret_encrypted),input.data.code)) return NextResponse.json({error:"El código no es válido; comprueba la hora del dispositivo"},{status:422});
  const recovery = generateRecoveryCodes();
  await sql.begin(async tx=>{
    await tx`UPDATE users SET mfa_enabled=true,mfa_enabled_at=now(),mfa_recovery_codes=${tx.json(recovery.hashes)},updated_at=now() WHERE id=${current.user.id}`;
    await tx`UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=${current.user.id} AND id<>${current.session.id} AND revoked_at IS NULL`;
    await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,request_id,detail)VALUES('mfa_enabled','user',${current.user.id},${current.user.id},${requestId(request)},${tx.json({recovery_codes:recovery.codes.length})})`;
  });
  return NextResponse.json({enabled:true,recovery_codes:recovery.codes},{headers:{"Cache-Control":"private, no-store"}});
}

export async function DELETE(request: Request) {
  const current = await currentMfaUser();
  if (!current) return NextResponse.json({error:"Sesión caducada"},{status:401});
  if (!current.user.mfa_enabled || !current.user.mfa_secret_encrypted) return NextResponse.json({error:"La verificación en dos pasos no está activa"},{status:409});
  const input = disableSchema.safeParse(await request.json().catch(()=>null));
  if (!input.success) return NextResponse.json({error:"Confirma contraseña y código"},{status:422});
  const passwordValid = await verifyPassword(input.data.password,current.user.password_hash);
  const totpValid = verifyTotp(decryptTotpSecret(current.user.mfa_secret_encrypted),input.data.code);
  const recoveryValid = matchRecoveryCode(current.user.mfa_recovery_codes??[],input.data.code)>=0;
  if (!passwordValid || (!totpValid&&!recoveryValid)) return NextResponse.json({error:"La contraseña o el código no son válidos"},{status:422});
  await sql.begin(async tx=>{
    await tx`UPDATE users SET mfa_enabled=false,mfa_enabled_at=NULL,mfa_secret_encrypted=NULL,mfa_recovery_codes='[]'::jsonb,updated_at=now() WHERE id=${current.user.id}`;
    await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,request_id,detail)VALUES('mfa_disabled','user',${current.user.id},${current.user.id},${requestId(request)},'{}')`;
  });
  return NextResponse.json({enabled:false});
}
