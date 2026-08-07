import { NextResponse } from "next/server";
import { getBootstrapData } from "@/lib/data";
import { getCurrentSession } from "@/lib/auth";
import { apiError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  try {
    const data = await getBootstrapData();
    return NextResponse.json({
      ...data,
      contacts: session.user.role === "analyst" ? [] : data.contacts,
      transactional: session.user.role === "analyst" ? [] : data.transactional,
      currentUser: session.user,
    });
  } catch (error) {
    return apiError(error);
  }
}
