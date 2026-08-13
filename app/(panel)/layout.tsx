import { redirect } from "next/navigation";
import { MailApp } from "@/components/mail-app";
import { hasSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await hasSession())) redirect("/login");
  return (
    <>
      {children}
      <MailApp />
    </>
  );
}
