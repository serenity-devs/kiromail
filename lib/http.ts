import { NextResponse } from "next/server";
import { hasSession } from "./auth";

export async function requireApiSession(requiredScope?: string) {
  if (!(await hasSession(requiredScope))) return NextResponse.json({ error: requiredScope ? "No tienes permiso para esta operación" : "Sesión caducada" }, { status: requiredScope ? 403 : 401 });
  return null;
}

export function apiError(error: unknown) {
  console.error(error);
  const message = error instanceof Error ? error.message : "Error inesperado";
  return NextResponse.json({ error: message }, { status: 400 });
}
