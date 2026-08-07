import { sql } from "./db";

export type ListFieldDefinition = {
  id: string;
  key: string;
  label: string;
  type: "text" | "textarea" | "integer" | "decimal" | "date" | "datetime" | "boolean" | "select" | "multiselect" | "email" | "url";
  required: boolean;
  options: unknown[];
  validation: Record<string, unknown>;
};

function isEmpty(value: unknown) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function validDate(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export async function validateListValues(listId: string, values: Record<string, unknown>, requireRequired = true) {
  const fields = await sql<ListFieldDefinition[]>`
    SELECT id, key, label, type, required, options, validation FROM list_fields WHERE list_id=${listId} AND status='active' ORDER BY position
  `;
  const definitions = new Map(fields.map((field) => [field.key, field]));
  const errors: { field: string; message: string }[] = [];
  for (const key of Object.keys(values)) if (!definitions.has(key)) errors.push({ field: key, message: "Campo no definido en esta lista" });
  for (const field of fields) {
    const value = values[field.key];
    if (requireRequired && field.required && isEmpty(value)) { errors.push({ field: field.key, message: "Campo obligatorio" }); continue; }
    if (isEmpty(value)) continue;
    const options = Array.isArray(field.options) ? field.options.map(String) : [];
    const valid = (() => {
      switch (field.type) {
        case "integer": return typeof value === "number" && Number.isInteger(value);
        case "decimal": return typeof value === "number" && Number.isFinite(value);
        case "boolean": return typeof value === "boolean";
        case "date": return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && validDate(value);
        case "datetime": return validDate(value);
        case "email": return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        case "url": { try { const url = new URL(String(value)); return ["http:", "https:"].includes(url.protocol); } catch { return false; } }
        case "select": return ["string", "number"].includes(typeof value) && (!options.length || options.includes(String(value)));
        case "multiselect": return Array.isArray(value) && value.every((item) => ["string", "number"].includes(typeof item) && (!options.length || options.includes(String(item))));
        default: return typeof value === "string";
      }
    })();
    if (!valid) errors.push({ field: field.key, message: `Valor no válido para ${field.type}` });
  }
  return { valid: errors.length === 0, errors, fields };
}
