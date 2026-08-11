import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";
import { productionConfigurationChecks } from "@/lib/config";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await hasSession()) redirect("/");
  const { production } = productionConfigurationChecks();
  return <LoginForm localMode={!production} />;
}
