export const apiKeyScopes = [
  "*",
  "lists:read",
  "lists:write",
  "contacts:read",
  "contacts:write",
  "templates:read",
  "templates:write",
  "campaigns:read",
  "campaigns:write",
  "campaigns:send",
  "campaigns:approve",
  "transactional:send",
  "transactional:read",
  "events:read",
  "reports:read",
  "webhooks:read",
  "webhooks:write",
] as const;

export type ApiKeyScope = (typeof apiKeyScopes)[number];

export const apiKeyScopeGroups: {
  label: string;
  description: string;
  scopes: { id: ApiKeyScope; label: string }[];
}[] = [
  {
    label: "Acceso total",
    description: "Solo para integraciones de confianza que necesiten administrar toda la API.",
    scopes: [{ id: "*", label: "Todos los permisos" }],
  },
  {
    label: "Audiencias",
    description: "Listas, campos propios, contactos, suscripciones y supresiones.",
    scopes: [
      { id: "lists:read", label: "Leer listas y segmentos" },
      { id: "lists:write", label: "Gestionar listas y segmentos" },
      { id: "contacts:read", label: "Leer contactos" },
      { id: "contacts:write", label: "Gestionar contactos y suscripciones" },
    ],
  },
  {
    label: "Plantillas",
    description: "Biblioteca, versiones, bloques y recursos de email.",
    scopes: [
      { id: "templates:read", label: "Leer plantillas" },
      { id: "templates:write", label: "Crear y publicar plantillas" },
    ],
  },
  {
    label: "Campañas",
    description: "Creación, aprobación y lanzamiento de newsletters.",
    scopes: [
      { id: "campaigns:read", label: "Leer campañas" },
      { id: "campaigns:write", label: "Crear y editar campañas" },
      { id: "campaigns:send", label: "Programar y enviar campañas" },
      { id: "campaigns:approve", label: "Aprobar campañas" },
    ],
  },
  {
    label: "Transaccionales e informes",
    description: "Envío operativo, consulta de mensajes, eventos y métricas.",
    scopes: [
      { id: "transactional:send", label: "Enviar emails transaccionales" },
      { id: "transactional:read", label: "Consultar emails transaccionales" },
      { id: "events:read", label: "Consultar eventos" },
      { id: "reports:read", label: "Consultar informes" },
    ],
  },
  {
    label: "Webhooks",
    description: "Destinos que reciben eventos firmados de KiroMail.",
    scopes: [
      { id: "webhooks:read", label: "Leer webhooks" },
      { id: "webhooks:write", label: "Gestionar webhooks" },
    ],
  },
];

export const apiKeyScopeLabels = Object.fromEntries(
  apiKeyScopeGroups.flatMap((group) =>
    group.scopes.map((scope) => [scope.id, scope.label]),
  ),
) as Record<ApiKeyScope, string>;
