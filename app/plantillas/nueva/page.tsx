import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";
import { TemplateEditor } from "@/components/template-editor";
export const dynamic="force-dynamic";
export default async function NewTemplatePage(){if(!(await hasSession()))redirect("/login");return<TemplateEditor/>;}
