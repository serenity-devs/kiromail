import { sql } from "./db";
import { personalize, type Personalization } from "./email";

export type TemplateVersion = {
  id: string;
  template_id: string;
  version_number: number;
  status: "draft" | "published" | "archived";
  source_format: "html" | "visual";
  subject: string;
  preview_text: string;
  html_content: string;
  text_content: string;
  visual_document: Record<string, unknown> | null;
  variables_schema: Record<string, { type?: string; required?: boolean; default?: unknown }>;
  created_at: Date;
  published_at: Date | null;
};

const campaignVariables = new Set(["unsubscribe_url", "preferences_url", "physical_address"]);

export function templateDiagnostics(version: Pick<TemplateVersion, "subject" | "html_content" | "text_content" | "variables_schema">) {
  const errors: { code: string; message: string }[] = [];
  const warnings: { code: string; message: string }[] = [];
  if (!version.subject.trim()) errors.push({ code: "subject_missing", message: "Falta el asunto" });
  if (!version.html_content.trim()) errors.push({ code: "html_missing", message: "Falta el HTML" });
  if (/<\s*(script|iframe|object|embed|form)\b/i.test(version.html_content) || /\son[a-z]+\s*=/i.test(version.html_content) || /javascript\s*:/i.test(version.html_content)) {
    errors.push({ code: "unsafe_html", message: "El HTML contiene elementos o atributos peligrosos" });
  }
  const used = new Set([...`${version.subject} ${version.html_content} ${version.text_content}`.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map((match) => match[1]));
  for (const key of used) if (!campaignVariables.has(key) && !(key in (version.variables_schema ?? {}))) warnings.push({ code: "variable_undocumented", message: `La variable ${key} no está declarada` });
  if (!version.text_content.trim()) warnings.push({ code: "text_missing", message: "El texto plano se generará al enviar" });
  const html=version.html_content;
  for(const match of html.matchAll(/<img\b([^>]*)>/gi)){const attributes=match[1];if(!/\balt\s*=\s*["'][^"']*["']/i.test(attributes))warnings.push({code:"image_alt_missing",message:"Hay una imagen sin atributo alt"});}
  for(const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']*)["']/gi)){const href=match[1].trim();if(!href||href==="#")warnings.push({code:"link_empty",message:"Hay un enlace sin destino"});else if(/^javascript:/i.test(href))errors.push({code:"link_unsafe",message:"Hay un enlace JavaScript no permitido"});else if(/^http:\/\//i.test(href))warnings.push({code:"link_http",message:"Hay un enlace o recurso HTTP sin cifrar"});}
  if(/<(?:img|source)\b[^>]+(?:src|srcset)=["']http:\/\//i.test(html))warnings.push({code:"resource_http",message:"Hay recursos servidos por HTTP"});
  const headingCount=(html.match(/<h1\b/gi)??[]).length;if(headingCount===0)warnings.push({code:"heading_missing",message:"El email no tiene un título principal h1"});if(headingCount>1)warnings.push({code:"heading_multiple",message:"El email tiene más de un título h1"});
  if(/(?:display\s*:\s*(?:flex|grid)|position\s*:\s*(?:fixed|absolute)|<video\b|<svg\b)/i.test(html))warnings.push({code:"client_compatibility",message:"El HTML usa técnicas con soporte desigual en Outlook"});
  const byteSize=Buffer.byteLength(html,"utf8");if(byteSize>102_400)warnings.push({code:"gmail_clip_risk",message:`El HTML ocupa ${Math.ceil(byteSize/1024)} KB y puede recortarse en Gmail`});
  const visibleText=html.replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/&\w+;/g," ").replace(/\s+/g," ").trim();const imageCount=(html.match(/<img\b/gi)??[]).length;if(imageCount>=2&&visibleText.length<120)warnings.push({code:"image_heavy",message:"El mensaje depende demasiado de imágenes"});
  return { valid: errors.length === 0, errors, warnings, used_variables: [...used],html_bytes:byteSize,compatibility_profile:"gmail-apple-outlook-baseline-v1" };
}

export async function resolveTemplateVersion(input: { templateKey?: string; versionId?: string }) {
  const rows = input.versionId
    ? await sql<TemplateVersion[]>`SELECT * FROM template_versions WHERE id=${input.versionId}`
    : await sql<TemplateVersion[]>`
        SELECT v.* FROM templates t JOIN template_versions v ON v.id=t.published_version_id
        WHERE t.key=${input.templateKey ?? ""} AND t.status='published'
      `;
  return rows[0] ?? null;
}

export function renderTemplateVersion(version: TemplateVersion, variables: Record<string, string | number | boolean | null>) {
  const resolved: Record<string, string | number | null | undefined> = {};
  for (const [key, definition] of Object.entries(version.variables_schema ?? {})) {
    const value = variables[key] ?? definition.default;
    if (definition.required && (value === undefined || value === null || value === "")) throw new Error(`Falta la variable obligatoria ${key}`);
    resolved[key] = value === true ? "true" : value === false ? "false" : value as string | number | null | undefined;
  }
  for (const [key, value] of Object.entries(variables)) resolved[key] = value === true ? "true" : value === false ? "false" : value;
  return {
    subject: personalize(version.subject, resolved as Personalization),
    preview_text: personalize(version.preview_text, resolved as Personalization),
    html: personalize(version.html_content, resolved as Personalization),
    text: personalize(version.text_content, resolved as Personalization),
    variables: resolved,
  };
}
