import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";
import { MailApp } from "@/components/mail-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await hasSession())) redirect("/login");
  return <MailApp />;
}
