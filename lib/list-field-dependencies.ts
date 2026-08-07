export type FieldDependencies = {
  segments: { id: string; name: string; status: string }[];
  import_jobs: number;
  templates: { id: string; name: string }[];
};

export function segmentUsesListField(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => segmentUsesListField(item, key));
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.field === "list_field" && record.field_key === key) return true;
  return Object.values(record).some((item) => segmentUsesListField(item, key));
}

export function importUsesListField(input: unknown, listId: string, key: string) {
  if (!input || typeof input !== "object") return false;
  const record = input as { list_id?: unknown; mapping?: unknown };
  if (record.list_id !== listId || !record.mapping || typeof record.mapping !== "object") return false;
  return Object.values(record.mapping as Record<string, unknown>).includes(`field:${key}`);
}

export function templateUsesListField(content: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`{{\\s*(?:fields\\.)?${escaped}\\s*}}`, "i").test(content);
}
