"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check, Clipboard, Download, ExternalLink, Search, ShieldCheck, Terminal } from "lucide-react";

type ApiOperation = {
  summary: string;
  description?: string;
  tags?: readonly string[];
  "x-required-scope"?: string;
  parameters?: readonly { name?: string; in?: string; required?: boolean; description?: string }[];
  requestBody?: unknown;
  responses?: Record<string, { description?: string }>;
};
type ApiDocument = {
  info: { title: string; version: string; description: string };
  tags: readonly { name: string; description?: string }[];
  paths: Record<string, Record<string, ApiOperation>>;
};
type Example = { id: string; label: string; method: string; path: string; scope: string; body: Record<string, unknown> };

const methods = ["get", "post", "patch", "put", "delete"];
const examples: Example[] = [
  { id: "transactional", label: "Email transaccional", method: "POST", path: "/api/v1/transactional/send", scope: "transactional:send", body: { to: { email: "cliente@example.com", name: "Ana" }, subject: "Tu pedido está confirmado", html: "<h1>Pedido confirmado</h1><p>Gracias por tu compra.</p>", text: "Pedido confirmado. Gracias por tu compra.", metadata: { order_id: "A-1042" } } },
  { id: "list", label: "Lista con campos", method: "POST", path: "/api/v1/lists", scope: "lists:write", body: { key: "agenda_cultural", name: "Agenda cultural", double_opt_in: true, fields: [{ key: "frecuencia", label: "Frecuencia", type: "select", options: ["semanal", "mensual"], visibility: "preference_center" }] } },
  { id: "template", label: "Plantilla HTML", method: "POST", path: "/api/v1/templates", scope: "templates:write", body: { key: "pedido_confirmado", name: "Pedido confirmado", channel: "transactional", subject: "Pedido {{numero}} confirmado", html: "<h1>Gracias, {{nombre}}</h1>", text: "Gracias, {{nombre}}", variables_schema: { numero: { type: "string", required: true }, nombre: { type: "string", required: true } }, publish: true } },
  { id: "campaign", label: "Campaña HTML", method: "POST", path: "/api/v1/campaigns", scope: "campaigns:write", body: { name: "Newsletter agosto", list_id: "REEMPLAZA_POR_UUID", subject: "Novedades de agosto", content: { html: "<h1>Hola, {{first_name}}</h1>", text: "Hola, {{first_name}}" }, exclusion_segment_ids: [] } },
];

function codeFor(language: string, example: Example) {
  const body = JSON.stringify(example.body, null, 2);
  if (language === "JavaScript") return `const response = await fetch(\`${"${KIROMAIL_URL}"}${example.path}\`, {\n  method: "${example.method}",\n  headers: {\n    "Authorization": \`Bearer ${"${KIROMAIL_TOKEN}"}\`,\n    "Content-Type": "application/json",\n    "Idempotency-Key": crypto.randomUUID()\n  },\n  body: JSON.stringify(${body.split("\n").join("\n  ")})\n});\n\nconst result = await response.json();\nif (!response.ok) throw new Error(result.error?.message);\nconsole.log(result);`;
  if (language === "PHP") return `<?php\n$body = ${body.replace(/\{/g, "[").replace(/\}/g, "]").replace(/: /g, " => ").replace(/\n/g, "\n")};\n\n$ch = curl_init(getenv('KIROMAIL_URL') . '${example.path}');\ncurl_setopt_array($ch, [\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_POST => true,\n  CURLOPT_HTTPHEADER => [\n    'Authorization: Bearer ' . getenv('KIROMAIL_TOKEN'),\n    'Content-Type: application/json',\n    'Idempotency-Key: ' . bin2hex(random_bytes(16))\n  ],\n  CURLOPT_POSTFIELDS => json_encode($body)\n]);\n$result = curl_exec($ch);\nif (curl_getinfo($ch, CURLINFO_HTTP_CODE) >= 400) throw new RuntimeException($result);\necho $result;`;
  if (language === "Python") return `import os\nimport uuid\nimport requests\n\nresponse = requests.${example.method.toLowerCase()}(\n    os.environ["KIROMAIL_URL"] + "${example.path}",\n    headers={\n        "Authorization": f"Bearer {os.environ['KIROMAIL_TOKEN']}",\n        "Idempotency-Key": str(uuid.uuid4()),\n    },\n    json=${body.replace(/true/g, "True").replace(/false/g, "False").replace(/null/g, "None")}\n)\nresponse.raise_for_status()\nprint(response.json())`;
  return `curl --request ${example.method} "$KIROMAIL_URL${example.path}" \\\n  --header "Authorization: Bearer $KIROMAIL_TOKEN" \\\n  --header "Content-Type: application/json" \\\n  --header "Idempotency-Key: $(uuidgen)" \\\n  --data '${body}'`;
}

