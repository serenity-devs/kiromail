import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth";
import { TemplateEditor } from "@/components/template-editor";
export const dynamic="force-dynamic";
export default async function EditTemplatePage({params}:{params:Promise<{id:string}>}){if(!(await hasSession()))redirect("/login");const{id}=await params;return<TemplateEditor templateId={id}/>;}
