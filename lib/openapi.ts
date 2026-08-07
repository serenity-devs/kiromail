type Schema = Record<string, unknown>;
type OperationOptions = {
  scope?: string;
  security?: Record<string, never[]>[];
  parameters?: Schema[];
  requestBody?: Schema;
  success?: string;
  status?: string;
  responseSchema?: Schema;
  responseContentType?: string;
  description?: string;
  etag?: boolean;
  concurrency?: boolean;
};

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const jsonBody = (schema: Schema, example?: unknown): Schema => ({
  required: true,
  content: { "application/json": { schema, ...(example === undefined ? {} : { example }) } },
});
const jsonResponse = (description: string, schema: Schema): Schema => ({
  description,
  content: { "application/json": { schema } },
});
const pathParameter = (name: string, description: string): Schema => ({
  name, in: "path", required: true, description, schema: { type: "string", format: "uuid" },
});
const queryParameter = (name: string, description: string, schema: Schema = { type: "string" }): Schema => ({
  name, in: "query", required: false, description, schema,
});
const idempotencyHeader: Schema = {
  name: "Idempotency-Key", in: "header", required: true,
  description: "Clave única por credencial y operación. Repetir la misma petición devuelve el recurso original.",
  schema: { type: "string", minLength: 1, maxLength: 200 },
};
const ifMatchHeader:Schema={name:"If-Match",in:"header",required:true,description:"ETag fuerte recibido al leer el recurso. Evita sobrescribir una revisión más reciente.",schema:{type:"string",pattern:'^"[^"\\s,]+:[^"\\s,]+:[1-9][0-9]*"$'}};
const listResponse = (item: Schema): Schema => ({ type: "object", properties: { data: { type: "array", items: item }, next_cursor: { type: ["string", "null"], format: "uuid" } } });

