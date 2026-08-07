import { redirect } from "next/navigation";
import { ApiDocs } from "@/components/api-docs";
import { hasSession } from "@/lib/auth";
import { openApiDocument } from "@/lib/openapi";

export const dynamic = "force-dynamic";

export default async function ApiDocsPage() {
  if (!(await hasSession())) redirect("/login");
  return <ApiDocs document={openApiDocument} />;
}
