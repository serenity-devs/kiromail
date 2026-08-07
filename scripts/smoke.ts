import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_APP_URL ?? "http://localhost:3100";
const mailpitUrl = process.env.SMOKE_MAILPIT_URL ?? "http://localhost:8026";
let cookie = "";
let campaignId = "";
let contactId = "";
let listId = "";

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
  });
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

try {
  const login = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@serenity.local", password: "serenity-local-2026" }) });
  assert.equal(login.status, 200, "login should succeed");
  cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.ok(cookie, "login should set a session cookie");

  const initial = await request<{ templates: { id: string; subject: string }[] }>("/api/bootstrap");
  assert.ok(initial.templates.length > 0, "seed should provide a template");
  await request("/api/test-email", { method: "POST", body: JSON.stringify({ template_id: initial.templates[0].id, email: "smoke-test@example.com", subject: "Plantilla de prueba", from_name: "Serenity Mail", from_email: "hola@serenity.local", reply_to: "hola@serenity.local" }) });

  const list = await request<{ id: string }>("/api/lists", { method: "POST", body: JSON.stringify({ name: "Smoke test", description: "Temporal", color: "#315c5b" }) });
  listId = list.id;
  const contact = await request<{ id: string }>("/api/contacts", { method: "POST", body: JSON.stringify({ email: `smoke-${Date.now()}@example.com`, first_name: "Prueba", last_name: "Local", status: "subscribed", listIds: [listId], tagIds: [] }) });
  contactId = contact.id;
  const campaign = await request<{ id: string }>("/api/campaigns", { method: "POST", body: JSON.stringify({ name: "Prueba integral local", subject: "Correo local para {{first_name}}", preview_text: "Comprobación automática", from_name: "Serenity Mail", from_email: "hola@serenity.local", reply_to: "hola@serenity.local", template_id: initial.templates[0].id, target_type: "list", target_id: listId, scheduled_at: null }) });
  campaignId = campaign.id;
  const started = await request<{ recipients: number }>(`/api/campaigns/${campaignId}/action`, { method: "POST", body: JSON.stringify({ action: "send" }) });
  assert.equal(started.recipients, 1, "campaign should snapshot exactly one contact");

  let completed = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const state = await request<{ campaigns: { id: string; status: string; delivered_count: number }[] }>("/api/bootstrap");
    const current = state.campaigns.find((item) => item.id === campaignId);
    if (current?.status === "completed" && current.delivered_count === 1) { completed = true; break; }
  }
  assert.ok(completed, "worker should deliver the campaign through Mailpit");

  const mailbox = await fetch(`${mailpitUrl}/api/v1/messages`).then((response) => response.json()) as { messages?: { Subject?: string }[] };
  assert.ok(mailbox.messages?.some((message) => message.Subject === "Correo local para Prueba"), "Mailpit should contain the rendered message");
  assert.ok(mailbox.messages?.some((message) => message.Subject === "[PRUEBA] Plantilla de prueba"), "Mailpit should contain the test delivery");
  console.log("Smoke test passed: login, persistence, queue, worker and local delivery are operational");
} finally {
  if (campaignId) await request("/api/campaigns", { method: "DELETE", body: JSON.stringify({ id: campaignId }) }).catch(() => undefined);
  if (contactId) await request("/api/contacts", { method: "DELETE", body: JSON.stringify({ id: contactId }) }).catch(() => undefined);
  if (listId) await request("/api/lists", { method: "DELETE", body: JSON.stringify({ id: listId }) }).catch(() => undefined);
}