function operation(summary: string, tag: string, options: OperationOptions = {}): Schema {
  const status = options.status ?? "200";
  const successResponse:Schema=options.responseContentType?{description:options.success??"Operación completada",content:{[options.responseContentType]:{schema:options.responseSchema??{type:"string"}}}}:jsonResponse(options.success??"Operación completada",options.responseSchema??{type:"object",additionalProperties:true});
  if(options.etag||options.concurrency)successResponse.headers={ETag:{description:"Validador fuerte de la revisión devuelta",schema:{type:"string"}},"Cache-Control":{description:"Los recursos autenticados se revalidan de forma privada",schema:{type:"string",example:"private, no-cache"}}};
  const parameters=[...(options.parameters??[]),...(options.concurrency?[ifMatchHeader]:[])];
  return {
    summary,
    ...(options.description ? { description: options.description } : {}),
    operationId: `${tag.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${summary.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_")}`,
    tags: [tag],
    security: options.security ?? [{ bearerAuth: [] }],
    ...(options.scope ? { "x-required-scope": options.scope } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(options.requestBody ? { requestBody: options.requestBody } : {}),
    responses: {
      [status]: successResponse,
      "401": jsonResponse("Credencial ausente, inválida o sin permiso", ref("ErrorResponse")),
      "404": jsonResponse("Recurso no encontrado", ref("ErrorResponse")),
      "409": jsonResponse("Conflicto de estado o idempotencia", ref("ErrorResponse")),
      "422": jsonResponse("Datos no válidos", ref("ErrorResponse")),
      ...(options.concurrency?{"412":jsonResponse("El ETag ya no corresponde a la revisión actual",ref("ErrorResponse")),"428":jsonResponse("Falta la precondición If-Match",ref("ErrorResponse"))}:{}),
    },
  };
}

const listId = pathParameter("id", "UUID de la lista");
const contactId = pathParameter("id", "UUID del contacto");
const templateId = pathParameter("id", "UUID de la plantilla");
const campaignId = pathParameter("id", "UUID de la campaña");
const messageId = pathParameter("id", "UUID del mensaje");
const batchId = pathParameter("id", "UUID del lote transaccional");
const jobId = pathParameter("id", "UUID del trabajo");
const webhookId = pathParameter("id", "UUID del webhook");
const suppressionId = pathParameter("id", "UUID de la supresión");
const segmentId = pathParameter("id", "UUID del segmento");
const assetId = pathParameter("id", "UUID del activo");
const reusableBlockId = pathParameter("id", "UUID del bloque reutilizable");
const userId = pathParameter("id", "UUID del usuario");

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Serenity Mail API",
    version: "1.0.0",
    description: "API REST para audiencias, plantillas, campañas, mensajes transaccionales, trabajos de datos y webhooks. Las bajas por lista nunca se revierten de forma implícita.",
    contact: { name: "Administrador de Serenity Mail" },
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  servers: [{ url: "/", description: "Esta instalación" }],
  tags: [
    { name: "Listas", description: "Listas, campos propios y suscripciones independientes." },
    { name: "Contactos", description: "Identidad global y estado de entregabilidad." },
    { name: "Plantillas", description: "Plantillas versionadas de marketing o transaccionales." },
    { name: "Activos", description: "Biblioteca de imágenes validada, inmutable y con dependencias históricas." },
    { name: "Bloques", description: "Bloques visuales reutilizables que se insertan como copias independientes." },
    { name: "Campañas", description: "Borradores, preflight y lanzamiento idempotente." },
    { name: "Informes", description: "Métricas recalculables de campañas, transaccionales y audiencia, con exportaciones auditadas." },
    { name: "Entregabilidad", description: "Salud de Amazon SES, reputación, cuotas, identidades, alertas y conciliación de supresiones." },
    { name: "Operaciones", description: "Disponibilidad, colas, workers, almacenamiento, retención, métricas y recuperación." },
    { name: "Transaccionales", description: "Mensajes individuales con HTML directo o plantilla." },
    { name: "Importaciones", description: "Ingesta CSV asíncrona, errores y rollback." },
    { name: "Exportaciones", description: "Exportaciones CSV asíncronas autenticadas." },
    { name: "Webhooks", description: "Entrega firmada de eventos a sistemas externos." },
    { name: "Credenciales", description: "Claves API administradas desde una sesión interna." },
    { name: "Supresiones", description: "Bloqueos por canal con resolución reversible e historial." },
    { name: "Segmentos", description: "Audiencias dinámicas con reglas tipadas, grupos y previsualización viva." },
    { name: "Trabajos", description: "Seguimiento y cancelación de procesos asíncronos." },
    { name: "Usuarios", description: "Usuarios internos, roles y sesiones de la instalación." },
  ],
  paths: {
    "/api/v1/lists": {
      get: operation("Listar listas", "Listas", { scope: "lists:read", parameters: [queryParameter("include_archived", "Incluye listas archivadas", { type: "boolean", default: false })], responseSchema: listResponse(ref("List")) }),
      post: operation("Crear una lista", "Listas", { scope: "lists:write", status: "201", requestBody: jsonBody(ref("ListCreate"), { key: "agenda_cultural", name: "Agenda cultural", fields: [{ key: "frecuencia", label: "Frecuencia", type: "select", options: ["semanal", "mensual"] }] }), responseSchema: ref("List") }),
    },
    "/api/v1/lists/{id}": {
      get: operation("Obtener una lista", "Listas", { scope: "lists:read", parameters: [listId], responseSchema: ref("ListDetail"),etag:true }),
      patch: operation("Actualizar una lista", "Listas", { scope: "lists:write", parameters: [listId], requestBody: jsonBody(ref("ListUpdate")), responseSchema: ref("List"),concurrency:true }),
      delete: operation("Archivar una lista", "Listas", { scope: "lists:write", parameters: [listId], responseSchema: ref("ActionResult"),concurrency:true }),
    },
    "/api/v1/lists/{id}/duplicate": {
      post: operation("Duplicar una lista sin suscriptores", "Listas", { scope:"lists:write",status:"201",parameters:[listId],description:"Copia la configuración y los campos activos. No copia suscriptores y desactiva el alta pública hasta su revisión.",requestBody:jsonBody({type:"object",properties:{name:{type:"string",maxLength:200},key:{type:"string",pattern:"^[a-z][a-z0-9_\\-]{1,159}$"}}}),responseSchema:ref("List") }),
    },
    "/api/v1/lists/{id}/fields": {
      get: operation("Listar campos de una lista", "Listas", { scope: "lists:read", parameters: [listId], responseSchema: listResponse(ref("ListField")) }),
      post: operation("Crear un campo de lista", "Listas", { scope: "lists:write", status: "201", parameters: [listId], requestBody: jsonBody(ref("ListField")), responseSchema: ref("ListField") }),
    },
    "/api/v1/lists/{id}/fields/{fieldId}": {
      get: operation("Obtener un campo de lista", "Listas", {scope:"lists:read",parameters:[listId,pathParameter("fieldId","UUID del campo")],responseSchema:ref("ListField"),etag:true}),
      patch: operation("Actualizar un campo de lista", "Listas", { scope: "lists:write", parameters: [listId, pathParameter("fieldId", "UUID del campo")], requestBody: jsonBody(ref("ListFieldUpdate")), responseSchema: ref("ListField"),concurrency:true }),
      delete: operation("Archivar un campo de lista", "Listas", { scope: "lists:write", parameters: [listId, pathParameter("fieldId", "UUID del campo")], responseSchema: ref("ActionResult"),concurrency:true }),
    },
    "/api/v1/lists/{id}/subscriptions": {
      get: operation("Listar suscripciones", "Listas", { scope: "contacts:read", parameters: [listId, queryParameter("status", "Estado de suscripción"), queryParameter("cursor", "Cursor de la página anterior", { type: "string", format: "uuid" }), queryParameter("limit", "Resultados, máximo 200", { type: "integer", minimum: 1, maximum: 200, default: 50 })], responseSchema: listResponse(ref("Subscription")) }),
      post: operation("Crear o actualizar una suscripción", "Listas", { scope: "contacts:write", status: "201", parameters: [listId], description: "No reactiva una baja o archivo previo: en ese caso devuelve 409 y exige la acción reactivate.", requestBody: jsonBody(ref("SubscriptionCreate")), responseSchema: ref("Subscription") }),
    },
    "/api/v1/lists/{id}/subscriptions/{subscriptionId}": {
      get:operation("Obtener una suscripción","Listas",{scope:"contacts:read",parameters:[listId,pathParameter("subscriptionId","UUID de la suscripción")],responseSchema:ref("Subscription"),etag:true}),
      patch: operation("Actualizar campos de una suscripción", "Listas", { scope: "contacts:write", parameters: [listId, pathParameter("subscriptionId", "UUID de la suscripción")], requestBody: jsonBody(ref("SubscriptionUpdate")), responseSchema: ref("Subscription"),concurrency:true }),
    },
    "/api/v1/lists/{id}/subscriptions/{subscriptionId}/actions": {
      post: operation("Cambiar el estado de una suscripción", "Listas", { scope: "contacts:write", parameters: [listId, pathParameter("subscriptionId", "UUID de la suscripción")], requestBody: jsonBody(ref("SubscriptionAction"), { action: "unsubscribe", source: "api", reason: "Solicitud del usuario" }), responseSchema: ref("Subscription") }),
    },
    "/api/v1/contacts": {
      get: operation("Buscar contactos", "Contactos", { scope: "contacts:read", parameters: [queryParameter("q", "Nombre o email"), queryParameter("email", "Email exacto"), queryParameter("status", "Estado global"), queryParameter("cursor", "Cursor de página", { type: "string", format: "uuid" }), queryParameter("limit", "Resultados, máximo 200", { type: "integer", minimum: 1, maximum: 200, default: 50 })], responseSchema: listResponse(ref("Contact")) }),
      post: operation("Crear o completar un contacto", "Contactos", { scope: "contacts:write", status: "201", requestBody: jsonBody(ref("ContactCreate")), responseSchema: ref("Contact") }),
    },
    "/api/v1/contacts/{id}": {
      get: operation("Obtener contacto e historial", "Contactos", { scope: "contacts:read", parameters: [contactId], responseSchema: ref("ContactDetail"),etag:true }),
      patch: operation("Actualizar un contacto", "Contactos", { scope: "contacts:write", parameters: [contactId], requestBody: jsonBody(ref("ContactUpdate")), responseSchema: ref("Contact"),concurrency:true }),
    },
    "/api/v1/contacts/{id}/actions": {
      post: operation("Bloquear, desbloquear, anonimizar o fusionar", "Contactos", { scope: "contacts:write", parameters: [contactId], description:"La fusión consolida suscripciones de forma conservadora: una baja o archivo prevalece sobre un estado activo. La anonimización es irreversible.", requestBody: jsonBody(ref("ContactAction")), responseSchema: ref("ActionResult") }),
    },
    "/api/v1/contacts/{id}/export": {
      get: operation("Exportar todos los datos de un contacto", "Contactos", { scope:"contacts:read", parameters:[contactId], description:"Genera una exportación JSON auditable para una solicitud de acceso a datos.", responseSchema:ref("ContactPrivacyExport") }),
    },
    "/api/v1/contacts/bulk": {
      post: operation("Iniciar una operación masiva", "Contactos", { scope: "contacts:write", status: "202", parameters: [idempotencyHeader], description: "Procesa hasta 10.000 contactos. Una baja previa solo se reactiva con reactivate=true.", requestBody: jsonBody(ref("BulkContactsCreate"), { contact_ids: ["00000000-0000-0000-0000-000000000000"], action: "subscribe", list_id: "00000000-0000-0000-0000-000000000001", reactivate: false, reason: "Importación autorizada" }), responseSchema: ref("JobAccepted") }),
    },
    "/api/v1/suppressions": {
      get: operation("Listar supresiones", "Supresiones", { scope: "contacts:read", parameters: [queryParameter("q", "Email parcial"), queryParameter("reason", "unsubscribe, bounce, complaint, manual, privacy, merged o all"), queryParameter("scope", "marketing, transactional, all o any"), queryParameter("status", "active, resolved o any"), queryParameter("limit", "Resultados, máximo 500", { type: "integer", minimum: 1, maximum: 500, default: 200 })], responseSchema: { type: "object", properties: { data: { type: "array", items: ref("Suppression") }, counts: { type: "object", additionalProperties: { type: "integer" } } } } }),
      post: operation("Crear o reactivar una supresión", "Supresiones", { scope: "contacts:write", status: "201", requestBody: jsonBody(ref("SuppressionCreate")), responseSchema: ref("Suppression") }),
    },
    "/api/v1/suppressions/{id}": {
      get:operation("Obtener una supresión","Supresiones",{scope:"contacts:read",parameters:[suppressionId],responseSchema:ref("Suppression"),etag:true}),
      patch: operation("Resolver o reactivar una supresión", "Supresiones", { scope: "contacts:write", parameters: [suppressionId], requestBody: jsonBody(ref("SuppressionAction")), responseSchema: ref("Suppression"),concurrency:true }),
    },
    "/api/v1/segments": {
      get: operation("Listar segmentos", "Segmentos", { scope: "lists:read", parameters: [queryParameter("include_archived", "Incluye segmentos archivados", { type: "boolean", default: false })], responseSchema: listResponse(ref("Segment")) }),
      post: operation("Crear un segmento", "Segmentos", { scope: "lists:write", status: "201", requestBody: jsonBody(ref("SegmentInput"), { name: "Lectores semanales", description: "Suscriptores que prefieren la frecuencia semanal", list_id: "00000000-0000-0000-0000-000000000001", definition: { kind: "group", match: "all", children: [{ kind: "rule", field: "list_field", field_key: "frecuencia", operator: "is", value: "semanal" }] } }), responseSchema: ref("Segment") }),
    },
    "/api/v1/segments/{id}": {
      get: operation("Obtener un segmento", "Segmentos", { scope: "lists:read", parameters: [segmentId], responseSchema: ref("Segment"),etag:true }),
      patch: operation("Actualizar o restaurar un segmento", "Segmentos", { scope: "lists:write", parameters: [segmentId], description: "Acepta la definición completa o solamente status=active|archived.", requestBody: jsonBody({ oneOf: [ref("SegmentInput"), { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["active", "archived"] } } }] }), responseSchema: ref("Segment"),concurrency:true }),
      delete: operation("Archivar un segmento", "Segmentos", { scope: "lists:write", parameters: [segmentId], responseSchema: ref("ActionResult"),concurrency:true }),
    },
    "/api/v1/segments/{id}/duplicate": {
      post: operation("Duplicar un segmento", "Segmentos", { scope:"lists:write",status:"201",parameters:[segmentId],requestBody:jsonBody({type:"object",properties:{name:{type:"string",maxLength:200}}}),responseSchema:ref("Segment") }),
    },
    "/api/v1/segments/preview": {
      post: operation("Previsualizar un segmento", "Segmentos", { scope: "lists:read", description: "Valida los campos contra la lista y devuelve recuento, explicación y hasta diez ejemplos sin guardar.", requestBody: jsonBody(ref("SegmentPreviewInput")), responseSchema: ref("SegmentPreview") }),
    },
    "/api/v1/templates": {
      get: operation("Listar plantillas", "Plantillas", { scope: "templates:read", parameters: [queryParameter("channel", "marketing o transactional"), queryParameter("status", "draft, published o archived")], responseSchema: listResponse(ref("Template")) }),
      post: operation("Crear plantilla y primera versión", "Plantillas", { scope: "templates:write", status: "201", requestBody: jsonBody(ref("TemplateCreate"), { key: "pedido_confirmado", name: "Pedido confirmado", channel: "transactional", subject: "Pedido {{numero}} confirmado", html: "<h1>Gracias, {{nombre}}</h1>", text: "Gracias, {{nombre}}", publish: true }), responseSchema: ref("Template") }),
    },
    "/api/v1/templates/{id}": {
      get: operation("Obtener plantilla y versiones", "Plantillas", { scope: "templates:read", parameters: [templateId], responseSchema: ref("TemplateDetail"),etag:true }),
      patch: operation("Actualizar metadatos de plantilla", "Plantillas", { scope: "templates:write", parameters: [templateId], requestBody: jsonBody(ref("TemplateUpdate")), responseSchema: ref("Template"),concurrency:true }),
      delete: operation("Archivar una plantilla", "Plantillas", { scope: "templates:write", parameters: [templateId], responseSchema: ref("ActionResult"),concurrency:true }),
    },
    "/api/v1/templates/{id}/duplicate": {
      post: operation("Duplicar una plantilla como borrador", "Plantillas", { scope:"templates:write",status:"201",parameters:[templateId],description:"Copia la última versión, su documento visual y las referencias de activos como una plantilla nueva e independiente.",requestBody:jsonBody({type:"object",properties:{name:{type:"string",maxLength:200},key:{type:"string",pattern:"^[a-z][a-z0-9_\\-]{1,159}$"}}}),responseSchema:ref("Template") }),
    },
    "/api/v1/templates/{id}/versions": {
      post: operation("Crear versión de plantilla", "Plantillas", { scope: "templates:write", status: "201", parameters: [templateId], requestBody: jsonBody(ref("TemplateVersionCreate")), responseSchema: ref("TemplateVersion") }),
    },
    "/api/v1/templates/{id}/versions/{versionId}/publish": {
      post: operation("Publicar una versión", "Plantillas", { scope: "templates:write", parameters: [templateId, pathParameter("versionId", "UUID de la versión")], responseSchema: ref("TemplateVersion") }),
    },
    "/api/v1/templates/{id}/versions/{versionId}/restore": {
      post: operation("Restaurar una versión", "Plantillas", { scope: "templates:write", status: "201", description: "Crea una versión borrador nueva copiando exactamente la versión elegida; no sobrescribe ni elimina historial.", parameters: [templateId, pathParameter("versionId", "UUID de la versión")], requestBody: jsonBody({ type: "object", properties: { note: { type: "string", maxLength: 500 } } }), responseSchema: ref("TemplateVersion") }),
    },
    "/api/v1/assets": {
      get: operation("Listar activos", "Activos", { scope: "templates:read", parameters: [queryParameter("q", "Nombre o archivo original"), queryParameter("folder", "Carpeta exacta"), queryParameter("include_archived", "Incluye activos archivados", { type: "boolean", default: false }), queryParameter("limit", "Resultados, máximo 300", { type: "integer", minimum: 1, maximum: 300, default: 100 })], responseSchema: listResponse(ref("Asset")) }),
      post: operation("Subir una imagen", "Activos", { scope: "templates:write", status: "201", description: "Valida la firma binaria real, el MIME y el límite de 5 MB; JPG, PNG, GIF o WebP.", requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" }, name: { type: "string" }, folder: { type: "string" }, alt_text: { type: "string" } } } } } }, responseSchema: ref("Asset") }),
    },
    "/api/v1/assets/{id}": {
      get: operation("Obtener un activo", "Activos", { scope: "templates:read", parameters: [assetId], responseSchema: ref("Asset"),etag:true }),
      patch: operation("Actualizar o restaurar un activo", "Activos", { scope: "templates:write", parameters: [assetId], requestBody: jsonBody(ref("AssetUpdate")), responseSchema: ref("Asset"),concurrency:true }),
      delete: operation("Archivar un activo", "Activos", { scope: "templates:write", parameters: [assetId], description: "Archiva la entrada de biblioteca sin retirar el archivo usado por versiones históricas.", responseSchema: ref("ActionResult"),concurrency:true }),
    },
    "/api/v1/assets/{id}/content": {
      get: operation("Servir el contenido de un activo", "Activos", { security: [], parameters: [assetId], description: "Ruta pública e inmutable para que la imagen funcione en los emails. Incluye ETag y nosniff.", responseContentType: "image/*", responseSchema: { type: "string", format: "binary" } }),
    },
    "/api/v1/reusable-blocks": {
      get: operation("Listar bloques reutilizables", "Bloques", { scope: "templates:read", parameters: [queryParameter("q", "Nombre o descripción"), queryParameter("include_archived", "Incluye bloques archivados", { type: "boolean", default: false })], responseSchema: listResponse(ref("ReusableBlock")) }),
      post: operation("Guardar un bloque reutilizable", "Bloques", { scope: "templates:write", status: "201", requestBody: jsonBody(ref("ReusableBlockCreate")), responseSchema: ref("ReusableBlock") }),
    },
    "/api/v1/reusable-blocks/{id}": {
      get:operation("Obtener un bloque reutilizable","Bloques",{scope:"templates:read",parameters:[reusableBlockId],responseSchema:ref("ReusableBlock"),etag:true}),
      patch: operation("Actualizar o restaurar un bloque", "Bloques", { scope: "templates:write", parameters: [reusableBlockId], requestBody: jsonBody(ref("ReusableBlockUpdate")), responseSchema: ref("ReusableBlock"),concurrency:true }),
      delete: operation("Archivar un bloque reutilizable", "Bloques", { scope: "templates:write", parameters: [reusableBlockId], responseSchema: ref("ActionResult"),concurrency:true }),
    },
    "/api/v1/campaigns": {
      get: operation("Listar campañas", "Campañas", { scope: "campaigns:read", parameters: [queryParameter("status", "Estado de campaña"), queryParameter("list_id", "UUID de lista", { type: "string", format: "uuid" })], responseSchema: listResponse(ref("Campaign")) }),
      post: operation("Crear borrador de campaña", "Campañas", { scope: "campaigns:write", status: "201", requestBody: jsonBody(ref("CampaignCreate"), { name: "Newsletter agosto", list_id: "00000000-0000-0000-0000-000000000000", subject: "Novedades de agosto", content: { html: "<h1>Novedades</h1>", text: "Novedades" } }), responseSchema: ref("Campaign") }),
    },
    "/api/v1/campaigns/{id}": {
      get: operation("Obtener campaña y destinatarios", "Campañas", { scope: "campaigns:read", parameters: [campaignId], responseSchema: ref("CampaignDetail"),etag:true }),
      patch: operation("Editar un borrador o una campaña programada", "Campañas", { scope: "campaigns:write", parameters: [campaignId], requestBody: jsonBody(ref("CampaignUpdate")), responseSchema: ref("Campaign"), description:"Requiere la versión leída para impedir sobrescrituras concurrentes. El contenido y la audiencia quedan bloqueados al comenzar el envío." }),
      delete: operation("Archivar una campaña", "Campañas", { scope: "campaigns:write", parameters: [campaignId], responseSchema: ref("ActionResult"),concurrency:true }),
    },
    "/api/v1/campaigns/{id}/preflight": {
      get: operation("Validar campaña y estimar audiencia", "Campañas", { scope: "campaigns:read", parameters: [campaignId], responseSchema: ref("CampaignPreflight") }),
    },
    "/api/v1/campaigns/{id}/launch": {
      post: operation("Lanzar una campaña", "Campañas", { scope: "campaigns:send", status: "202", parameters: [campaignId, idempotencyHeader], requestBody: jsonBody({ type: "object", required: ["confirm_recipient_count"], properties: { confirm_recipient_count: { type: "integer", minimum: 0 } } }), responseSchema: ref("CampaignLaunch") }),
    },
    "/api/v1/campaigns/{id}/actions": {
      post: operation("Controlar el ciclo y la aprobación de una campaña", "Campañas", { scope: "campaigns:write", parameters: [campaignId], requestBody: jsonBody(ref("CampaignAction")), responseSchema: ref("CampaignActionResult"),description:"Programar, retirar, pausar, reanudar y cancelar requieren campaigns:send; solicitar aprobación y comentar, campaigns:write; aprobar o rechazar, campaigns:approve. El rol editor no posee este último permiso." }),
    },
    "/api/v1/campaigns/{id}/duplicate": {
      post: operation("Duplicar una campaña como borrador", "Campañas", { scope: "campaigns:write", status:"201",parameters: [campaignId], requestBody: jsonBody({type:"object",properties:{name:{type:"string",maxLength:200}}}), responseSchema: ref("Campaign") }),
    },
    "/api/v1/campaigns/{id}/experiment": {
      get: operation("Consultar configuración y resultados A/B", "Campañas", { scope:"campaigns:read",parameters:[campaignId],responseSchema:ref("CampaignExperiment") }),
      put: operation("Configurar o sustituir una prueba A/B", "Campañas", { scope:"campaigns:write",parameters:[campaignId],requestBody:jsonBody(ref("CampaignExperimentConfigure")),responseSchema:ref("CampaignExperiment"),description:"Congela instantáneas completas de 2 a 4 variantes. Cambiar la prueba incrementa la versión e invalida una aprobación anterior." }),
      delete: operation("Retirar una prueba A/B del borrador", "Campañas", { scope:"campaigns:write",parameters:[campaignId],requestBody:jsonBody({type:"object",required:["version"],properties:{version:{type:"integer",minimum:1}}}),responseSchema:ref("ActionResult") }),
    },
    "/api/v1/campaigns/{id}/experiment/actions": {
      post: operation("Evaluar la muestra o elegir ganador A/B", "Campañas", { scope:"campaigns:send",parameters:[campaignId],requestBody:jsonBody(ref("CampaignExperimentAction")),responseSchema:ref("CampaignExperimentWinner"),description:"evaluate aplica aperturas o clics y desempata por entregas/control; select_winner registra una decisión manual." }),
    },
    "/api/v1/campaigns/{id}/recipients/{recipientId}/content": {
      get: operation("Recuperar contenido exacto de destinatario", "Campañas", { scope: "campaigns:read", parameters: [campaignId, pathParameter("recipientId", "UUID del destinatario de campaña"), queryParameter("part", "html o text", { type: "string", enum: ["html", "text"], default: "html" })], responseContentType: "text/html", responseSchema: { type: "string" } }),
    },
    "/api/v1/campaigns/{id}/report": {
      get: operation("Obtener informe detallado de campaña", "Informes", { scope:"reports:read",parameters:[campaignId,queryParameter("status","Filtra destinatarios por estado"),queryParameter("query","Busca destinatarios por email"),queryParameter("page","Página de destinatarios",{type:"integer",minimum:1,default:1}),queryParameter("limit","Destinatarios por página",{type:"integer",minimum:1,maximum:200,default:50})],responseSchema:ref("CampaignReport"),description:"Incluye embudo, eventos temporales, enlaces, automatización probable, fallos, audiencia, A/B y una página de destinatarios." }),
    },
    "/api/v1/campaigns/{id}/report/export": {
      get: operation("Exportar informe de campaña", "Informes", { scope:"reports:read",parameters:[campaignId,queryParameter("kind","recipients, events o links",{type:"string",enum:["recipients","events","links"],default:"recipients"})],responseContentType:"text/csv",responseSchema:{type:"string"},description:"Exportación CSV UTF-8 con BOM; la descarga queda registrada en auditoría." }),
    },
    "/api/v1/reports/campaigns": {
      get: operation("Consultar informe de campañas", "Informes", { scope:"reports:read",parameters:[queryParameter("from","Inicio inclusivo",{type:"string",format:"date-time"}),queryParameter("to","Fin exclusivo",{type:"string",format:"date-time"}),queryParameter("list_id","UUID de lista",{type:"string",format:"uuid"}),queryParameter("breakdown_field","Clave de un campo select, multiselect o boolean de la lista. Exige list_id y oculta grupos con menos de cinco destinatarios.",{type:"string"}),queryParameter("format","csv para descargar una exportación auditada",{type:"string",enum:["csv"]})],responseSchema:ref("CampaignsReport") }),
    },
    "/api/v1/reports/transactional": {
      get: operation("Consultar informe transaccional", "Informes", { scope:"reports:read",parameters:[queryParameter("from","Inicio inclusivo",{type:"string",format:"date-time"}),queryParameter("to","Fin exclusivo",{type:"string",format:"date-time"}),queryParameter("format","csv para descargar una exportación auditada",{type:"string",enum:["csv"]})],responseSchema:ref("TransactionalReport") }),
    },
    "/api/v1/reports/audience": {
      get: operation("Consultar crecimiento de audiencia", "Informes", { scope:"reports:read",parameters:[queryParameter("from","Inicio inclusivo",{type:"string",format:"date-time"}),queryParameter("to","Fin exclusivo",{type:"string",format:"date-time"}),queryParameter("list_id","UUID de lista",{type:"string",format:"uuid"}),queryParameter("format","csv para descargar una exportación auditada",{type:"string",enum:["csv"]})],responseSchema:ref("AudienceReport") }),
    },
    "/api/v1/deliverability": {
      get: operation("Consultar salud de entregabilidad", "Entregabilidad", { scope:"reports:read",parameters:[queryParameter("refresh","Consulta SES en tiempo real; exige settings:write",{type:"boolean",default:false})],responseSchema:ref("DeliverabilityDashboard"),description:"Devuelve el último snapshot de SES o Mailpit, reputación a 7/30 días, tendencias, alertas y resumen de supresiones." }),
    },
    "/api/v1/deliverability/actions": {
      post: operation("Ejecutar una acción de entregabilidad", "Entregabilidad", { scope:"settings:write",requestBody:jsonBody(ref("DeliverabilityAction")),responseSchema:{type:"object",properties:{data:{type:"object",additionalProperties:true},dashboard:ref("DeliverabilityDashboard")}},description:"Comprueba SES, envía una prueba técnica, previsualiza o ejecuta la conciliación y controla la pausa global." }),
    },
    "/api/events/ses": {
      post: operation("Recibir una notificación SNS de SES", "Entregabilidad", { security:[],requestBody:jsonBody({type:"object",additionalProperties:true}),responseSchema:{type:"object",additionalProperties:true},description:"Endpoint máquina a máquina: verifica firma, certificado, TopicArn e idempotencia; confirma SNS y normaliza notificaciones de varios destinatarios." }),
    },
    "/api/v1/operations": {
      get: operation("Consultar diagnóstico operativo", "Operaciones", { scope:"settings:read",responseSchema:ref("OperationsDashboard"),description:"Estado de configuración, colas, workers, almacenamiento, base de datos, mantenimientos y DLQ sin secretos." }),
    },
    "/api/v1/operations/actions": {
      post: operation("Ejecutar una acción operativa", "Operaciones", { scope:"settings:write",requestBody:jsonBody(ref("OperationsAction")),responseSchema:ref("ActionResult"),description:"Reintenta o resuelve un trabajo agotado y ejecuta retención o reconciliación de blobs de forma auditada." }),
    },
    "/api/v1/transactional/send": {
      post: operation("Aceptar un mensaje transaccional", "Transaccionales", { scope: "transactional:send", status: "202", parameters: [idempotencyHeader], requestBody: jsonBody(ref("TransactionalSend"), { to: { email: "cliente@example.com", name: "Ana" }, subject: "Tu pedido está confirmado", html: "<h1>Pedido confirmado</h1>", metadata: { order_id: "A-1042" } }), responseSchema: ref("MessageAccepted"),description:"Compone y persiste el MIME definitivo antes de encolar. Rechaza con message_too_large si el tamaño codificado exacto supera TRANSACTIONAL_MIME_MAX_BYTES (40.000.000 por defecto para SES v2/SMTP)." }),
    },
    "/api/v1/transactional/batch": {
      post: operation("Aceptar un lote transaccional", "Transaccionales", { scope: "transactional:send", status: "202", parameters: [idempotencyHeader], requestBody: jsonBody(ref("TransactionalBatch")), responseSchema: ref("TransactionalBatchAccepted"), description: "Acepta hasta 100 mensajes. Cada elemento se valida y devuelve su resultado individual sin duplicar envíos al repetir la misma clave." }),
    },
    "/api/v1/transactional/batches/{id}": {
      get: operation("Consultar un lote transaccional", "Transaccionales", { scope: "transactional:read", parameters: [batchId], responseSchema: ref("TransactionalBatchStatus") }),
    },
    "/api/v1/transactional/render": {
      post: operation("Renderizar una plantilla sin enviar", "Transaccionales", { scope: "templates:read", requestBody: jsonBody(ref("TemplateRender")), responseSchema: ref("RenderedContent") }),
    },
    "/api/v1/transactional/messages": {
      get: operation("Listar mensajes transaccionales", "Transaccionales", { scope: "transactional:read", parameters: [queryParameter("status", "Estado operativo"), queryParameter("email", "Coincidencia parcial de destinatario"), queryParameter("limit", "Resultados, máximo 200", { type: "integer", minimum: 1, maximum: 200, default: 50 })], responseSchema: listResponse(ref("Message")) }),
    },
    "/api/v1/transactional/messages/{id}": {
      get: operation("Obtener mensaje y eventos", "Transaccionales", { scope: "transactional:read", parameters: [messageId], responseSchema: ref("MessageDetail") }),
    },
    "/api/v1/transactional/messages/{id}/content": {
      get: operation("Recuperar contenido exacto del mensaje", "Transaccionales", { scope: "transactional:read", parameters: [messageId, queryParameter("part", "html o text", { type: "string", enum: ["html", "text"], default: "html" })], responseContentType: "text/html", responseSchema: { type: "string" } }),
    },
    "/api/v1/transactional/messages/{id}/retry": {
      post: operation("Reintentar manualmente un mensaje fallido", "Transaccionales", { scope: "transactional:send", status: "202", parameters: [messageId,idempotencyHeader], responseSchema: ref("MessageAccepted"), description: "Solo permite fallos que el proveedor no aceptó. Crea un mensaje nuevo, enlazado al original y con el contenido y los adjuntos inmutables." }),
    },
    "/api/v1/imports/preview": {
      post: operation("Previsualizar un CSV", "Importaciones", { scope: "contacts:write", requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" }, delimiter: { type: "string" } } } } } }, responseSchema: ref("ImportPreview") }),
    },
    "/api/v1/imports": {
      get: operation("Listar importaciones", "Importaciones", { scope: "contacts:read", responseSchema: listResponse(ref("DataJob")) }),
      post: operation("Crear importación asíncrona", "Importaciones", { scope: "contacts:write", status: "202", parameters: [idempotencyHeader], requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file", "config"], properties: { file: { type: "string", format: "binary" }, config: { type: "string", description: "JSON serializado con list_id, mapping, delimiter, políticas y consentimiento." } } } } } }, responseSchema: ref("JobAccepted") }),
    },
    "/api/v1/imports/{id}": {
      get: operation("Consultar una importación", "Importaciones", { scope: "contacts:read", parameters: [jobId], responseSchema: ref("DataJob") }),
      delete: operation("Cancelar una importación", "Importaciones", { scope: "contacts:write", parameters: [jobId], responseSchema: ref("ActionResult") }),
    },
    "/api/v1/imports/{id}/errors": {
      get: operation("Descargar errores CSV", "Importaciones", { scope: "contacts:read", parameters: [jobId], responseContentType: "text/csv", responseSchema: { type: "string" } }),
    },
    "/api/v1/imports/{id}/rollback": {
      post: operation("Revertir altas de una importación", "Importaciones", { scope: "contacts:write", parameters: [jobId], responseSchema: ref("ActionResult") }),
    },
    "/api/v1/exports": {
      get: operation("Listar exportaciones", "Exportaciones", { scope: "contacts:read", responseSchema: listResponse(ref("DataJob")) }),
      post: operation("Crear exportación asíncrona", "Exportaciones", { scope: "contacts:read", status: "202", parameters: [idempotencyHeader], requestBody: jsonBody(ref("ExportCreate")), responseSchema: ref("JobAccepted") }),
    },
    "/api/v1/exports/{id}": {
      get: operation("Consultar una exportación", "Exportaciones", { scope: "contacts:read", parameters: [jobId], responseSchema: ref("DataJob") }),
    },
    "/api/v1/exports/{id}/download": {
      get: operation("Descargar exportación CSV", "Exportaciones", { scope: "contacts:read", parameters: [jobId], responseContentType: "text/csv", responseSchema: { type: "string" } }),
    },
    "/api/v1/jobs/{id}": {
      get: operation("Consultar un trabajo", "Trabajos", { scope: "contacts:read", parameters: [jobId], responseSchema: ref("DataJob") }),
      delete: operation("Cancelar una operación masiva", "Trabajos", { scope: "contacts:write", parameters: [jobId], responseSchema: ref("ActionResult") }),
    },
    "/api/v1/webhooks": {
      get: operation("Listar webhooks", "Webhooks", { scope: "webhooks:read", responseSchema: listResponse(ref("Webhook")) }),
      post: operation("Crear webhook", "Webhooks", { scope: "webhooks:write", status: "201", requestBody: jsonBody(ref("WebhookCreate")), responseSchema: ref("Webhook") }),
    },
    "/api/v1/webhooks/{id}": {
      get:operation("Obtener webhook","Webhooks",{scope:"webhooks:read",parameters:[webhookId],responseSchema:ref("Webhook"),etag:true}),
      patch:operation("Actualizar webhook","Webhooks",{scope:"webhooks:write",parameters:[webhookId],requestBody:jsonBody({type:"object",required:["status"],properties:{status:{type:"string",enum:["active","disabled"]},events:{type:"array",items:{type:"string"},maxItems:50}}}),responseSchema:ref("Webhook"),concurrency:true}),
      delete: operation("Desactivar webhook", "Webhooks", { scope: "webhooks:write", parameters: [webhookId], responseSchema: ref("ActionResult"),concurrency:true }),
    },
    "/api/v1/webhooks/{id}/deliveries": {
      get: operation("Listar entregas de webhook", "Webhooks", { scope: "webhooks:read", parameters: [webhookId], responseSchema: listResponse({ type: "object", additionalProperties: true }) }),
    },
    "/api/v1/api-keys": {
      get: operation("Listar claves API", "Credenciales", { security: [{ sessionCookie: [] }], responseSchema: listResponse(ref("ApiKey")) }),
      post: operation("Crear una clave API", "Credenciales", { security: [{ sessionCookie: [] }], status: "201", requestBody: jsonBody(ref("ApiKeyCreate")), responseSchema: ref("ApiKeyCreated") }),
      delete: operation("Revocar una clave API", "Credenciales", { security: [{ sessionCookie: [] }], requestBody: jsonBody({ type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } }), responseSchema: ref("ActionResult") }),
    },
    "/api/users": {
      get: operation("Listar usuarios internos", "Usuarios", { security: [{ sessionCookie: [] }], responseSchema: listResponse(ref("User")) }),
      post: operation("Crear un usuario interno", "Usuarios", { security: [{ sessionCookie: [] }], status: "201", requestBody: jsonBody(ref("UserCreate")), responseSchema: ref("User") }),
    },
    "/api/users/{id}": {
      patch: operation("Actualizar rol o estado de usuario", "Usuarios", { security: [{ sessionCookie: [] }], parameters: [userId], requestBody: jsonBody(ref("UserUpdate")), responseSchema: ref("User") }),
    },
    "/api/auth/sessions": {
      get: operation("Listar sesiones propias", "Usuarios", { security: [{ sessionCookie: [] }], responseSchema: listResponse(ref("UserSession")) }),
      delete: operation("Revocar una sesión o todas las demás", "Usuarios", { security: [{ sessionCookie: [] }], requestBody: jsonBody({ oneOf: [{ type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } }, { type: "object", required: ["all_others"], properties: { all_others: { const: true } } }] }), responseSchema: ref("ActionResult") }),
    },
    "/api/auth/mfa": {
      get: operation("Consultar MFA propio", "Usuarios", { security:[{sessionCookie:[]}],responseSchema:{type:"object",properties:{enabled:{type:"boolean"},recovery_codes_remaining:{type:"integer"}}} }),
      post: operation("Iniciar configuración MFA", "Usuarios", { security:[{sessionCookie:[]}],responseSchema:ref("MfaSetup"),description:"Genera un secreto TOTP cifrado y un QR local; todavía no activa MFA." }),
      put: operation("Activar MFA", "Usuarios", { security:[{sessionCookie:[]}],requestBody:jsonBody({type:"object",required:["code"],properties:{code:{type:"string",pattern:"^[0-9]{6}$"}}}),responseSchema:ref("MfaEnabled") }),
      delete: operation("Desactivar MFA", "Usuarios", { security:[{sessionCookie:[]}],requestBody:jsonBody({type:"object",required:["password","code"],properties:{password:{type:"string",writeOnly:true},code:{type:"string"}}}),responseSchema:ref("ActionResult") }),
    },
    "/api/health/live": {
      get: operation("Comprobar vida del proceso", "Operaciones", { security:[],responseSchema:{type:"object",properties:{status:{const:"alive"},time:{type:"string",format:"date-time"}}} }),
    },
    "/api/health/ready": {
      get: operation("Comprobar disponibilidad", "Operaciones", { security:[],responseSchema:{type:"object",additionalProperties:true},description:"Comprueba PostgreSQL, Redis y los requisitos de configuración del modo declarado." }),
    },
    "/api/metrics": {
      get: operation("Exportar métricas Prometheus", "Operaciones", { security:[{bearerAuth:[]}],responseContentType:"text/plain",responseSchema:{type:"string"},description:"Usa METRICS_TOKEN; en modo local también puede consultarlo un administrador con sesión." }),
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "serenity_api_key", description: "Clave creada en Ajustes → Integraciones y API." },
      sessionCookie: { type: "apiKey", in: "cookie", name: "serenity_session", description: "Sesión administrativa del navegador." },
    },
    schemas: {
      ErrorResponse: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string", example: "validation_error" }, message: { type: "string" }, field: { type: ["string", "null"] }, issues: { type: "array", items: { type: "object", additionalProperties: true } } } }, request_id: { type: ["string", "null"] } } },
      ActionResult: { type: "object", additionalProperties: true },
      ListField: { type: "object", required: ["key", "label", "type"], properties: { id: { type: "string", format: "uuid", readOnly: true }, key: { type: "string", pattern: "^[a-z][a-z0-9_]{0,79}$" }, label: { type: "string", maxLength: 120 }, type: { type: "string", enum: ["text", "textarea", "integer", "decimal", "date", "datetime", "boolean", "select", "multiselect", "email", "url"] }, help_text: { type: "string", default: "" }, required: { type: "boolean", default: false }, default_value: {}, options: { type: "array", items: { type: ["string", "number"] }, maxItems: 200 }, validation: { type: "object", additionalProperties: true }, visibility: { type: "string", enum: ["private", "preference_center"], default: "private" }, position: { type: "integer", minimum: 0 } } },
      ListFieldUpdate: { type: "object", minProperties: 1, properties: { label: { type: "string" }, help_text: { type: "string" }, required: { type: "boolean" }, options: { type: "array", items: { type: ["string", "number"] } }, validation: { type: "object", additionalProperties: true }, visibility: { type: "string", enum: ["private", "preference_center"] }, position: { type: "integer", minimum: 0 }, status:{type:"string",enum:["active","archived"]} } },
      ListCreate: { type: "object", required: ["name"], properties: { key: { type: "string" }, name: { type: "string", maxLength: 200 }, description: { type: "string" }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, default_from_name: { type: "string" }, default_from_email: { type: "string", format: "email" }, default_reply_to: { type: "string", format: "email" }, language: { type: "string", default: "es" }, legal_footer: { type: "string" }, public_signup_enabled: { type: "boolean", default: false }, double_opt_in: { type: "boolean", default: true }, preference_center_visible: { type: "boolean", default: true }, consent_text_default: { type: "string" }, fields: { type: "array", maxItems: 100, items: ref("ListField") } } },
      ListUpdate: { type: "object", minProperties: 1, properties: { name: { type: "string" }, description: { type: "string" }, color: { type: "string" }, default_from_name: { type: "string" }, default_from_email: { type: "string", format: "email" }, default_reply_to: { type: "string", format: "email" }, language: { type: "string" }, legal_footer: { type: "string" }, public_signup_enabled: { type: "boolean" }, double_opt_in: { type: "boolean" }, preference_center_visible: { type: "boolean" }, consent_text_default: { type: "string" }, status:{type:"string",enum:["active","archived"]} } },
      List: { allOf: [ref("ListCreate"), { type: "object", properties: { id: { type: "string", format: "uuid" }, status: { type: "string",enum:["active","archived"] }, duplicated_from_id:{type:["string","null"],format:"uuid",readOnly:true}, active_subscriptions: { type: "integer" }, created_at: { type: "string", format: "date-time" }, updated_at: { type: "string", format: "date-time" } } }] },
      ListDetail: { allOf: [ref("List"), { type: "object", properties: { fields: { type: "array", items: ref("ListField") }, stats: { type: "object", properties: { active: { type: "integer" }, unsubscribed: { type: "integer" }, total: { type: "integer" } } } } }] },
      SubscriptionCreate: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" }, first_name: { type: "string" }, last_name: { type: "string" }, phone: { type: "string" }, language: { type: "string", default: "es" }, timezone: { type: "string" }, contact_fields: { type: "object", additionalProperties: true }, fields: { type: "object", additionalProperties: true }, status: { type: "string", enum: ["pending", "active"], default: "active" }, source: { type: "string", default: "api" }, consent_text: { type: "string" }, legal_basis: { type: "string", default: "consent" } } },
      SubscriptionUpdate: { type: "object", required: ["fields"], properties: { fields: { type: "object", additionalProperties: true }, consent_text: { type: "string" } } },
      SubscriptionAction: { type: "object", required: ["action"], properties: { action: { type: "string", enum: ["unsubscribe", "reactivate", "archive"] }, source: { type: "string", default: "api" }, reason: { type: "string" }, fields: { type: "object", additionalProperties: true } } },
      Subscription: { type: "object", properties: { id: { type: "string", format: "uuid" }, contact_id: { type: "string", format: "uuid" }, list_id: { type: "string", format: "uuid" }, status: { type: "string", enum: ["pending", "active", "unsubscribed", "archived"] }, fields: { type: "object", additionalProperties: true }, source: { type: "string" }, subscribed_at: { type: ["string", "null"], format: "date-time" }, confirmed_at: { type: ["string", "null"], format: "date-time" }, unsubscribed_at: { type: ["string", "null"], format: "date-time" } } },
      ContactCreate: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" }, first_name: { type: "string" }, last_name: { type: "string" }, phone: { type: "string" }, language: { type: "string", default: "es" }, timezone: { type: "string" }, fields: { type: "object", additionalProperties: true }, source: { type: "string", default: "api" } } },
      ContactUpdate: { type: "object", minProperties: 1, properties: { first_name: { type: "string" }, last_name: { type: "string" }, phone: { type: "string" }, language: { type: "string" }, timezone: { type: "string" }, fields: { type: "object", additionalProperties: true } } },
      Contact: { allOf: [ref("ContactCreate"), { type: "object", properties: { id: { type: "string", format: "uuid" }, status: { type: "string", enum: ["active", "bounced", "complained", "blocked"] }, created_at: { type: "string", format: "date-time" }, updated_at: { type: "string", format: "date-time" } } }] },
      ContactDetail: { allOf: [ref("Contact"), { type: "object", properties: { subscriptions: { type: "array", items: ref("Subscription") }, consent: { type: "array", items: { type: "object", additionalProperties: true } } } }] },
      ContactAction: { oneOf:[
        {type:"object",required:["action","reason"],properties:{action:{const:"block"},reason:{type:"string",minLength:1,maxLength:500}}},
        {type:"object",required:["action"],properties:{action:{const:"unblock"},reason:{type:"string",maxLength:500}}},
        {type:"object",required:["action","reason"],properties:{action:{const:"anonymize"},reason:{type:"string",minLength:1,maxLength:500}}},
        {type:"object",required:["action","survivor_contact_id","reason"],properties:{action:{const:"merge"},survivor_contact_id:{type:"string",format:"uuid"},field_strategy:{type:"string",enum:["target","source","fill_empty"],default:"fill_empty"},reason:{type:"string",minLength:1,maxLength:500}}},
      ] },
      ContactPrivacyExport:{type:"object",properties:{export:{type:"object",properties:{request_id:{type:"string",format:"uuid"},generated_at:{type:"string",format:"date-time"},format:{const:"serenity-mail-contact-v1"}}},contact:ref("Contact"),subscriptions:{type:"array",items:ref("Subscription")},consent_events:{type:"array",items:{type:"object",additionalProperties:true}},tags:{type:"array",items:{type:"object",additionalProperties:true}},outbound_messages:{type:"array",items:{type:"object",additionalProperties:true}},campaign_recipients:{type:"array",items:{type:"object",additionalProperties:true}},suppressions:{type:"array",items:ref("Suppression")},privacy_requests:{type:"array",items:{type:"object",additionalProperties:true}},merges:{type:"array",items:{type:"object",additionalProperties:true}}}},
      BulkContactsCreate: { type: "object", required: ["contact_ids", "action"], properties: { contact_ids: { type: "array", minItems: 1, maxItems: 10000, uniqueItems: true, items: { type: "string", format: "uuid" } }, action: { type: "string", enum: ["subscribe", "unsubscribe", "archive", "block"] }, list_id: { type: "string", format: "uuid", description: "Obligatorio salvo para block." }, reactivate: { type: "boolean", default: false }, reason: { type: "string", maxLength: 1000 } } },
      SuppressionCreate: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" }, reason: { type: "string", enum: ["unsubscribe", "bounce", "complaint", "manual"], default: "manual" }, scope: { type: "string", enum: ["marketing", "transactional", "all"], default: "all" }, note: { type: "string", maxLength: 1000 } } },
      SuppressionAction: { type: "object", required: ["action"], properties: { action: { type: "string", enum: ["resolve", "reactivate"] }, note: { type: "string", maxLength: 1000 } } },
      Suppression: { type: "object", properties: { id: { type: "string", format: "uuid" }, email: { type: "string", format: "email" }, reason: { type: "string" }, source: { type: "string" }, scope: { type: "string", enum: ["marketing", "transactional", "all"] }, status: { type: "string", enum: ["active", "resolved"] }, detail: { type: "object", additionalProperties: true }, resolution_note: { type: "string" }, created_at: { type: "string", format: "date-time" }, updated_at: { type: "string", format: "date-time" }, resolved_at: { type: ["string", "null"], format: "date-time" } } },
      SegmentValue: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }, { type: "array", items: { oneOf: [{ type: "string" }, { type: "number" }] } }] },
      SegmentRule: { type: "object", required: ["kind", "field", "operator"], properties: { kind: { const: "rule" }, field: { type: "string", enum: ["status", "email", "first_name", "last_name", "phone", "country", "city", "language", "timezone", "source", "created_at", "last_activity_at", "subscription_status", "subscription_source", "subscribed_at", "confirmed_at", "unsubscribed_at", "list_field", "campaign_activity"] }, operator: { type: "string", enum: ["is", "is_not", "contains", "not_contains", "starts_with", "greater_than", "greater_or_equal", "less_than", "less_or_equal", "between", "before", "after", "is_empty", "not_empty", "contains_any", "contains_all", "received", "not_received", "opened", "not_opened", "clicked", "not_clicked"] }, value: ref("SegmentValue"), value_to: { type: "string" }, within_days:{type:"integer",minimum:1,maximum:3650,description:"Ventana temporal opcional para campaign_activity."}, field_key: { type: "string", description: "Clave del campo propio cuando field=list_field." }, field_type: { type: "string", readOnly: true }, list_id: { type: "string", format: "uuid", readOnly: true } } },
      SegmentGroup: { type: "object", required: ["kind", "match", "children"], properties: { kind: { const: "group" }, match: { type: "string", enum: ["all", "any"] }, children: { type: "array", minItems: 1, maxItems: 20, items: { oneOf: [ref("SegmentRule"), ref("SegmentGroup")] } } } },
      SegmentInput: { type: "object", required: ["name", "list_id", "definition"], properties: { name: { type: "string", maxLength: 200 }, description: { type: "string", maxLength: 1000 }, list_id: { type: "string", format: "uuid" }, definition: ref("SegmentGroup") } },
      SegmentPreviewInput: { type: "object", required: ["list_id", "definition"], properties: { list_id: { type: "string", format: "uuid" }, definition: ref("SegmentGroup") } },
      SegmentPreview: { type: "object", properties: { count: { type: "integer", minimum: 0 }, explanation: { type: "string" }, examples: { type: "array", maxItems: 10, items: { type: "object", properties: { id: { type: "string", format: "uuid" }, email: { type: "string", format: "email" }, first_name: { type: "string" }, last_name: { type: "string" } } } } } },
      Segment: { allOf: [ref("SegmentInput"), { type: "object", properties: { id: { type: "string", format: "uuid" }, status: { type: "string", enum: ["active", "archived"] }, duplicated_from_id:{type:["string","null"],format:"uuid",readOnly:true}, list_name: { type: "string" }, last_count: { type: ["integer", "null"] }, last_count_at: { type: ["string", "null"], format: "date-time" }, count_history: { type: "array", items: { type: "object", properties: { captured_on: { type: "string", format: "date" }, contact_count: { type: "integer" } } } }, preview: ref("SegmentPreview") } }] },
      VariablesSchema: { type: "object", additionalProperties: { type: "object", properties: { type: { type: "string" }, required: { type: "boolean" }, default: {} } } },
      TemplateCreate: { type: "object", required: ["key", "name", "channel", "subject", "html"], properties: { key: { type: "string" }, name: { type: "string" }, channel: { type: "string", enum: ["marketing", "transactional"] }, format: { type: "string", enum: ["html", "visual"], default: "html" }, folder: { type: "string" }, list_id: { type: ["string", "null"], format: "uuid" }, subject: { type: "string" }, preview_text: { type: "string" }, html: { type: "string" }, text: { type: "string" }, visual_document: { type: ["object", "null"], additionalProperties: true }, variables_schema: ref("VariablesSchema"), publish: { type: "boolean", default: false } } },
      TemplateUpdate: { type: "object", minProperties: 1, additionalProperties: true },
      TemplateVersionCreate: { type: "object", required: ["subject", "html"], properties: { subject: { type: "string" }, preview_text: { type: "string" }, html: { type: "string" }, text: { type: "string" }, source_format: { type: "string", enum: ["html", "visual"] }, visual_document: { type: ["object", "null"], additionalProperties: true }, variables_schema: ref("VariablesSchema"), change_note: { type: "string", maxLength: 500 } } },
      TemplateVersion: { allOf: [ref("TemplateVersionCreate"), { type: "object", properties: { id: { type: "string", format: "uuid" }, version_number: { type: "integer" }, status: { type: "string" }, created_by_name: { type: ["string", "null"] }, restored_from_version_id: { type: ["string", "null"], format: "uuid" }, restored_from_version_number: { type: ["integer", "null"] }, diagnostics: { type: "object", additionalProperties: true } } }] },
      Template: { type: "object", properties: { id: { type: "string", format: "uuid" }, key: { type: "string" }, name: { type: "string" }, channel: { type: "string" }, format: { type: "string" }, folder:{type:"string"},status: { type: "string",enum:["draft","published","archived"] }, duplicated_from_id:{type:["string","null"],format:"uuid",readOnly:true},published_version_id: { type: ["string", "null"], format: "uuid" }, version_id: { type: "string", format: "uuid" }, diagnostics: { type: "object", additionalProperties: true } } },
      TemplateDetail: { allOf: [ref("Template"), { type: "object", properties: { versions: { type: "array", items: ref("TemplateVersion") } } }] },
      Asset: { type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, original_name: { type: "string" }, mime_type: { type: "string", enum: ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain", "text/csv", "text/calendar"] }, byte_size: { type: "integer" }, width: { type: ["integer", "null"] }, height: { type: ["integer", "null"] }, folder: { type: "string" }, alt_text: { type: "string" }, sha256: { type: "string", readOnly: true }, usage_count: { type: "integer", readOnly: true }, url: { type: "string", readOnly: true }, archived_at: { type: ["string", "null"], format: "date-time" } } },
      AssetUpdate: { type: "object", minProperties: 1, properties: { name: { type: "string", maxLength: 200 }, folder: { type: "string", maxLength: 200 }, alt_text: { type: "string", maxLength: 500 }, status: { type: "string", enum: ["active", "archived"] } } },
      VisualBlock: { type: "object", required: ["id", "type", "content"], properties: { id: { type: "string" }, type: { type: "string", enum: ["heading", "text", "button", "image", "divider", "spacer"] }, content: { type: "string" }, url: { type: "string" }, asset_id: { type: "string", format: "uuid" }, alt: { type: "string" }, color: { type: "string" }, align: { type: "string", enum: ["left", "center", "right"] }, size: { type: "number" } } },
      ReusableBlockCreate: { type: "object", required: ["name", "block_document"], properties: { name: { type: "string", maxLength: 200 }, description: { type: "string", maxLength: 1000 }, folder: { type: "string", maxLength: 200 }, block_document: ref("VisualBlock") } },
      ReusableBlockUpdate: { type: "object", minProperties: 1, properties: { name: { type: "string", maxLength: 200 }, description: { type: "string", maxLength: 1000 }, folder: { type: "string", maxLength: 200 }, status: { type: "string", enum: ["active", "archived"] } } },
      ReusableBlock: { allOf: [ref("ReusableBlockCreate"), { type: "object", properties: { id: { type: "string", format: "uuid" }, created_by_name: { type: ["string", "null"] }, created_at: { type: "string", format: "date-time" }, updated_at: { type: "string", format: "date-time" }, archived_at: { type: ["string", "null"], format: "date-time" } } }] },
      CampaignCreate: { type: "object", required: ["name", "list_id", "subject"], oneOf: [{ required: ["template_version_id"] }, { required: ["content"] }], properties: { name: { type: "string" }, list_id: { type: "string", format: "uuid" }, subject: { type: "string" }, preview_text: { type: "string" }, from: { type: "object", required: ["name", "email"], properties: { name: { type: "string" }, email: { type: "string", format: "email" } } }, reply_to: { type: "string", format: "email" }, template_version_id: { type: "string", format: "uuid" }, content: { type: "object", required: ["html"], properties: { html: { type: "string" }, text: { type: "string" } } }, segment_id: { type: ["string", "null"], format: "uuid" }, exclusion_segment_ids: { type: "array", items: { type: "string", format: "uuid" } }, track_opens: { type: "boolean" }, track_clicks: { type: "boolean" },approval_required:{type:"boolean",default:false} } },
      CampaignUpdate: { type:"object",required:["version"],properties:{version:{type:"integer",minimum:1},name:{type:"string"},list_id:{type:"string",format:"uuid"},subject:{type:"string"},preview_text:{type:"string"},from:{type:"object",properties:{name:{type:"string"},email:{type:"string",format:"email"}}},reply_to:{type:"string",format:"email"},template_version_id:{type:"string",format:"uuid"},content:{type:"object",required:["html"],properties:{html:{type:"string"},text:{type:"string"}}},segment_id:{type:["string","null"],format:"uuid"},exclusion_segment_ids:{type:"array",items:{type:"string",format:"uuid"}},track_opens:{type:["boolean","null"]},track_clicks:{type:["boolean","null"]},approval_required:{type:"boolean"}} },
      CampaignTransition:{type:"object",properties:{id:{type:"string",format:"uuid"},from_status:{type:["string","null"]},to_status:{type:"string"},action:{type:"string"},detail:{type:"object",additionalProperties:true},created_at:{type:"string",format:"date-time"}}},
      CampaignAction:{oneOf:[{type:"object",required:["action","scheduled_at"],properties:{action:{const:"schedule"},scheduled_at:{type:"string",format:"date-time"}}},{type:"object",required:["action"],properties:{action:{type:"string",enum:["unschedule","pause","resume","cancel"]}}},{type:"object",required:["action","comment"],properties:{action:{type:"string",enum:["request_approval","approve","reject","comment"]},comment:{type:"string",minLength:1,maxLength:2000}}}]},
      CampaignActionResult:{type:"object",properties:{id:{type:"string",format:"uuid"},status:{type:"string"},scheduled_at:{type:["string","null"],format:"date-time"},recipients:{type:"integer"},queued:{type:"integer"},snapshotReused:{type:"boolean"},approval_required:{type:"boolean"},approved_version:{type:["integer","null"]},approved_at:{type:["string","null"],format:"date-time"}}},
      CampaignApprovalComment:{type:"object",properties:{id:{type:"string",format:"uuid"},action:{type:"string",enum:["request","approve","reject","comment","invalidated"]},comment:{type:"string"},campaign_version:{type:"integer"},actor_name:{type:"string"},actor_kind:{type:"string",enum:["user","api_key","system"]},created_at:{type:"string",format:"date-time"}}},
      CampaignExperimentVariantInput:{type:"object",required:["name","weight"],properties:{name:{type:"string",maxLength:80},weight:{type:"integer",minimum:1,maximum:99},subject:{type:"string",maxLength:998},preview_text:{type:"string",maxLength:200},from:{type:"object",required:["name","email"],properties:{name:{type:"string"},email:{type:"string",format:"email"}}},reply_to:{type:"string",format:"email"},template_version_id:{type:"string",format:"uuid"},content:{type:"object",required:["html"],properties:{html:{type:"string"},text:{type:"string"}}}}},
      CampaignExperimentConfigure:{type:"object",required:["version","sample_percentage","winner_metric","wait_minutes","minimum_sample_size","variants"],properties:{version:{type:"integer",minimum:1},sample_percentage:{type:"integer",minimum:10,maximum:90},winner_metric:{type:"string",enum:["opens","clicks","manual"]},wait_minutes:{type:"integer",minimum:0,maximum:10080},minimum_sample_size:{type:"integer",minimum:2},variants:{type:"array",minItems:2,maxItems:4,items:ref("CampaignExperimentVariantInput")}}},
      CampaignExperimentVariant:{allOf:[ref("CampaignExperimentVariantInput"),{type:"object",properties:{id:{type:"string",format:"uuid"},position:{type:"integer"},is_control:{type:"boolean"},sample_recipients:{type:"integer"},sample_delivered:{type:"integer"},sample_opened:{type:"integer"},sample_clicked:{type:"integer"},sample_open_rate:{type:"number"},sample_click_rate:{type:"number"},total_recipients:{type:"integer"},total_delivered:{type:"integer"},total_opened:{type:"integer"},total_clicked:{type:"integer"}}}]},
      CampaignExperiment:{type:"object",properties:{id:{type:"string",format:"uuid"},campaign_id:{type:"string",format:"uuid"},status:{type:"string",enum:["configured","sampling","waiting","winner_selected","completed","cancelled"]},sample_percentage:{type:"integer"},winner_metric:{type:"string",enum:["opens","clicks","manual"]},wait_minutes:{type:"integer"},minimum_sample_size:{type:"integer"},test_dimensions:{type:"array",items:{type:"string",enum:["subject","preview_text","sender","content"]}},actual_sample_size:{type:["integer","null"]},remainder_size:{type:["integer","null"]},winner_variant_id:{type:["string","null"],format:"uuid"},winner_source:{type:["string","null"]},evaluation_at:{type:["string","null"],format:"date-time"},warnings:{type:"array",items:{type:"string"}},variants:{type:"array",items:ref("CampaignExperimentVariant")}}},
      CampaignExperimentAction:{oneOf:[{type:"object",required:["action"],properties:{action:{const:"evaluate"}}},{type:"object",required:["action","variant_id"],properties:{action:{const:"select_winner"},variant_id:{type:"string",format:"uuid"}}}]},
      CampaignExperimentWinner:{type:"object",properties:{campaign_id:{type:"string",format:"uuid"},status:{const:"winner_selected"},winner_variant_id:{type:"string",format:"uuid"},winner_name:{type:"string"},winner_source:{type:"string",enum:["opens","clicks","manual"]},queued:{type:"integer"}}},
      Campaign: { type: "object", additionalProperties: true, properties: { id: { type: "string", format: "uuid" },version:{type:"integer"},duplicated_from_id:{type:["string","null"],format:"uuid"}, name: { type: "string" }, status: { type: "string",enum:["draft","pending_approval","scheduled","preparing","queued","sending","paused","completed","cancelled","failed"] },approval_required:{type:"boolean"},approved_at:{type:["string","null"],format:"date-time"},approved_version:{type:["integer","null"]}, total_recipients: { type: "integer" }, delivered_count: { type: "integer" } } },
      CampaignDetail: { allOf: [ref("Campaign"), { type: "object", properties: { recipients: { type: "array", items: { type: "object", additionalProperties: true } },transitions:{type:"array",items:ref("CampaignTransition")},approval_comments:{type:"array",items:ref("CampaignApprovalComment")},experiment:{oneOf:[ref("CampaignExperiment"),{type:"null"}]} } }] },
      ReportSummary:{type:"object",properties:{sent:{type:"integer"},delivered:{type:"integer"},unique_opens:{type:"integer"},total_opens:{type:"integer"},unique_clicks:{type:"integer"},total_clicks:{type:"integer"},bounced:{type:"integer"},complained:{type:"integer"},unsubscribed:{type:"integer"},delivery_rate:{type:"number"},open_rate:{type:"number"},click_rate:{type:"number"},click_to_open_rate:{type:"number"}}},
      CampaignsReport:{type:"object",properties:{range:{type:"object",additionalProperties:true},summary:ref("ReportSummary"),comparison:{type:"object",additionalProperties:true},benchmarks:{type:"object",additionalProperties:{type:"number"}},daily:{type:"array",items:{type:"object",additionalProperties:true}},campaigns:{type:"array",items:{type:"object",additionalProperties:true}},dimensions:{type:"array",items:{type:"object",properties:{key:{type:"string"},label:{type:"string"},type:{type:"string",enum:["select","multiselect","boolean"]}}}},field_breakdown:{type:["object","null"],additionalProperties:true},segment_breakdown:{type:"object",additionalProperties:true},client_signals:{type:"object",additionalProperties:true}}},
      TransactionalReport:{type:"object",properties:{range:{type:"object",additionalProperties:true},summary:{allOf:[ref("ReportSummary"),{type:"object",properties:{avg_processing_ms:{type:["number","null"]},p95_processing_ms:{type:["number","null"]},avg_delivery_ms:{type:["number","null"]},p95_delivery_ms:{type:["number","null"]}}}]},comparison:{type:"object",additionalProperties:true},daily:{type:"array",items:{type:"object",additionalProperties:true}},statuses:{type:"array",items:{type:"object",additionalProperties:true}},templates:{type:"array",items:{type:"object",additionalProperties:true}}}},
      AudienceReport:{type:"object",properties:{range:{type:"object",additionalProperties:true},summary:{type:"object",properties:{additions:{type:"integer"},removals:{type:"integer"},net:{type:"integer"},active:{type:"integer"},pending:{type:"integer"},unsubscribed:{type:"integer"}}},comparison:{type:"object",additionalProperties:true},daily:{type:"array",items:{type:"object",additionalProperties:true}},sources:{type:"array",items:{type:"object",additionalProperties:true}},lists:{type:"array",items:{type:"object",additionalProperties:true}},suppressions:{type:"array",items:{type:"object",additionalProperties:true}}}},
      CampaignReport:{type:"object",properties:{campaign:ref("Campaign"),summary:ref("ReportSummary"),granularity:{type:"string",enum:["minute","hour","day"]},timeline:{type:"array",items:{type:"object",additionalProperties:true}},links:{type:"array",items:{type:"object",additionalProperties:true}},statuses:{type:"array",items:{type:"object",additionalProperties:true}},failures:{type:"array",items:{type:"object",additionalProperties:true}},audience_sources:{type:"array",items:{type:"object",additionalProperties:true}},experiment:{oneOf:[ref("CampaignExperiment"),{type:"null"}]},recipients:{type:"array",items:{type:"object",additionalProperties:true}},pagination:{type:"object",properties:{page:{type:"integer"},limit:{type:"integer"},total:{type:"integer"},pages:{type:"integer"}}},content_preview_url:{type:["string","null"]},privacy:{type:"object",additionalProperties:true}}},
      DeliverabilityAction:{oneOf:[{type:"object",required:["action"],properties:{action:{const:"check_connection"}}},{type:"object",required:["action","email"],properties:{action:{const:"send_test"},email:{type:"string",format:"email"}}},{type:"object",required:["action"],properties:{action:{const:"preview_suppressions"}}},{type:"object",required:["action"],properties:{action:{const:"sync_suppressions"},mode:{type:"string",enum:["import","bidirectional"]}}},{type:"object",required:["action","paused"],properties:{action:{const:"set_sending_paused"},paused:{type:"boolean"},reason:{type:"string",maxLength:1000}}},{type:"object",required:["action","alert_id"],properties:{action:{const:"resolve_alert"},alert_id:{type:"string",format:"uuid"},note:{type:"string",maxLength:1000}}}]},
      DeliverabilityDashboard:{type:"object",properties:{mode:{type:"object",additionalProperties:true},health:{type:"object",additionalProperties:true},reputation:{type:"object",additionalProperties:true},alerts:{type:"array",items:{type:"object",additionalProperties:true}},suppressions:{type:"object",additionalProperties:true},thresholds:{type:"object",additionalProperties:{type:"number"}},guidance:{type:"object",additionalProperties:true}}},
      OperationsDashboard:{type:"object",properties:{configuration:{type:"object",additionalProperties:true},queues:{type:"object",additionalProperties:true},workers:{type:"array",items:{type:"object",additionalProperties:true}},storage:{type:"array",items:{type:"object",additionalProperties:true}},database:{type:"object",additionalProperties:true},runs:{type:"array",items:{type:"object",additionalProperties:true}},dead_letters:{type:"array",items:{type:"object",additionalProperties:true}}}},
      OperationsAction:{oneOf:[{type:"object",required:["action","id"],properties:{action:{const:"retry_dead_letter"},id:{type:"string",format:"uuid"}}},{type:"object",required:["action","id"],properties:{action:{const:"resolve_dead_letter"},id:{type:"string",format:"uuid"}}},{type:"object",required:["action"],properties:{action:{const:"run_retention"}}},{type:"object",required:["action"],properties:{action:{const:"reconcile_blobs"}}}]},
      MfaSetup:{type:"object",properties:{secret:{type:"string",writeOnly:true},uri:{type:"string",writeOnly:true},qr_data_url:{type:"string",writeOnly:true}}},
      MfaEnabled:{type:"object",properties:{enabled:{const:true},recovery_codes:{type:"array",items:{type:"string",writeOnly:true}}}},
      CampaignPreflight: { type: "object", properties: { valid: { type: "boolean" }, errors: { type: "array", items: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } }, warnings: { type: "array", items: { type: "object", additionalProperties: true } }, audience: { type: ["object", "null"], additionalProperties: true } } },
      CampaignLaunch: { type: "object", properties: { id: { type: "string", format: "uuid" }, status: { type: "string", example: "sending" }, recipients: { type: "integer" }, duplicate: { type: "boolean" } } },
      TransactionalAttachment: { type: "object", required: ["asset_id"], properties: { asset_id: { type: "string", format: "uuid", description: "Activo previamente cargado mediante /api/v1/assets." }, filename: { type: "string", maxLength: 240 }, disposition: { type: "string", enum: ["attachment", "inline"], default: "attachment" }, content_id: { type: "string", description: "CID para imágenes inline." } } },
      TransactionalSend: { type: "object", required: ["to"], oneOf: [{ required: ["template_key"] }, { required: ["template_version_id"] }, { required: ["subject", "html"] }], properties: { to: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" }, name: { type: "string" } } }, from: { type: "object", properties: { email: { type: "string", format: "email" }, name: { type: "string" } } }, reply_to: { type: "string", format: "email" }, template_key: { type: "string" }, template_version_id: { type: "string", format: "uuid" }, subject: { type: "string" }, html: { type: "string" }, text: { type: "string" }, variables: { type: "object", additionalProperties: { type: ["string", "number", "boolean", "null"] } }, metadata: { type: "object", additionalProperties: true }, track_opens: { type: "boolean" }, track_clicks: { type: "boolean" }, attachments: { type: "array", maxItems: 10, items: ref("TransactionalAttachment") } } },
      TransactionalBatch: { type: "object", required: ["messages"], properties: { messages: { type: "array", minItems: 1, maxItems: 100, items: ref("TransactionalSend") } } },
      TransactionalBatchItem: { type: "object", required: ["index"], properties: { index: { type: "integer", minimum: 0 }, id: { type: "string", format: "uuid" }, status: { type: "string" }, duplicate: { type: "boolean" }, error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } },
      TransactionalBatchAccepted: { type: "object", properties: { id: { type: "string", format: "uuid" }, status: { type: "string" }, total: { type: "integer" }, accepted: { type: "integer" }, failed: { type: "integer" }, duplicate: { type: "boolean" }, results: { type: "array", items: ref("TransactionalBatchItem") }, status_url: { type: "string" } } },
      TransactionalBatchStatus: { allOf: [ref("TransactionalBatchAccepted"), { type: "object", properties: { created_at: { type: "string", format: "date-time" }, completed_at: { type: ["string", "null"], format: "date-time" } } }] },
      TemplateRender: { type: "object", oneOf: [{ required: ["template_key"] }, { required: ["template_version_id"] }], properties: { template_key: { type: "string" }, template_version_id: { type: "string", format: "uuid" }, variables: { type: "object", additionalProperties: true } } },
      RenderedContent: { type: "object", properties: { template_version_id: { type: "string", format: "uuid" }, subject: { type: "string" }, html: { type: "string" }, text: { type: "string" }, diagnostics: { type: "object", additionalProperties: true } } },
      MessageAccepted: { type: "object", properties: { id: { type: "string", format: "uuid" }, status: { type: "string" }, duplicate: { type: "boolean" }, mime_byte_size:{type:"integer",minimum:1,description:"Bytes exactos del mensaje RFC/MIME persistido y enviado."},mime_limit_bytes:{type:"integer",minimum:1},created_at: { type: "string", format: "date-time" }, status_url: { type: "string" } } },
      Message: { type: "object", additionalProperties: true, properties: { id: { type: "string", format: "uuid" }, to_email: { type: "string", format: "email" }, subject: { type: "string" }, status: { type: "string" },mime_byte_size:{type:["integer","null"],minimum:1}, metadata: { type: "object", additionalProperties: true } } },
      MessageDetail: { allOf: [ref("Message"), { type: "object", properties: { batch_id: { type: ["string", "null"], format: "uuid" }, batch_position: { type: ["integer", "null"] }, retry_of_message_id: { type: ["string", "null"], format: "uuid" }, can_retry: { type: "boolean" }, attachments: { type: "array", items: { allOf: [ref("TransactionalAttachment"), { type: "object", properties: { id: { type: "string", format: "uuid" }, filename: { type: "string" }, content_type: { type: "string" }, byte_size: { type: ["integer", "null"] } } }] } }, attempts: { type: "array", items: { type: "object", properties: { attempt_number: { type: "integer" }, kind: { type: "string", enum: ["automatic", "manual_retry"] }, status: { type: "string", enum: ["started", "succeeded", "failed"] }, transport: { type: "string" }, provider_message_id: { type: ["string", "null"] }, error_code: { type: ["string", "null"] }, error_message: { type: ["string", "null"] }, started_at: { type: "string", format: "date-time" }, finished_at: { type: ["string", "null"], format: "date-time" } } } }, events: { type: "array", items: { type: "object", additionalProperties: true } }, html_url: { type: "string" }, text_url: { type: "string" } } }] },
      ImportPreview: { type: "object", properties: { encoding: { type: "string", example: "UTF-8" }, delimiter: { type: "string" }, headers: { type: "array", items: { type: "string" } }, rows: { type: "array", items: { type: "object", additionalProperties: { type: "string" } } }, suggested_mapping: { type: "object", additionalProperties: { type: "string" } } } },
      ExportCreate: { type: "object", properties: { list_id: { type: "string", format: "uuid" }, status: { type: "string" }, columns: { type: "array", items: { type: "string" } }, include_bom: { type: "boolean", default: true } } },
      JobAccepted: { type: "object", properties: { id: { type: "string", format: "uuid" }, duplicate: { type: "boolean" }, status_url: { type: "string" } } },
      DataJob: { type: "object", additionalProperties: true, properties: { id: { type: "string", format: "uuid" }, status: { type: "string", enum: ["pending", "running", "completed", "failed", "cancelled"] }, progress: { type: "integer", minimum: 0, maximum: 100 }, total_rows: { type: "integer" }, processed_rows: { type: "integer" }, result: { type: "object", additionalProperties: true }, error: { type: ["string", "null"] }, has_errors: { type: "boolean" }, rollback_at: { type: ["string", "null"], format: "date-time" } } },
      WebhookCreate: { type: "object", required: ["name", "url", "events"], properties: { name: { type: "string" }, url: { type: "string", format: "uri" }, events: { type: "array", items: { type: "string" } }, filters: { type: "object", additionalProperties: true }, secret: { type: "string", description: "Opcional. Si se omite se genera y devuelve una sola vez." } } },
      Webhook: { allOf: [ref("WebhookCreate"), { type: "object", properties: { id: { type: "string", format: "uuid" }, status: { type: "string" }, failure_count: { type: "integer" }, created_at: { type: "string", format: "date-time" } } }] },
      ApiKeyCreate: { type: "object", required: ["name", "scopes"], properties: { name: { type: "string" }, scopes: { type: "array", minItems: 1, items: { type: "string", enum: ["*", "lists:read", "lists:write", "contacts:read", "contacts:write", "templates:read", "templates:write", "campaigns:read", "campaigns:write", "campaigns:send", "campaigns:approve", "transactional:send", "transactional:read", "events:read", "reports:read", "settings:read", "settings:write", "webhooks:read", "webhooks:write"] } }, expires_at: { type: ["string", "null"], format: "date-time" } } },
      ApiKey: { type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, prefix: { type: "string" }, scopes: { type: "array", items: { type: "string" } }, expires_at: { type: ["string", "null"], format: "date-time" }, last_used_at: { type: ["string", "null"], format: "date-time" }, revoked_at: { type: ["string", "null"], format: "date-time" } } },
      ApiKeyCreated: { allOf: [ref("ApiKey"), { type: "object", properties: { token: { type: "string", writeOnly: true, description: "Se muestra una sola vez." } } }] },
      UserCreate: { type: "object", required: ["email", "name", "role", "password"], properties: { email: { type: "string", format: "email" }, name: { type: "string", maxLength: 200 }, role: { type: "string", enum: ["admin", "editor", "analyst"] }, password: { type: "string", minLength: 12, writeOnly: true } } },
      UserUpdate: { type: "object", minProperties: 1, properties: { name: { type: "string", maxLength: 200 }, role: { type: "string", enum: ["admin", "editor", "analyst"] }, status: { type: "string", enum: ["active", "disabled"] } } },
      User: { type: "object", properties: { id: { type: "string", format: "uuid" }, email: { type: "string", format: "email" }, name: { type: "string" }, role: { type: "string" }, status: { type: "string" }, mfa_enabled: { type: "boolean" }, active_sessions: { type: "integer" }, last_login_at: { type: ["string", "null"], format: "date-time" }, created_at: { type: "string", format: "date-time" } } },
      UserSession: { type: "object", properties: { id: { type: "string", format: "uuid" }, label: { type: "string" }, ip: { type: ["string", "null"] }, user_agent: { type: "string" }, current: { type: "boolean" }, created_at: { type: "string", format: "date-time" }, last_used_at: { type: "string", format: "date-time" }, expires_at: { type: "string", format: "date-time" } } },
    },
  },
} as const;
