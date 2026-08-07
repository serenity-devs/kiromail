import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await hasSession()) redirect("/");
  return <LoginForm />;
}