export function ApiDocs({ document }: { document: unknown }) {
  const apiDocument = document as ApiDocument;
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("Todos");
  const [language, setLanguage] = useState("cURL");
  const [exampleId, setExampleId] = useState(examples[0].id);
  const [copied, setCopied] = useState(false);
  const endpoints = useMemo(() => Object.entries(apiDocument.paths).flatMap(([path, pathItem]) => Object.entries(pathItem).filter(([method]) => methods.includes(method)).map(([method, operation]) => ({ path, method: method.toUpperCase(), operation }))).filter(item => {
    const text = `${item.method} ${item.path} ${item.operation.summary}`.toLowerCase();
    return (tag === "Todos" || item.operation.tags?.includes(tag)) && text.includes(query.toLowerCase());
  }), [apiDocument.paths, query, tag]);
  const selectedExample = examples.find(item => item.id === exampleId) ?? examples[0];
  const code = codeFor(language, selectedExample);
  async function copyCode() { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1300); }

  return <div className="api-docs-shell">
    <header className="api-docs-topbar">
      <div className="api-docs-brand"><span className="brand-mark" aria-hidden="true"/><strong>KiroMail</strong><em>API</em></div>
      <div className="api-docs-actions"><a href="/api/openapi" target="_blank" rel="noreferrer"><ExternalLink size={15}/> Ver JSON</a><a href="/api/openapi?download=1"><Download size={15}/> Descargar OpenAPI</a><Link href="/"><ArrowLeft size={15}/> Volver a la aplicación</Link></div>
    </header>
    <main className="api-docs-main">
      <section className="api-docs-hero">
        <div><p className="eyebrow">Contrato OpenAPI 3.1</p><h1>{apiDocument.info.title}</h1><p>{apiDocument.info.description}</p><div className="api-docs-badges"><span><BookOpen size={14}/> v{apiDocument.info.version}</span><span><ShieldCheck size={14}/> Bearer token + scopes</span><span><Terminal size={14}/> JSON y multipart</span></div></div>
        <aside><strong>Inicio rápido</strong><code>Authorization: Bearer km_live_••••</code><p>Crea la clave en Ajustes. El secreto completo solo aparece una vez.</p></aside>
      </section>
      <section className="api-example-panel">
        <div className="api-example-copy"><p className="eyebrow">Ejemplos ejecutables</p><h2>Empieza con una petición real</h2><p>Define <code>KIROMAIL_URL</code> y <code>KIROMAIL_TOKEN</code>. Las operaciones sensibles incluyen una clave idempotente.</p><label>Flujo<select value={exampleId} onChange={event=>setExampleId(event.target.value)}>{examples.map(item=><option key={item.id} value={item.id}>{item.label} · {item.scope}</option>)}</select></label></div>
        <div className="api-code-card"><nav>{["cURL","JavaScript","PHP","Python"].map(item=><button key={item} className={language===item?"active":""} onClick={()=>setLanguage(item)}>{item}</button>)}<button className="copy-code" onClick={copyCode}>{copied?<Check size={14}/>:<Clipboard size={14}/>} {copied?"Copiado":"Copiar"}</button></nav><pre><code>{code}</code></pre></div>
      </section>
      <section className="api-reference-layout">
        <aside className="api-tag-nav"><strong>Secciones</strong><button className={tag==="Todos"?"active":""} onClick={()=>setTag("Todos")}>Todos <span>{Object.keys(apiDocument.paths).length}</span></button>{apiDocument.tags.map(item=><button key={item.name} className={tag===item.name?"active":""} onClick={()=>setTag(item.name)}>{item.name}</button>)}</aside>
        <div className="api-reference">
          <div className="api-reference-head"><div><p className="eyebrow">Referencia</p><h2>{tag === "Todos" ? "Todos los endpoints" : tag}</h2></div><label><Search size={16}/><input placeholder="Buscar ruta u operación…" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
          <div className="api-endpoint-list">{endpoints.map(item=><article className="api-endpoint" key={`${item.method}-${item.path}`}><header><span className={`api-method ${item.method.toLowerCase()}`}>{item.method}</span><code>{item.path}</code>{item.operation["x-required-scope"]&&<em>{item.operation["x-required-scope"]}</em>}</header><div><h3>{item.operation.summary}</h3>{item.operation.description&&<p>{item.operation.description}</p>}{item.operation.parameters?.length?<ul>{item.operation.parameters.map(parameter=><li key={`${parameter.in}-${parameter.name}`}><code>{parameter.name}</code><span>{parameter.in}{parameter.required?" · obligatorio":""}</span>{parameter.description}</li>)}</ul>:null}</div></article>)}</div>
          {!endpoints.length&&<div className="api-empty">No hay endpoints que coincidan con la búsqueda.</div>}
        </div>
      </section>
    </main>
  </div>;
}
