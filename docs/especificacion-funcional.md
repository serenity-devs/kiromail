# KiroMail — Especificación funcional completa

**Versión:** 1.0.0-rc.2
**Fecha:** 11 de agosto de 2026
**Estado:** desplegado en producción en modo seguro; activación de correo pendiente
**Objetivo:** definir todo lo necesario para convertir KiroMail en una plataforma autoinstalable de newsletters y email transaccional, completa, fiable y cómoda de usar con Amazon SES.

---

## Estado de implementación

**Última actualización:** 11 de agosto de 2026
**Estado global:** desplegado en producción en modo seguro; activación de correo pendiente
**Checkpoint actual:** `1.0.0-rc.2` está instalado en el VPS compartido con app, worker, PostgreSQL, Redis y backup aislados, sin puertos propios ni reinicios de la aplicación preexistente. GitHub publica imágenes inmutables verificadas y un timer del servidor las instala con backup, migración, healthcheck y rollback, sin intercambiar claves SSH ni tokens persistentes. DNS directo, HTTPS público, HSTS y renovación automática de Let's Encrypt están operativos. La suite 49/49, lint, build y los ensayos Docker están verdes. La app está disponible para completar el onboarding; quedan la cuenta SES/SNS real, la identidad remitente, dirección postal y MFA antes de que readiness permita envíos.

| Bloque | Estado | Progreso verificable |
|---|---|---|
| 1. Fundamentos y datos | Completado | Migraciones `001`–`024` aplicadas desde cero y ensayadas desde la versión inmediatamente anterior. El esquema incluye recuperación MFA, políticas de retención, heartbeats, ejecuciones operativas, métricas agregadas, DLQ persistente, solicitudes de privacidad, trazas de fusión, procedencia de copias, blobs/tamaño MIME por mensaje y revisiones monotónicas de recursos editables. Índices parciales cubren comparativas por lista/segmento y señales de interacción. El backend S3, cifrado en servidor, gzip/hash y tareas de retención están implementados. |
| 2. Gestión de audiencia | Completado | API v1 de contactos globales, listas, campos tipados y suscripciones con validación, paginación y consentimiento. Alta pública, confirmación, baja, centro de preferencias, «baja todas» y reactivación explícita operativos. Importación/exportación CSV, constructor visual de campos, gestión histórica de supresiones y acciones masivas con selección, worker, progreso, cancelación, idempotencia y auditoría están integrados en API y UI. La fusión manual consolida campos, etiquetas, suscripciones, consentimientos e historial sin reactivar bajas; el registro descartado queda enlazado y su correo suprimido permanentemente. La exportación individual y la anonimización revocan tokens, eliminan PII y previsualizaciones, conservan métricas no personales y bloquean cualquier reentrada del correo. Listas y segmentos pueden duplicarse, archivarse y restaurarse; los campos archivados se restauran desde el mismo gestor. El constructor de segmentos permite campos globales y propios de lista, tipos, grupos anidados, actividad de campaña durante los últimos N días, explicación, ejemplos, recuento vivo, edición e histórico diario, y se recalcula al preparar campañas. La lista local es la autoridad previa al envío y dispone de preview, importación o conciliación aditiva bidireccional opcional con SES. |
| 3. Contenido | Completado para el alcance práctico | CRUD API v1 con clave/canal, versiones inmutables, diagnóstico, publicación explícita, render y duplicación fiel. La biblioteca filtra por búsqueda/canal/estado/carpeta, ordena, mueve, selecciona en masa y archiva/restaura sin tocar campañas históricas. El editor visual/HTML vive en ruta propia, incluye seis bases, bloques esenciales más lista/cita, tema de marca, escritorio/móvil, texto plano, autoguardado local, deshacer/rehacer por botón o teclado e historial restaurable. Imágenes y bloques reutilizables fijan dependencias. El compilador genera HTML determinista de tablas con estilos inline, preencabezado, responsive y correcciones base para Outlook; el diagnóstico cubre seguridad, alt, títulos, enlaces, HTTP, técnicas incompatibles, peso Gmail y exceso de imágenes. La batería automatizada define el perfil `gmail-apple-outlook-baseline-v1`; la comprobación física en clientes reales forma parte de la puesta en producción, no del repositorio. |
| 4. Transaccionales | Completado para el alcance funcional | HTML directo y plantilla publicada operativos por API con idempotencia, cola reservada, estados, eventos, tracking, consulta y explorador UI con previsualización histórica. El endpoint batch admite 1–100 mensajes; los adjuntos usan activos validados, máximo 10 y 8 MiB configurables. Antes de devolver `202` se construye el RFC/MIME final con tracking, alternativas, cabeceras y base64, se rechaza si supera `TRANSACTIONAL_MIME_MAX_BYTES`, y el mismo blob gzip/SHA-256 se entrega a SES Raw o SMTP. Registro, blob e intento conservan el tamaño exacto; los mensajes antiguos se materializan al enviarse y cada reintento genera su MIME propio. Anonimizar elimina también este blob con PII. DLQ, S3, retención, supresiones y trazabilidad de intentos están integrados. |
| 5. Campañas y motor | Completado para el alcance funcional | API v1 con HTML directo o versión publicada, lista principal, snapshot, preflight/estimación, exclusiones, confirmación e idempotencia de lanzamiento; motor guarda HTML/texto exactos por destinatario. Edición de borradores/programadas con versión optimista, duplicación exacta, programación/retirada, pausa, reanudación y cancelación están disponibles en API y UI con transiciones auditables. La reanudación reutiliza el snapshot existente; trabajos nuevos tienen ID de ejecución y cada destinatario pasa de `queued` a `processing` mediante reclamación atómica, con recuperación de intentos temporales. La aprobación opcional y las pruebas A/B están completas. El preflight y el worker respetan remitentes permitidos, pausa global y configuración de salud SES. El detalle analítico final incorpora embudo, actividad temporal, estado/fallos por destinatario, enlaces, HTML histórico, fuentes de audiencia, variantes y descargas CSV. El diagnóstico de plantillas aporta las comprobaciones preventivas de compatibilidad y riesgo práctico. |
| 6. SES y entregabilidad | Completado localmente | Asistente y panel completo para Mailpit/SES: región, acceso, sandbox/producción, cuotas, identidades, DKIM, MAIL FROM, Configuration Sets separados, cobertura completa de eventos y Topics SNS autorizados. El receptor verifica firma/certificado/origen, soporta varios destinatarios y deduplica; rebotes permanentes y quejas suprimen globalmente, mientras los transitorios conservan diagnóstico. Hay fuente única de tracking, reputación 7/30 días, alertas configurables, conciliación programada con la lista SES, prueba técnica y pausa/reanudación global. Solo falta validar credenciales, DNS y TopicArn reales de la cuenta AWS de producción, una acción externa al repositorio. |
| 7. Informes | Completado para el alcance funcional | Informes separados de campañas, transaccionales y audiencia con intervalo, lista, tendencias, medianas, estados, adquisición, latencia media/P95 y CSV auditado. Cada canal compara con el periodo anterior equivalente. Campañas incorpora embudo, incidencias, enlaces/mapa, HTML, A/B, destinatarios/eventos, rendimiento por segmento y por valores categóricos del snapshot; exige lista, admite solo campos `select`/`multiselect`/`boolean` y oculta grupos menores de cinco. La taxonomía ampliable solo muestra clientes/dispositivos con firma explícita, 20 señales, ≥80% clasificadas y grupos ≥5; si no, explica por qué no infiere. Automatización probable queda fuera de únicos y ganadores, sin borrar hechos brutos. |
| 8. Producción | Desplegado; onboarding SES pendiente | Docker, healthchecks separados, workers BullMQ, RBAC, sesiones revocables, scrypt, fuerza bruta, recuperación, TOTP, cifrado, CSRF, CSP/HSTS, rate limiting Redis, request ID, logs, Prometheus, heartbeats, DLQ, filesystem/S3 y retención validados. El VPS ejecuta un stack aislado sin puertos públicos, con DNS y HTTPS efectivos, artefactos inmutables, actualización automática, migración y rollback. App, worker, PostgreSQL, Redis y backup cifrado están activos; la aplicación preexistente conserva sus contenedores originales. Readiness permanece cerrado hasta completar SES/SNS, remitente, dirección postal y MFA. La carga con 100.000 contactos, accesibilidad WCAG AA, backup/restauración y actualización/rollback están verificadas y documentadas. |
| 9. API e integraciones | Completado para el alcance funcional | Contrato OpenAPI 3.1 servido por la instalación con 77 rutas y 120 operaciones, incluidas audiencias, contenido, campañas/A-B, transaccionales/batch, informes/exportaciones, entregabilidad, operaciones, privacidad, usuarios, sesiones y webhooks. Todas las respuestas pasan por request ID y límites Redis. Los recursos editables principales exponen ETag por cabecera y cuerpo; las mutaciones condicionadas y sus respuestas 412/428 están documentadas y verificadas E2E. |

### Registro de continuidad

- **2026-08-04 — Auditoría inicial:** aplicación Next.js con PostgreSQL, Redis/BullMQ, Mailpit, SES v2 y Docker operativa. El esquema vigente usa `contact_lists` sin estado, campos ni consentimiento; `templates` no tiene versiones; `campaign_recipients` es el único registro de mensajes; `email_events` está ligado a campañas; autenticación mediante un único administrador configurado por entorno.
- **2026-08-04 — Fundamentos persistidos:** creada y aplicada `003_platform_foundations.sql`. PostgreSQL confirma 7 suscripciones migradas, 7 eventos de consentimiento, 2 versiones publicadas y 3 mensajes históricos enlazados. La semilla es idempotente y funciona sobre la base migrada. El build de producción compila con el nuevo modelo.
- **2026-08-04 — Transaccional HTML directo E2E:** añadidos blobs inmutables comprimidos y deduplicados, volumen Docker compartido, claves API con hash y scopes, `POST /api/v1/transactional/send`, consulta/listado/contenido, tracking propio por mensaje y cola BullMQ separada. Prueba Docker superada: primera petición `202`, repetición idéntica devuelve el mismo ID, reutilización distinta devuelve `409`; Mailpit entrega el mensaje y la línea temporal conserva `accepted`, `queued`, `processed`, `sent`, `delivered`, `opened` y `clicked`, manteniendo el estado operativo `delivered`. La clave de prueba fue revocada.
- **2026-08-04 — Plantillas API y envío por clave E2E:** añadidos CRUD/archivo, creación de versiones, diagnóstico, publicación explícita y render de plantillas en API v1. Se creó y publicó `pedido_confirmado_e2e`, se renderizó con variables y se entregó por `template_key`; el mensaje conserva `template_version_id` y contenido final. La clave efímera volvió a revocarse.
- **2026-08-04 — Suscripciones independientes E2E:** añadida API v1 de listas, campos y suscripciones. El mismo contacto se suscribió a `futbol_e2e` con `fecha_registro`, `sexo` y `equipo_preferido`, y a `agenda_e2e` con `ciudad` y `frecuencia`. Tras la baja de Fútbol, Agenda permaneció activa, el alta genérica no pudo reactivar silenciosamente (`409`) y un transaccional legítimo se entregó. PostgreSQL conserva tres hechos separados de consentimiento. La clave de prueba fue revocada.
- **2026-08-04 — Campaña API/snapshot E2E:** aplicada `004_campaign_snapshots.sql` y añadida API v1 de campañas. Una campaña de HTML directo sobre `agenda_e2e` pasó preflight con un destinatario, se lanzó con confirmación de audiencia, terminó entregada y una repetición de la misma clave devolvió la campaña existente sin duplicar. El HTML histórico recuperado contiene `Clara`, el valor de lista `Madrid`, enlaces rastreados, pie legal y baja de esa campaña; queda almacenado como blob exacto. Esto demuestra además que la baja en Fútbol no impide enviar desde Agenda. La clave de prueba fue revocada.
- **2026-08-04 — Contactos, SNS y webhooks:** añadida API v1 de contactos con estado global y acciones explícitas. El receptor SES valida URLs de certificado Amazon, firma SNS v1/v2, TopicArn permitido, tamaño y deduplicación; normaliza eventos y aplica supresiones por rebote/queja. La outbox de webhooks firma cada entrega, cifra secretos en reposo, bloquea destinos privados por defecto y reintenta con backoff. Prueba E2E controlada contra un receptor Docker interno superada y configuración insegura restaurada al terminar.
- **2026-08-04 — Pantallas transaccionales y editor:** integrada navegación transaccional con filtros, detalle, HTML/texto exactos, metadata y línea temporal. Las plantillas se crean/editan ahora en una página completa con modo visual o HTML, bloques esenciales, propiedades, estructura, vista escritorio/móvil, autoguardado y publicación versionada. Campañas y ajustes heredados se reconciliaron con listas principales y configuración separada por canal. `next build` y la suite automatizada pasan (6/6).
- **2026-08-04 — Validación visual Docker:** reconstruidos `app` y `worker`; healthcheck correcto. Flujo real verificado desde login: navegación a transaccionales, apertura de un mensaje con contenido exacto y siete eventos, biblioteca de plantillas y carga del editor visual completo. La consola del navegador no registra errores.
- **2026-08-04 — Doble opt-in y preferencias E2E:** aplicada `006_public_preferences.sql`. Los tokens públicos son opacos, solo se almacena su hash, tienen propósito/caducidad y se pueden revocar. El alta pública de Lucía quedó `pending`, generó un email local y solo pasó a `active` tras confirmar; se conservaron IP/agente/origen y el evento `confirmed`. Una campaña posterior añadió baja y centro de preferencias al HTML exacto. Desde el centro se probó baja global promocional, reactivación explícita y edición de `frecuencia`; la baja RFC 8058 repetida dos veces devolvió éxito ambas veces y creó una sola evidencia. Durante el E2E se detectó y corrigió un token sin `list_id`; la prueba repetida pasó. La cookie administrativa temporal fue eliminada.
- **2026-08-04 — Importación/exportación asíncrona E2E:** aplicada `007_data_jobs.sql` y añadido worker BullMQ de datos con recuperación. El preview detectó UTF-8, coma, cabeceras y tres filas; una importación real creó un contacto y una suscripción, rechazó el email inválido y omitió el duplicado. Repetir la misma `Idempotency-Key` devolvió el mismo trabajo. El CSV de errores fue descargable, la exportación con columnas elegidas generó tres filas con BOM UTF-8 y el rollback archivó únicamente la suscripción creada, conservando el contacto, el historial y una nueva evidencia de consentimiento. Desde navegador se verificaron carga de archivo, lista, mapeo de campos globales/propios, ejecución, progreso, incidencias y descarga; la consola quedó limpia. El mapeo automático ahora prioriza campos propios de la lista cuando la cabecera coincide. `next build`, lint y pruebas automatizadas pasan (7/7).
- **2026-08-04 — OpenAPI y referencia integrada:** publicada `/api/openapi` en OpenAPI 3.1 con 36 rutas reales, esquemas reutilizables, seguridad Bearer/cookie, scopes, cabeceras idempotentes, cargas multipart y tipos de descarga. `/api-docs` ofrece búsqueda, secciones y ejemplos ejecutables para cURL, JavaScript, PHP y Python, además de descarga para Postman/Insomnia; está enlazado desde Ajustes. Docker devolvió HTTP 200, `application/json` y 82.767 bytes; desde navegador se verificaron cambio a Python, filtro de `transactional/send` y ausencia de errores. Suite automatizada 9/9.
- **2026-08-04 — Usuarios, roles y sesiones E2E:** aplicada `008_user_auth.sql`. El administrador de entorno solo inicializa la primera cuenta; PostgreSQL confirma dos usuarios con hash `scrypt` salado y tokens de sesión almacenados como SHA-256 de 64 caracteres. Se añadieron sesiones independientes de siete días, revocación por dispositivo, desactivación inmediata, intentos limitados, recuperación por enlace de una hora y un solo uso, auditoría y salvaguarda del último administrador. La matriz conecta administrador/editor/analista tanto a API v1 como a mutaciones heredadas y oculta datos/acciones en UI. Un analista real vio solo Inicio/Campañas/Informes/Ajustes, obtuvo 403 al escribir ajustes, 401 al crear listas y 200 al leer campañas; desactivarlo invalidó la sesión de inmediato y el último administrador devolvió 409. El reset llegó a Mailpit, la contraseña antigua pasó a 401, la nueva a 200 y reutilizar el enlace a 410. La cuenta E2E quedó desactivada, las cookies temporales eliminadas y solo permanece la sesión administrativa del navegador. Build, lint, consola y suite pasan (11/11).
- **2026-08-04 — Listas, supresiones y acciones masivas E2E:** aplicada `009_audience_management.sql`. La configuración visual de lista incluye remitente, consentimiento, alta pública, doble opt-in, preferencias y columnas propias con once tipos, opciones, validación, visibilidad, orden y archivo no destructivo. La lista de supresión filtra por estado/alcance, crea bloqueos y resuelve o reactiva conservando fecha, usuario y nota; rebotes, quejas y bloqueos posteriores reactivan el registro. La selección de contactos lanza trabajos BullMQ idempotentes de alta, baja, archivo o bloqueo con progreso/cancelación/auditoría; reactivar bajas exige una casilla explícita. E2E creó y archivó un campo, resolvió una supresión con nota, creó y archivó una pertenencia mediante el worker y confirmó en PostgreSQL que un intento de alta sin permiso dejó la suscripción previa en `unsubscribed` (`changed=0`, `skipped=1`). La referencia OpenAPI cubre ahora 43 rutas. Build y lint pasan; una pestaña nueva del navegador no registra errores.
- **2026-08-04 — Segmentos tipados E2E:** aplicada `010_typed_segments.sql`, que migra las reglas legadas a definiciones agrupadas y añade recuento actual e histórico diario. El compilador parametriza valores y admite grupos anidados «todas/cualquiera», campos globales, estado y fechas de suscripción, campos propios validados contra su tipo y actividad de campañas de la misma lista. La API v1 incorpora listado, alta, consulta, edición, archivo/restauración y preview; la referencia OpenAPI alcanza 46 rutas. El constructor visual cambia operadores y controles según el tipo, muestra explicación, recuento y ejemplos en vivo y conserva la definición al editar. E2E creó `Segmento tipado E2E` sobre `Agenda cultural E2E` con `frecuencia = semanal` y un grupo anidado `email contiene example.com`, obtuvo exactamente 2 coincidencias, guardó y editó correctamente; una pestaña nueva no registró errores. Build, lint y suite automatizada pasan (12/12).
- **2026-08-04 — Activos, bloques e historial de plantillas E2E:** aplicada `011_content_library.sql`. La API v1 incorpora biblioteca de imágenes con firma binaria real, MIME, límite de 5 MB, SHA-256, dimensiones, búsqueda, archivo/restauración, contenido público inmutable con ETag y usos fijados a cada versión. Los bloques reutilizables guardan una selección y siempre se insertan como copia independiente. Las versiones guardan autor, nota y origen de restauración; restaurar copia contenido y dependencias a una versión borrador nueva, conservando el historial y la publicada. E2E subió `Pixel E2E` (PNG 1×1) con una clave efímera luego revocada, lo insertó dos veces mediante un bloque reutilizable y cambió solo la copia, guardó v2 con dos dependencias, previsualizó v1 y la restauró como v3 sin tocar la publicación. PostgreSQL confirma v1/v2/v3, dos usos solo en v2 y el bloque de prueba archivado; el activo sigue sirviendo HTTP 200 con `immutable`, ETag y `nosniff`. OpenAPI alcanza 52 rutas; build, lint, suite 14/14 y una pestaña limpia sin errores.
- **2026-08-04 — Lotes, adjuntos y reintento transaccional E2E:** aplicada `012_transactional_batches.sql`. `POST /api/v1/transactional/batch` acepta hasta 100 mensajes y persiste el resultado individual; repetir la clave devuelve el mismo lote y no duplica mensajes. Los adjuntos se referencian por `asset_id`, validan firma/MIME/nombre/disposición, rechazan activos archivados y ejecutables, y se construyen tanto con SES v2 como con SMTP local. El detalle administrativo muestra lote, origen del reintento, HTML/texto exactos, adjuntos e intentos; los fallos sin `messageId` pueden reintentarse con confirmación, creando un registro nuevo enlazado. El E2E `684884cd` creó un PDF de 103 bytes, obtuvo un lote con un mensaje aceptado y otro `recipient_suppressed`, repitió lote y reintento idempotentemente, y Mailpit recibió el PDF en el envío inicial y el manual. PostgreSQL conserva lote, posiciones, intento fallido controlado, reintento exitoso y relación `retry_of_message_id`; la clave efímera fue revocada y la supresión de prueba quedó resuelta. OpenAPI alcanza 55 rutas; build, lint y suite pasan (15/15). En navegador se comprobaron el contenido exacto, el adjunto, los intentos y la acción protegida de reintento.
- **2026-08-04 — Ciclo avanzado de campañas E2E:** aplicada `013_campaign_lifecycle.sql`, con versión optimista, origen de duplicación, tiempos de pausa/cancelación, historial de transiciones y estado `processing` por destinatario. API v1 añade `PATCH` seguro, duplicación y acciones de programación, retirada, pausa, reanudación y cancelación. Reanudar nunca recalcula la audiencia: genera una ejecución nueva sobre los `queued` del snapshot existente, mientras una actualización condicional impide que dos trabajos envíen el mismo destinatario. El E2E `ca857d3f` creó seis suscriptores, editó de v1 a v2, rechazó una edición obsoleta con 409, programó/retiró, duplicó el HTML exacto, lanzó, pausó, añadió un séptimo contacto y reanudó; terminó con seis destinatarios distintos y seis entregas, dejando fuera el alta tardía. El historial conserva `schedule`, `unschedule`, `launch`, `pause`, `resume` y `auto_complete`. El worker se probó a 1 mensaje/s y se restauró a 10. OpenAPI alcanza 57 rutas; build, lint y suite pasan (15/15). En navegador se comprobaron acciones por estado, edición del borrador, conservación explícita del HTML directo y consola limpia.
- **2026-08-04 — Aprobación versionada de campañas E2E:** aplicada `014_campaign_approval.sql`, que añade requisito de aprobación, versión aprobada, actor de usuario o clave API y conversación histórica. Las acciones `request_approval`, `approve`, `reject` y `comment` comparten el endpoint de ciclo, pero resuelven scopes por acción: el editor solicita/comenta y solo administrador o `campaigns:approve` decide. Preflight, programación, worker y lanzamiento rechazan una versión requerida sin aprobar. Programar/retirar conserva la aprobación al avanzar la versión operativa; editar audiencia, asunto, preencabezado, remitente, contenido o seguimiento la invalida y una programada vuelve a borrador. El E2E `d9ed15ec` verificó 409 sin aprobación, 401 al intentar aprobar con credencial de editor, solicitud, aprobación, programación/retirada, invalidación automática, rechazo, reaprobación, lanzamiento, una entrega y `auto_complete`; las claves efímeras quedaron revocadas. En navegador se validó el filtro «Por aprobar», el modal con historial y las acciones solicitar/aprobar, terminando con distintivo «Aprobada» y consola limpia.
- **2026-08-04 — Pruebas A/B de campañas E2E:** aplicada `015_campaign_experiments.sql`, con experimentos de dos a cuatro variantes, instantáneas completas, pesos, muestra configurable, reserva de destinatarios, criterio por aperturas/clics/manual y fases por destinatario. El motor envía solo la muestra, espera el intervalo, decide con desempate determinista y encola el resto con la variante ganadora; el worker evalúa vencimientos y reconcilia estados tras reinicios. La API v1 añade configuración, borrado, consulta, evaluación y selección manual; el informe UI muestra dimensiones, advertencias, métricas y ganador y permanece visible en solo lectura para analistas. El E2E `85e0b4ca` verificó ocho destinatarios, muestra de cuatro, ganador por clics, HTML exacto de la variante B para la reserva, elección manual y evaluación automática por worker con espera cero; también confirmó auditoría, transiciones y revocación de la clave efímera. Durante la prueba se corrigió una actualización ambigua de `completed_at` y se demostró que la reconciliación completa experimentos interrumpidos sin duplicar entregas. OpenAPI alcanza 59 rutas y el constructor/informe se validó en navegador con consola limpia.
- **2026-08-04 — Informes multicanal y detalle de campaña E2E:** aplicada `016_reporting_indexes.sql`. La API v1 añade informes de campañas, transaccionales y audiencia, detalle paginado y tres exportaciones de campaña; OpenAPI alcanza 64 rutas. Campañas muestra embudo, evolución, medianas, únicos/totales, incidencias, mapa con HTML exacto, enlaces por categoría, A/B, fuentes, fallos y destinatarios. Transaccionales separa volumen, estado y latencia media/P95; Audiencia calcula altas, bajas, neto, listas y origen. Todas las descargas producen CSV UTF-8 con BOM y generan auditoría. Los trackers locales y SNS/SES clasifican agentes o propósitos de escáner; los hechos se conservan con `is_automated`, pero quedan fuera de únicos y del criterio A/B. El E2E `68cc3c50` consultó 14 campañas, ocho mensajes transaccionales entregados y crecimiento neto +44, descargó seis CSV y simuló Proofpoint: el clic apareció bruto y exportable, mientras el informe mantuvo cero clics únicos. PostgreSQL confirma migración, índices y auditorías. En navegador se validaron los tres canales, el detalle A/B, mapa, ranking y tabla de ocho destinatarios, sin errores de consola; lint, build y suite pasan (15/15).
- **2026-08-04 — Amazon SES y entregabilidad E2E:** aplicada `017_deliverability.sql`. El panel distingue Mailpit y SES y consulta cuenta, sandbox/producción, cuotas, identidades, DKIM, MAIL FROM, dos Configuration Sets y cobertura completa de eventos por cada canal; exige que los destinos SNS figuren en `SNS_TOPIC_ARNS`. Marketing y transaccional resuelven región/transporte efectivos desde ajustes con override opcional de entorno, etiquetan canal/plantilla/versión y respetan remitentes permitidos y pausa global. SNS conserva eventos de varios destinatarios, descarta interacción duplicada según la fuente elegida, suprime solo rebotes permanentes y quejas y deja visibles retrasos, rechazos y rebotes transitorios. La lista local sigue siendo autoridad y la conciliación SES diaria es opcional, aditiva y auditable. El panel ofrece reputación 7/30 días, tendencias, riesgos, alertas, checklist, prueba técnica y parada de emergencia; el worker actualiza salud y conciliación. El E2E `62dea7e3-6f4d-445c-8d66-2b710a5ba281` verificó transporte SMTP sin overrides, prueba técnica en Mailpit, bloqueo HTTP 503 durante pausa, recuperación posterior y 64/64 entregas sin incidencias. OpenAPI alcanza 67 rutas; lint, build y suite pasan (18/18), y la vista se validó en navegador sin desbordamiento ni fechas inválidas. La prueba contra AWS real queda documentada y requiere credenciales, DNS e infraestructura de producción.
- **2026-08-04 — Hardening de producción E2E:** aplicada `018_production_hardening.sql`. Proxy añade request ID, límites Redis por identidad/IP, CSRF y cabeceras; TOTP cifra el secreto, genera QR y ocho códigos de recuperación. Operaciones muestra configuración, workers, colas, blobs, DLQ y mantenimientos. Los 83 blobs históricos `0600/root` se migraron de forma segura a UID 100 y la reconciliación terminó sin ausencias, corrupción ni objetos ilegibles. El E2E `41b8c8c4-8f34-48e9-9a52-c75c567d1185` pasó 24 controles de salud, cabeceras, CSRF, métricas, MFA, recuperación, CRLF, operaciones y OpenAPI; el usuario temporal quedó desactivado. El backup real cifrado `kiromail-20260804T142119Z.tar.gz.enc` ocupa 170.480 bytes y se restauró con éxito en `kiromail_restore_test` con 52 tablas. El ensayo corrigió dos defectos de registro del backup antes de quedar verde. Un segundo stack Docker aislado arrancó desde volúmenes vacíos con HTTPS efectivo, 18 migraciones, seed por secreto, Redis autenticado, PostgreSQL/Redis por `*_FILE`, heartbeat y procesos Node UID 100; luego se eliminaron exclusivamente sus datos de ensayo. Durante la prueba se corrigió que migración/seed ignoraban secretos por archivo y que el healthcheck PostgreSQL podía observar el servidor temporal de inicialización. Imágenes base quedan fijadas por digest cuando estaba disponible. Suite 22/22, build, compose base/producción y validación visual de Operaciones/MFA correctos.
- **2026-08-04 — Duplicados y derechos de privacidad E2E:** aplicada `019_contact_privacy.sql`. Dos contactos pueden fusionarse manualmente eligiendo superviviente y estrategia de campos; etiquetas, hechos de consentimiento e historial se consolidan, los tokens antiguos se revocan y el estado más restrictivo gana, por lo que una baja nunca se reactiva. El origen queda como tombstone enlazado y su correo bajo una supresión `merged` permanente. `GET /api/v1/contacts/{id}/export` genera JSON completo y una solicitud auditada. La anonimización sustituye el antiguo borrado físico: archiva y vacía campos de lista, revoca tokens, desacopla blobs/adjuntos/enlaces, redacta destinatario, asunto, variables, metadatos y eventos, y conserva solo una supresión `privacy` permanente del email original. API general, API de lista, alta pública no enumerable e importador CSV respetan esa protección; los rechazos CSV no almacenan el correo protegido ni su fila. Los transaccionales se enlazan ahora al contacto por email. El E2E `d4ed2ec7-cd65-41de-b99f-337756d19926` verificó ocho invariantes, incluida baja tras fusión, exportación auditada, contenido HTTP 410 y bloqueo de las cuatro vías de reentrada. OpenAPI alcanza 74 rutas, suite 24/24 y build pasan; los diálogos completos de fusión y privacidad se validaron visualmente y se corrigió el desbordamiento de emails largos.
- **2026-08-04 — Ciclo de vida de audiencias E2E:** aplicada `020_audience_lifecycle.sql`, con procedencia de duplicación para listas y segmentos. Duplicar una lista copia configuración y campos activos, no suscriptores, y fuerza `public_signup_enabled=false`; lista, segmento y campo se archivan sin destrucción y se restauran con auditoría. El panel incorpora acciones de copia y un gestor único de archivados para los tres tipos. Las reglas `campaign_activity` admiten `within_days` entre 1 y 3650, parametrizan la ventana SQL y la explican en lenguaje legible. El E2E `bf772f1d-cbd3-42c0-a9bf-5a4a5d9d8e14` verificó ocho invariantes, incluidas procedencia, ausencia de suscriptores copiados y conservación de la ventana al duplicar. OpenAPI alcanza 76 rutas, suite 26/26 y build pasan. En navegador se validaron el gestor y el constructor; ambos modales tienen ancho de scroll idéntico al visible.
- **2026-08-04 — Biblioteca y compatibilidad de plantillas E2E:** aplicada `021_template_library.sql`. La copia conserva la última versión estructurada, tema y activos, pero nace como plantilla borrador independiente con procedencia auditable. La biblioteca incorpora consulta por nombre/clave, canal, estado, carpeta y orden, selección masiva, movimiento, archivo y restauración. El editor añade seis bases prácticas, tema, lista/cita y una pila de cincuenta operaciones para deshacer/rehacer; el JSON visual pasa a esquema 2. El compilador produce tablas de presentación, estilos inline, preencabezado, media query móvil y base Outlook, y convierte activos relativos a URL absoluta al guardar. El diagnóstico bloquea contenido peligroso y avisa sobre accesibilidad, enlaces, HTTP, técnicas incompatibles, recorte Gmail y dependencia excesiva de imágenes. El E2E `7ca44d94-fe36-4902-b33b-bf534f67ee3c` verificó ocho invariantes y la UI completa se validó en navegador. OpenAPI alcanza 77 rutas; suite 29/29, lint sin errores y build pasan.
- **2026-08-04 — MIME transaccional preventivo E2E:** aplicada `022_transactional_mime.sql`. La aceptación compone el mensaje completo una sola vez con fecha/Message-ID propios, HTML ya rastreado, texto, cabeceras, multipart y adjuntos base64; mide el Buffer final, lo guarda como `message/rfc822` y solo entonces encola. `TRANSACTIONAL_MIME_MAX_BYTES` vale 40.000.000 por defecto, coherente con SES v2/SMTP, y un exceso devuelve `413 message_too_large`. SES usa `Content.Raw` y SMTP usa `raw`, por lo que ambos reciben el blob validado; los mensajes legados se materializan con seguridad y un reintento produce otro MIME inmutable. El E2E `0a230349-6188-4adc-8132-4a609e4e40fb` envió y reintentó un PDF: ambos terminaron entregados con adjunto, el blob y `mime_byte_size` coincidieron en 1.375 bytes, el intento registró ese tamaño y Mailpit conservó el RFC/MIME completo (1.631 bytes tras añadir cabeceras del servidor). Suite 31/31, build y lint pasan.
- **2026-08-04 — Comparativas avanzadas de informes E2E:** aplicada `023_advanced_reporting.sql`. Campañas, transaccionales y audiencia incluyen el periodo anterior equivalente y cambios absolutos/relativos. Una lista seleccionada expone únicamente dimensiones categóricas activas; el backend comprueba pertenencia/tipo y calcula tasas desde `campaign_recipients.personalization`, que es el snapshot de envío, no desde el perfil mutable. Grupos menores de cinco se agregan como suprimidos. Campañas dirigidas a segmentos se agregan con el mismo umbral. La taxonomía conservadora reconoce firmas explícitas y se oculta salvo muestra ≥20, cobertura ≥80% y grupos ≥5. El E2E `5115120a-ded5-444a-990a-20311f4e9e96` verificó siete invariantes con 20 destinatarios actuales y 10 anteriores; un desglose inseguro devolvió 422. La interfaz muestra evolución comparable, privacidad y causas de indisponibilidad; no tiene scroll horizontal global. Suite 33/33, build y lint pasan.
- **2026-08-04 — Concurrencia HTTP E2E:** aplicada `024_http_concurrency.sql`, con revisión monotónica actualizada por trigger incluso si el cambio nace en un worker o SQL de mantenimiento. Las lecturas de detalle emiten `ETag` fuerte y soportan `If-None-Match`; las colecciones incluyen el ETag de cada fila. `PATCH`/`DELETE` de contactos, listas, campos, suscripciones, segmentos, plantillas, activos, bloques, webhooks y supresiones exigen `If-Match`, incluyen la revisión en el `WHERE` o validan bajo bloqueo y devuelven `428` o `412` sin sobrescribir. Campañas conserva su versión de dominio y expone el mismo validador. Un cliente compartido conserva ETags para el panel y el editor. El E2E `44c55ec2-c560-47a0-a457-116f1923f50d` validó 13 invariantes y limpió todos sus recursos; los regresivos de audiencia y plantillas también quedaron verdes. OpenAPI incluye ETag/If-Match y 304/412/428. Suite 35/35, build y lint sin errores.
- **2026-08-04 — Rendimiento de referencia E2E:** el verificador `ccaf09db-cdf2-4edb-95fe-1f6ce44dbdd1` creó 100.000 contactos y 100.000 suscripciones temporales y midió 50 peticiones con concurrencia 10. P95: contactos 47,5 ms, suscripciones 335,1 ms, resúmenes de lista 41 ms y arranque 188,9 ms. Treinta transaccionales al ritmo reservado de 2/s lograron aceptación durable P95 de 36 ms y primer intento P95 de 51,5 ms. La primera ejecución reveló el límite Docker de 64 MiB en `/dev/shm`; `POSTGRES_SHM_SIZE=256mb` lo resolvió. La limpieza confirmó cero contactos, mensajes o claves de carga residuales.
- **2026-08-04 — Accesibilidad WCAG 2.2 AA:** auditoría real de las diez secciones administrativas sin controles sin nombre, etiquetas ausentes, imágenes sin alternativa, IDs duplicados, saltos de encabezado, diálogos sin título ni desbordamiento horizontal. Los filtros incorporan nombres accesibles y las filas accionables responden a Enter/Espacio. Los diálogos asocian título, reciben y atrapan foco, cierran con Escape y devuelven el foco cuando el activador lo conserva. La paleta se ajustó a contraste AA y la segunda medición devolvió cero fallos en texto de fondo sólido; los degradados se oscurecieron y usan texto blanco opaco. Los breakpoints mantienen consulta y acciones esenciales en móvil.
- **2026-08-04 — Actualización y rollback E2E:** `npm run verify:upgrade` creó bases efímeras aisladas, aplicó `001`–`023`, insertó contacto/lista/suscripción y clonó el snapshot anterior; después aplicó `024`, conservó los tres datos y verificó que una escritura de aplicación antigua seguía funcionando y elevaba la revisión. Finalmente restauró el snapshot: datos presentes, `024` ausente y esquema anterior intacto. El script elimina ambas bases y la guía operativa exige backup, parada ordenada del worker, migración separada, readiness y verificación de producción.
- **2026-08-04 — Cierre de implementación:** reconstrucción limpia de app, worker y migrador sin vulnerabilidades npm conocidas; `verify:production` `35386255-9aff-4c8f-ae1e-5b23790220f5` superó sus 24 controles. App, PostgreSQL, Redis y Mailpit están saludables, el worker está activo y no quedó ninguna base temporal del ensayo. La ayuda de email propuso `gmail.com` ante `gmial.com` sin corregir automáticamente; el detalle de Agenda mostró una dependencia real de segmento y una de importación para `frecuencia`, sin incidencias semánticas ni desbordamiento. Suite 37/37, TypeScript/build y lint sin errores.
- **2026-08-07 — Release candidate de producción:** el bootstrap productivo crea únicamente el primer administrador y el seed de demostración exige autorización explícita; una base efímera confirmó un usuario y cero contactos, listas, campañas o plantillas. Ajustes se reorganizó en siete pestañas accesibles y responsive, con preparación visible, configuración condicional de SES/almacenamiento, usuarios desactivados plegados y revocación conjunta de sesiones. Se añadieron el override Compose endurecido, secretos inicializables sin sobrescritura, rotación de logs, readiness estricto y el runbook de instalación, backup, restauración, actualización y rollback. Pasan suite 40/40, lint sin avisos, build, configuración Compose, bootstrap limpio, ensayo de actualización/rollback y 25 controles E2E de producción (`ff7a4e70-36ce-4bec-ae13-9a4fb3d6dabd`).
- **2026-08-11 — Identidad KiroMail y publicación pública:** el producto adopta el nombre KiroMail y un icono vectorial de gato inspirado en Kiro. Se renombran todas las superficies visibles y los identificadores de instalaciones nuevas, incluido paquete, proyecto Compose, base de datos, usuario de contenedor, sesión, API, métricas, cabeceras, exportaciones, almacenamiento y backups. El README público incorpora alcance, arquitectura, seguridad, contribuciones y estado de licencia; GitHub se conecta mediante la identidad SSH de Serenity. Un stack nuevo con volúmenes independientes confirmó readiness, icono y marca en login/panel, bootstrap sin demo y 25 controles E2E; los volúmenes anteriores permanecen intactos para recuperación.
- **2026-08-11 — Despliegue automatizado en VPS compartido:** GitHub Actions valida `main` y publica dos archivos Docker `linux/amd64`, sumas SHA-256 y el commit como release pública; el VPS consulta el puntero cada tres minutos y verifica hash y revisión OCI antes de desplegar. No hay credenciales del VPS en GitHub ni token de GitHub en el VPS. Se aplicaron las migraciones `001`–`024`, se creó un único administrador y cero datos de demostración, y quedaron activos app, worker, PostgreSQL, Redis y el backup cifrado inicial. El proxy compartido conoce únicamente `kiromail-app`; una auditoría DNS interna confirmó que el alias `app` continúa resolviendo exclusivamente a la aplicación preexistente, cuyos procesos y bases no se reiniciaron. El healthcheck de contenedor usa liveness para permitir el primer acceso, mientras readiness continúa bloqueando envíos hasta completar toda la configuración obligatoria.
- **2026-08-11 — DNS, TLS y login público:** `kiromail.valuestats.com` apunta directamente al VPS y Caddy obtuvo un certificado Let's Encrypt válido con renovación automática. El healthcheck público responde 200 bajo HTTP/2, HSTS y cabeceras defensivas; ValueBets conserva HTTP 200 y sus procesos originales. La inspección visual del login detectó que el cliente todavía prellenaba las credenciales locales: producción pasa ahora explícitamente el modo al formulario, deja ambos campos vacíos y oculta la ayuda local, con una regresión automatizada específica.
- **Siguiente acción exacta:** entrar con el administrador inicial, cambiar la contraseña, activar MFA y completar SES, identidad remitente, dirección postal, Configuration Sets y Topics SNS siguiendo `docs/produccion.md`. Después deben pasar `/api/health/ready`, `verify:production` y las pruebas reales de correo antes de habilitar envíos.

---

## 1. Visión del producto

KiroMail será una aplicación web autohospedada para gestionar suscriptores, newsletters, plantillas, campañas, emails transaccionales y resultados. Debe cubrir tanto el trabajo habitual de una plataforma de email marketing como el envío individual provocado por aplicaciones externas, manteniendo una interfaz clara, una API de primer nivel y una arquitectura operable mediante Docker.

El producto será inicialmente de **una sola organización por instalación**. Podrá tener varios usuarios internos, pero no será una plataforma SaaS multiempresa ni incorporará facturación.

### 1.1 Objetivos principales

- Mantener una base de suscriptores única, limpia y trazable.
- Permitir que cada lista tenga sus propios campos y estructura.
- Gestionar correctamente el consentimiento y las bajas por lista.
- Crear emails profesionales sin depender de editar HTML.
- Enviar campañas inmediatas o programadas mediante Amazon SES.
- Crear listas, plantillas HTML y campañas mediante una API completa.
- Enviar emails transaccionales individuales mediante plantilla o HTML directo.
- Conservar el contenido exacto y la línea temporal de eventos de cada email transaccional.
- Evitar envíos duplicados, indebidos o dirigidos a direcciones suprimidas.
- Mostrar resultados comprensibles y auditables.
- Poder instalar, actualizar, respaldar y recuperar todo el sistema con Docker.

### 1.2 Fuera de alcance

Estas funciones no forman parte del producto acordado:

- CRM, empresas, oportunidades, pipelines o tareas comerciales.
- Automatizaciones, journeys, campañas de goteo o flujos por eventos.
- Constructor interno de formularios, landing pages o pop-ups.
- SMS, WhatsApp, notificaciones push o chat.
- Comercio electrónico, recomendaciones de productos o carritos abandonados.
- Facturación, planes, límites comerciales o multitenencia SaaS.
- Aplicaciones móviles nativas.

Sí se proporcionará una API completa para administrar audiencias, plantillas y campañas, además de enviar emails transaccionales. También permitirá que formularios externos creen suscripciones, pero no habrá un diseñador de formularios dentro de KiroMail.

### 1.3 Punto de partida

El proyecto actual ya proporciona una base funcional con Docker, PostgreSQL, Redis, Mailpit, preparación para SES, suscriptores, listas, segmentos, plantillas HTML, campañas, colas y métricas iniciales. Esa base se considera un prototipo operativo, no el contrato definitivo del producto.

La presente especificación sustituye las decisiones provisionales cuando exista una diferencia. En particular, habrá que migrar las pertenencias actuales a suscripciones independientes por lista, rehacer la gestión de bajas, introducir los campos por lista, versionar contenido y campañas y añadir el canal transaccional sin perder los datos existentes.

---

## 2. Decisiones fundamentales del modelo

### 2.1 Suscriptor, lista y suscripción son conceptos distintos

- **Suscriptor:** persona única, identificada por su dirección de email.
- **Lista:** publicación o canal al que puede apuntarse, por ejemplo «Newsletter semanal» o «Agenda cultural».
- **Suscripción:** relación entre una persona y una lista. Contiene el estado, las fechas, el consentimiento, el origen y los valores de los campos particulares de esa lista.

Un email solo puede existir una vez como suscriptor, pero puede tener varias suscripciones independientes.

### 2.2 Campos globales del suscriptor

Disponibles en cualquier lista:

- Email, obligatorio y único sin distinguir mayúsculas.
- Nombre.
- Apellidos.
- Teléfono.
- Ciudad.
- País.
- Idioma preferido.
- Zona horaria, si se conoce.
- Fecha de creación y última actualización.
- Estado global de entregabilidad.

El estado global no representa la baja de una newsletter concreta. Se reserva para situaciones que impiden cualquier envío: rebote permanente, queja, bloqueo manual o supresión global.

### 2.3 Campos propios de cada lista

Cada lista podrá definir columnas distintas, como:

- Fecha de nacimiento.
- Sexo.
- Equipo preferido.
- Tipo de abono.
- Temas preferidos.
- Número de socio.

Tipos soportados:

- Texto corto.
- Texto largo.
- Número entero o decimal.
- Fecha.
- Fecha y hora.
- Sí/no.
- Selección única.
- Selección múltiple.
- Email adicional.
- URL.

Cada campo tendrá nombre visible, clave interna estable, tipo, ayuda, obligatoriedad, valor predeterminado, orden y, cuando corresponda, opciones permitidas. Cambiar el nombre visible no cambiará la clave interna ni romperá segmentos o campañas.

### 2.4 Una campaña siempre tiene una lista principal

Toda campaña deberá pertenecer a una lista. Esto establece de forma inequívoca:

- Qué suscripciones forman la audiencia base.
- Qué campos personalizados están disponibles.
- De qué lista se dará de baja el destinatario.
- Qué estadísticas de crecimiento o bajas deben actualizarse.

La campaña podrá enviar a toda la lista o a un segmento de ella, y podrá aplicar exclusiones. No se enviará directamente a una mezcla ambigua de listas. Para remitir el mismo contenido a otra lista se podrá duplicar la campaña.

### 2.5 Historial inmutable de cada envío

Al iniciar una campaña se congelarán su audiencia, asunto, remitente, contenido y personalización. Los cambios posteriores en una plantilla, lista o segmento no alterarán el historial enviado.

### 2.6 Marketing y transaccional son canales diferentes

- **Marketing:** campañas dirigidas a una lista, sujetas a consentimiento, preferencias y baja por lista.
- **Transaccional:** mensajes individuales solicitados por una aplicación externa como confirmaciones, avisos, facturas o recuperación de acceso.

Un email transaccional no requiere pertenecer a una lista ni crear un suscriptor. Una baja promocional no impedirá por sí sola un mensaje transaccional esperado, pero los rebotes permanentes, quejas y bloqueos globales sí prevalecerán. No se permitirá marcar una campaña masiva como transaccional para saltarse las reglas de consentimiento.

Ambos canales compartirán infraestructura de entrega y eventos, pero tendrán colas, límites, Configuration Sets, métricas y permisos separados. El tráfico transaccional tendrá prioridad reservada para que una campaña grande no lo bloquee.

### 2.7 Cada email transaccional conserva su contenido exacto

Cada petición transaccional creará un mensaje inmutable con destinatario, remitente, asunto, HTML, texto, variables resueltas, metadatos, versión de plantilla, estado y eventos. La previsualización histórica mostrará exactamente el HTML que se entregó al proveedor, no la versión actual de la plantilla.

---

## 3. Estructura de navegación

La aplicación se organizará en estas áreas:

1. Inicio.
2. Suscriptores.
3. Audiencias.
   - Listas.
   - Campos personalizados.
   - Segmentos.
   - Supresiones.
4. Plantillas.
   - Biblioteca de plantillas.
   - Constructor visual práctico en pantalla completa.
   - Bloques reutilizables.
   - Archivos e imágenes.
5. Campañas.
6. Transaccionales.
   - Mensajes.
   - Eventos.
   - Diagnóstico API.
7. Informes.
8. Entregabilidad.
9. Ajustes.
   - Organización.
   - Remitentes y dominios.
   - Usuarios y permisos.
   - Integraciones y API.
   - Privacidad y conservación.
   - Auditoría.

---

## 4. Acceso, usuarios y permisos

### 4.1 Autenticación

- Inicio y cierre de sesión seguros.
- Usuarios guardados en base de datos; las contraseñas nunca se almacenarán en texto claro.
- Restablecimiento de contraseña mediante enlace de un solo uso.
- Sesiones revocables con caducidad e indicador de dispositivos activos.
- Cookies `Secure`, `HttpOnly` y `SameSite` adecuadas para producción.
- Protección contra fuerza bruta y limitación de intentos.
- Autenticación multifactor TOTP opcional.
- Posibilidad de desactivar inmediatamente un usuario.

### 4.2 Roles

- **Administrador:** configuración, usuarios, credenciales, campañas y datos.
- **Editor:** suscriptores, contenido y campañas, sin acceso a secretos ni usuarios.
- **Analista:** consulta y exportación de informes, sin modificar ni enviar.

Las acciones sensibles —envío, importación, exportación, borrado, cambios de SES o usuarios— quedarán auditadas.

---

## 5. Inicio

El panel de inicio debe responder rápidamente a «qué está pasando» y «qué necesita atención».

### 5.1 Indicadores

- Suscriptores únicos y suscripciones activas.
- Altas y bajas del periodo seleccionado.
- Crecimiento neto y evolución frente al periodo anterior.
- Campañas enviadas, programadas, en curso y fallidas.
- Transaccionales procesados, enviados, entregados y fallidos.
- Latencia transaccional y mensajes que superan el tiempo objetivo.
- Entregados, aperturas únicas, clics únicos, rebotes y quejas.
- Rendimiento medio y comparación con el periodo anterior.

### 5.2 Estado operativo

- Colas de campañas y transaccionales, capacidad reservada, velocidad y mensajes pendientes.
- Salud de aplicación, worker, PostgreSQL, Redis y almacenamiento.
- Conexión y modo de Amazon SES: sandbox o producción.
- Cuota diaria, uso actual y velocidad máxima conocida.
- Avisos por dominio sin verificar, SNS sin eventos recientes, tasa anómala de rebotes o quejas, falta de copias de seguridad y campañas bloqueadas.

### 5.3 Actividad y accesos rápidos

- Últimas campañas y su resultado.
- Últimos fallos o retrasos transaccionales.
- Últimas importaciones.
- Actividad administrativa reciente.
- Acciones para importar suscriptores, crear una lista, diseñar una plantilla o crear una campaña.
- Selector de periodo y de lista para todos los indicadores compatibles.

### 5.4 Notificaciones internas

- Centro persistente de avisos con leídos y no leídos.
- Finalización o fallo de importaciones, exportaciones, campañas y copias de seguridad.
- Alertas de entregabilidad, cuota, configuración y servicios.
- Enlace desde cada aviso a la entidad y diagnóstico correspondientes.
- Preferencias para decidir qué avisos administrativos se envían también por email.

---

## 6. Suscriptores

### 6.1 Tabla principal

- Búsqueda por email, nombre o teléfono.
- Filtros por estado global, lista, estado de suscripción, origen, fecha, país, ciudad, consentimiento y actividad.
- Columnas configurables y ordenables.
- Paginación en servidor y selección de filas entre páginas.
- Vistas guardadas para filtros frecuentes.
- Conteo total y conteo del resultado filtrado.
- Estado vacío útil y mensajes de error recuperables.

### 6.2 Ficha del suscriptor

- Edición de sus datos globales.
- Relación de todas sus listas con estado, alta, baja y origen.
- Edición de los campos propios de cada suscripción.
- Historial cronológico de consentimiento, importaciones, cambios, envíos, entregas, aperturas, clics, rebotes, quejas y bajas.
- Motivo y procedencia de cualquier supresión.
- Registro de quién realizó cada cambio administrativo.
- Posibilidad de suscribir o dar de baja en una lista concreta.
- Posibilidad de bloquear globalmente con motivo obligatorio.

### 6.3 Acciones masivas

- Añadir a una lista.
- Dar de baja de una lista.
- Bloquear globalmente.
- Actualizar un campo común.
- Eliminar o anonimizar conforme a una solicitud de privacidad.
- Exportar la selección.

Antes de una acción masiva se mostrará el alcance exacto y se pedirá confirmación. Las tareas grandes se ejecutarán en segundo plano y tendrán progreso, resultado y archivo de errores.

### 6.4 Duplicados y normalización

**Estado de implementación:** completo. La fusión manual está verificada E2E y la UI/API advierten, sin bloquear ni corregir automáticamente, cuando un dominio está a distancia corta de un proveedor común.

- Normalización segura de espacios y mayúsculas del email.
- Restricción única a nivel de base de datos.
- Detección de posibles duplicados por email mal escrito como ayuda, nunca como fusión automática.
- Herramienta de fusión manual que conserve suscripciones, consentimiento e historial.
- Reglas explícitas para decidir qué valor gana en cada campo.

### 6.5 Derechos sobre los datos

**Estado de implementación:** completo. Exportación JSON individual, anonimización irreversible, auditoría y bloqueo de reentrada están disponibles en API y panel.

- Exportación completa de los datos de una persona en formato legible.
- Eliminación o anonimización con conservación mínima de las evidencias que legalmente deban mantenerse.
- Registro auditable de la solicitud y de su ejecución.
- Imposibilidad de reimportar accidentalmente como activo un email que deba seguir suprimido.

---

## 7. Audiencias: listas, suscripciones y campos

### 7.1 Gestión de listas

**Estado de implementación:** ciclo completo disponible en API y panel. La duplicación conserva configuración/campos activos, no copia suscripciones y exige revisar el alta pública antes de habilitarla.

- Crear, editar, duplicar, archivar y restaurar listas.
- Nombre, descripción, color, remitente predeterminado, idioma y datos de pie legal.
- Contadores de activos, pendientes, bajas, rebotes y quejas.
- Crecimiento, bajas y fuentes de captación a lo largo del tiempo.
- Una lista usada en campañas no se eliminará físicamente; se archivará para preservar informes.
- Exportación completa de la lista y de sus campos.

### 7.2 Estados de suscripción

- **Pendiente:** requiere confirmación.
- **Activa:** puede recibir campañas de esa lista.
- **Dada de baja:** no puede recibir campañas de esa lista.
- **Archivada:** retirada administrativamente, sin perder historial.

Los bloqueos por rebote permanente, queja o supresión global se mantienen en el suscriptor y prevalecen sobre cualquier estado de lista.

### 7.3 Fechas y origen

Cada suscripción conservará:

- Fecha de primera alta.
- Fecha de última confirmación.
- Fecha de baja y motivo.
- Fecha de reactivación, si la hubo.
- Fuente: manual, CSV, API, migración u otra integración.
- Identificador de campaña o formulario externo, cuando exista.

La «fecha de registro» será automática y pertenecerá a la suscripción, no a una columna escrita a mano.

### 7.4 Constructor de campos por lista

**Estado de implementación:** completo con política conservadora. Alta, edición, orden, archivo y restauración están operativos; la clave y el tipo quedan inmutables tras crear el campo para proteger API, importaciones y datos históricos. El detalle calcula y muestra dependencias en segmentos, últimas versiones de plantillas e importaciones históricas.

- Crear, editar, ordenar, archivar y restaurar campos.
- El tipo no se cambia en un campo existente: se crea uno nuevo, se migra de forma explícita y se archiva el anterior, evitando conversiones silenciosas.
- Validación de opciones, longitud, formato, mínimos y máximos.
- Clave interna autogenerada, editable solo antes de que el campo tenga uso.
- Valores predeterminados opcionales.
- Campos obligatorios para altas futuras sin invalidar automáticamente datos antiguos.
- Archivo en lugar de borrado cuando el campo se use en segmentos o campañas.
- Análisis de dependencias: qué segmentos, importaciones o plantillas utilizan un campo.

### 7.5 Tabla de una lista

- Columnas globales y específicas combinadas.
- Elección, orden y anchura de columnas persistentes por usuario.
- Filtros por cualquier campo con operadores coherentes con su tipo.
- Edición rápida de valores con validación.
- Acciones masivas y exportación respetando los filtros.
- Acceso directo a la ficha completa del suscriptor.

### 7.6 Consentimiento

Cada evento de consentimiento debe ser inmutable y registrar, cuando esté disponible:

- Lista y suscriptor.
- Acción: alta, confirmación, retirada o reactivación.
- Fecha y hora.
- Fuente.
- IP y agente de usuario, con política de conservación configurable.
- Versión o texto de la declaración aceptada.
- Base declarada para el tratamiento y notas administrativas.
- Usuario interno o clave API responsable.

La aplicación debe admitir alta directa y doble confirmación. Aunque no haya constructor de formularios, la API podrá crear una suscripción pendiente y enviar un correo de confirmación.

### 7.7 Supresiones

- Tabla global con búsqueda, motivo, fuente, fecha y evidencia relacionada.
- Alcance explícito: marketing, transaccional o todos los canales.
- Alta manual individual e importación masiva de direcciones que nunca deben recibir envíos.
- Incorporación automática de quejas y rebotes permanentes con alcance global.
- Las bajas de lista permanecen en la suscripción y no se convierten en supresión transaccional.
- Exportación para conciliación o migración.
- Comprobación visible de una dirección frente a la lista local y, opcionalmente, la de SES.
- Retirada solo por un administrador, con motivo obligatorio y registro de auditoría.
- Ninguna eliminación de una lista o importación podrá retirar una supresión de forma indirecta.

---

## 8. Segmentos

### 8.1 Constructor de reglas

**Estado de implementación:** reglas tipadas, grupos anidados, preview y actividad de campaña con ventana de 1–3650 días disponibles y verificados E2E.

- Segmentos asociados a una lista concreta.
- Grupos de condiciones anidados con lógica «todas» y «cualquiera».
- Reglas sobre datos globales, campos de la lista, fechas, origen, consentimiento, estado y actividad.
- Operadores según el tipo: igual, distinto, contiene, no contiene, empieza por, mayor, menor, entre, antes, después, está vacío, no está vacío, incluye alguna opción o incluye todas.
- Reglas de interacción: recibió, no recibió, abrió, no abrió, hizo clic o no hizo clic en una campaña o durante un periodo.
- Reglas de entregabilidad: rebote, queja, baja o ausencia prolongada de interacción.

### 8.2 Uso y seguridad

**Estado de implementación:** recuento/muestra, explicación, validación, duplicación, archivo, restauración e histórico diario completos. Las exclusiones de uno o varios segmentos están integradas en campañas.

- Recuento y muestra de ejemplos mientras se construye.
- Explicación legible de la consulta final.
- Validación de campos archivados o reglas imposibles.
- Duplicación, archivo y restauración.
- Recuento recalculado antes del envío.
- Posibilidad de seleccionar uno o varios segmentos de exclusión.
- Historial del número de coincidencias para detectar cambios inesperados.

Los segmentos son dinámicos; no copian contactos ni crean una segunda fuente de verdad.

---

## 9. Importaciones y exportaciones

### 9.1 Importación CSV

- Subida mediante arrastrar y soltar.
- Detección de UTF-8, separador, cabeceras y formato de fechas, con corrección manual.
- Vista previa de filas antes de ejecutar.
- Correspondencia de columnas del archivo con campos globales o específicos de la lista.
- Creación de un campo nuevo durante el mapeo.
- Selección explícita de la lista de destino.
- Configuración del origen, estado inicial, fecha de consentimiento y política de consentimiento.
- Políticas para existentes: conservar, completar solo vacíos o sobrescribir.
- Dedupe dentro del archivo y contra la base de datos.
- Opción de actualizar sin volver a suscribir a quien se dio de baja.
- Validación por fila con descripción precisa del error.
- Resumen previo: nuevas personas, actualizaciones, nuevas suscripciones, omitidas, bloqueadas y erróneas.

### 9.2 Ejecución y trazabilidad

- Procesamiento asíncrono para archivos grandes.
- Progreso en tiempo real y posibilidad de cancelar antes de aplicar cambios irreversibles.
- Registro permanente de archivo, usuario, configuración, fecha y resultado.
- Descarga de las filas rechazadas con su motivo.
- Reversión controlada de las suscripciones creadas por una importación, sin borrar historial previo.
- Idempotencia: volver a ejecutar la misma operación no debe duplicar suscriptores.

### 9.3 Exportaciones

- CSV UTF-8 compatible con Excel.
- Exportación de toda una lista, vista filtrada, segmento o selección.
- Elección de columnas y formato de fechas.
- Exportaciones grandes en segundo plano con enlace temporal de descarga.
- Auditoría de quién exportó qué datos y cuándo.

### 9.4 API de ingesta

- Crear o actualizar suscriptor y suscripción en una operación idempotente.
- Admitir alta activa o pendiente, según la procedencia.
- Guardar evidencia y versión del consentimiento.
- No permitir que una integración reactive silenciosamente una baja o supresión.

---

## 10. Plantillas, HTML y constructor visual

**Estado de implementación:** completo para el constructor práctico acordado. La colaboración en tiempo real, edición gráfica de imágenes, conversión automática de HTML arbitrario y maquetación libre siguen fuera de alcance; la compatibilidad se garantiza mediante compilador restrictivo, diagnóstico y batería de referencia, con validación física final en los clientes elegidos por la instalación.

El constructor de emails es una **sección principal de la aplicación**, no un formulario emergente. Crear o editar contenido abrirá una ruta propia, por ejemplo `/plantillas/nueva`, `/plantillas/:id/editar` o `/campanas/:id/contenido`. El editor utilizará toda la superficie disponible, podrá entrar en modo sin distracciones y conservará el contexto para regresar a la biblioteca o al asistente de campaña.

No se implementará dentro de un modal o popup. Cerrar, recargar, usar Atrás o cambiar de sección no debe provocar la pérdida de trabajo.

El alcance del constructor será deliberadamente práctico. Debe permitir crear newsletters profesionales con bloques esenciales, estilos responsive, imágenes, variables, HTML, preview, pruebas y versiones, pero la creación por API y la importación de HTML serán caminos de primera clase. No se requieren en esta versión colaboración en tiempo real, bloques sincronizados con propagación, editor gráfico avanzado de imágenes, condiciones visuales complejas ni conversión automática de HTML arbitrario a bloques.

### 10.1 Biblioteca de plantillas

- Vista en cuadrícula y lista con miniatura real del contenido.
- Búsqueda por nombre o clave y filtrado por canal, carpeta, estado, autor, lista y fecha.
- Orden por modificación, creación, nombre o uso reciente.
- Crear en blanco, partir de una plantilla base, importar HTML o duplicar.
- Galería inicial cuidada: mensaje sencillo, newsletter editorial, digest, anuncio, evento y actualización de producto o servicio.
- Renombrar, mover, duplicar, archivar, restaurar y eliminar cuando no tenga dependencias.
- Plantillas globales y plantillas asociadas a una lista concreta.
- Canal explícito de marketing o transaccional.
- Formato visual o HTML, ambos con el mismo versionado, preview y pruebas.
- Indicador de borrador, publicada, archivada o con errores de validación.
- Última modificación, autor, versión y campañas que la utilizan.
- Carpetas para organizar la biblioteca.
- Importar y exportar el formato estructurado compatible; exportar también el HTML compilado para diagnóstico o migración.
- Estado vacío con acceso directo a crear la primera plantilla.

Archivar será la operación habitual. Una plantilla utilizada por una campaña histórica no podrá borrarse físicamente.

### 10.2 Pantalla completa del constructor

La interfaz se dividirá en cuatro zonas coordinadas:

1. **Barra superior:** volver, nombre del documento, estado de guardado, deshacer, rehacer, selector de dispositivo, vista previa, enviar prueba, historial y guardar/salir.
2. **Panel izquierdo:** biblioteca de bloques, estructura por capas, bloques reutilizables y biblioteca de contenido.
3. **Lienzo central:** representación fiel del email dentro de un `iframe` aislado, con zoom, ancho de dispositivo y selección directa.
4. **Panel derecho:** contenido, propiedades, estilos, visibilidad, enlaces y accesibilidad del elemento seleccionado.

Los paneles podrán plegarse y redimensionarse. El lienzo mantendrá una anchura de email realista, una zona exterior claramente diferenciada y controles de inserción entre elementos. El editor recordará la disposición elegida por cada usuario.

### 10.3 Modelo estructurado del documento

- Documento JSON versionado con identificadores estables para sección, fila, columna y bloque.
- Jerarquía explícita: documento, secciones, filas, columnas y bloques.
- Anchos de columnas compatibles con email, sin posicionamiento libre que no pueda compilarse de forma fiable.
- Metadatos de versión del esquema y migraciones automáticas entre versiones del editor.
- Separación entre contenido editable, configuración visual y resultado compilado.
- Validación del documento antes de guardar y antes de compilar.
- HTML y texto plano derivados de una versión concreta del documento.

El JSON estructurado será la fuente de verdad de las plantillas visuales. El HTML generado nunca sustituirá silenciosamente ese documento.

### 10.4 Bloques disponibles

Bloques básicos:

- Texto enriquecido.
- Título.
- Imagen.
- Botón.
- Separador.
- Espaciador.
- Lista.
- Cita.
- Tabla sencilla compatible con email.

Bloques de composición:

- Sección de ancho completo.
- Una, dos, tres o cuatro columnas.
- Combinaciones de columnas con proporciones configurables.
- Hero con imagen, texto y llamada a la acción.
- Imagen con texto lateral.
- Tarjeta.
- Grupo de botones.

Bloques de newsletter:

- Logotipo.
- Cabecera.
- Navegación sencilla.
- Redes sociales.
- Vista previa enlazada de vídeo.
- Enlace «ver en navegador».
- Datos del remitente.
- Centro de preferencias.
- Baja obligatoria.
- Pie legal protegido.

Bloques adicionales:

- HTML controlado.
- Contenedor reutilizable como copia independiente.
- Variable personalizada con estado vacío y valor alternativo.

No se incorporarán carruseles, formularios ejecutables, JavaScript ni elementos cuya degradación haga ilegible el mensaje.

### 10.5 Inserción y manipulación

- Arrastrar bloques desde la biblioteca y soltarlos únicamente en destinos válidos.
- Alternativa completa mediante botones y teclado para no depender del arrastre.
- Indicador visual exacto de dónde se insertará el elemento.
- Selección por clic en lienzo o por árbol de capas.
- Selección del contenedor padre sin tener que acertar en un borde estrecho.
- Mover, duplicar, copiar, cortar, pegar y eliminar.
- Deshacer y rehacer todas las operaciones que alteren el documento.
- Navegación por teclado, atajos documentados y menú contextual accesible.
- Bloquear un elemento o contenedor para impedir modificaciones accidentales.
- Confirmación para eliminar estructuras que contengan contenido.

### 10.6 Edición de texto y enlaces

- Edición directa sobre el lienzo y panel alternativo para textos largos.
- Negrita, cursiva, subrayado, tachado, color, tamaño, alineación, interlineado y espaciado entre letras dentro de límites compatibles.
- Listas ordenadas y no ordenadas.
- Jerarquía de títulos y párrafos semánticos.
- Enlaces a URL, email y teléfono.
- Texto, título y destino del enlace editables.
- Opción segura de parámetros UTM heredados o particulares.
- Inserción de variables desde un buscador, sin memorizar su sintaxis.
- Limpieza de formato al pegar desde Word, Google Docs u otras páginas.
- Detector de enlaces vacíos, inválidos, inseguros o repetidos por error.
- El enlace de baja y el centro de preferencias no podrán recibir parámetros de seguimiento.

### 10.7 Diseño, estilos y responsive

- Ajustes globales de ancho, fondo exterior, fondo del contenido, color de texto y alineación.
- Tema de marca para colores, logotipo, tipografías seguras, estilos de títulos y botones.
- Controles de fondo, color, borde, radio, sombra compatible, alineación, padding y margen.
- Unidades y rangos restringidos a valores compilables de forma consistente.
- Ajustes de imagen: ancho, alto, proporción y ajuste al contenedor.
- Ajustes de botón: texto, ancho, relleno, borde, radio, alineación y destino.
- Estilos independientes para sección, fila, columna y bloque.
- Herencia visual clara, con posibilidad de restablecer al estilo del tema.
- Apilado de columnas, alineación y espaciado específicos para móvil.
- Puntos de vista de escritorio y móvil con anchos concretos.
- Zoom del lienzo sin cambiar el HTML final.

Las opciones que un cliente de correo no pueda representar de forma razonablemente estable se ocultarán o mostrarán con una advertencia explícita.

### 10.8 Imágenes y biblioteca de archivos

- Biblioteca integrada sin abandonar el constructor.
- Arrastrar para subir, selector múltiple y progreso individual.
- Carpetas, búsqueda, fecha, dimensiones y peso.
- Validación real del tipo MIME, extensión, dimensiones y tamaño.
- Optimización básica conservando una copia original cuando la política de almacenamiento lo permita.
- Inserción desde URL con descarga y validación controladas, sin enlazar recursos inseguros.
- Texto alternativo obligatorio o marcado explícito como imagen decorativa.
- Enlace, título y dimensiones renderizadas configurables.
- Identificación de dónde se usa cada archivo.
- Sustitución sin modificar campañas o versiones históricas ya congeladas.
- Eliminación impedida mientras existan dependencias activas.
- Los documentos descargables se enlazarán; no se añadirán como adjuntos masivos.

### 10.9 Bloques reutilizables y marca

- Guardar una selección válida como bloque reutilizable.
- Nombre, carpeta, miniatura y descripción.
- La inserción crea una copia independiente; actualizar el original no cambia plantillas existentes.
- Proteger cabeceras, pies legales y elementos de identidad.
- Definir un tema de marca con logotipo, colores, tipografías seguras y botones.

### 10.10 Personalización

- Variables globales como `{{nombre}}` y variables específicas como `{{equipo_preferido}}`.
- Buscador agrupado por datos globales, lista, campaña y sistema.
- Valor alternativo configurable en la misma inserción.
- Resaltado visual de variables dentro del lienzo.
- Selección de un suscriptor real autorizado o de perfiles ficticios.
- Perfil automático con datos vacíos para detectar contenido roto.
- Informe de variables desconocidas, archivadas o sin alternativa.
- Impedir usar campos de otra lista distinta de la campaña o plantilla contextual.

### 10.11 HTML avanzado y plantillas importadas

- Bloque HTML aislado y sanitizado dentro de un documento visual.
- Editor de código con resaltado, búsqueda, formato y diagnóstico de errores.
- Vista previa inmediata sin ejecutar scripts.
- Prohibición de JavaScript, iframes externos, formularios, recursos inseguros y atributos peligrosos.
- Lista documentada de etiquetas, atributos y CSS admitidos.
- Modo de plantilla HTML completa para diseños importados que no puedan convertirse con fidelidad a bloques.
- Las plantillas HTML completas tendrán editor de código, preview, variables, versiones, pruebas y validaciones, pero no fingirán ser editables por bloques.
- Conservación del original importado y de cada compilación.

No se intentará hacer una conversión destructiva y silenciosa entre HTML arbitrario y el modelo visual.

### 10.12 Autoguardado e historial

- Guardado automático tras cambios y al perder el foco de forma segura.
- Estados visibles: guardando, guardado, sin conexión, conflicto y error.
- Copia local temporal para recuperar cambios tras cierre o caída del navegador.
- Reintento seguro cuando vuelve la conexión.
- Control de versión optimista para avisar si otra sesión ha modificado el documento.
- Historial con fecha, autor, nota opcional y miniatura.
- Versiones automáticas periódicas y versiones manuales.
- Vista previa de versiones anteriores.
- Restaurar creando una versión nueva, sin borrar el historial posterior.
- Registro auditable de restauraciones y publicaciones.

### 10.13 Vista previa y datos de prueba

- Vista instantánea de escritorio y móvil dentro del constructor.
- Anchos predefinidos de escritorio y móvil.
- Simulación aproximada de modo oscuro.
- Vista con imágenes cargadas y bloqueadas.
- Vista HTML y texto plano lado a lado.
- Selector de lista y suscriptor de muestra.
- Perfiles ficticios para datos completos, parciales y vacíos.
- Previsualización del asunto, remitente y preencabezado cuando el contenido pertenezca a una campaña.
- Pantalla de preview independiente y compartible solo con usuarios autenticados autorizados.

### 10.14 Envíos de prueba

- Enviar a una o varias direcciones permitidas sin salir del editor.
- Elegir el perfil o suscriptor utilizado para personalizar.
- Marcar claramente el asunto como prueba sin alterar el asunto definitivo.
- Incluir cabeceras y enlaces funcionales en un modo que no pueda dar de baja a un suscriptor real accidentalmente.
- Mostrar resultado por dirección, `messageId` y diagnóstico de error.
- Historial breve de pruebas realizadas por documento y usuario.
- Mailpit en local y Amazon SES cuando el entorno de producción esté correctamente configurado.

### 10.15 Comprobaciones previas y accesibilidad

El constructor tendrá un panel de calidad actualizado mientras se edita:

- Imágenes sin texto alternativo o sin marcar como decorativas.
- Contraste insuficiente de texto y botones.
- Jerarquía incorrecta de títulos.
- Enlaces sin destino, rotos o con texto ambiguo.
- Botones y objetivos táctiles demasiado pequeños.
- Variables desconocidas o sin alternativa.
- Pie legal, dirección, baja o preferencias ausentes.
- HTML o CSS no admitido y degradaciones conocidas de Outlook.
- Recursos por HTTP, imágenes externas no controladas o URLs inválidas.
- HTML compilado excesivo y riesgo de recorte en clientes como Gmail.
- Mensaje compuesto casi exclusivamente por imágenes.
- Versión de texto vacía o desactualizada.
- Idioma del documento no definido.

Cada hallazgo tendrá gravedad, explicación, localización y acción para seleccionar el elemento afectado. Los errores que comprometan baja, seguridad o renderizado bloquearán el uso de la plantilla en una campaña; el resto serán advertencias justificables.

### 10.16 Compilación y compatibilidad de email

- Compilación determinista del documento estructurado a HTML de tablas compatible con email.
- CSS inline y reglas responsive admitidas.
- URLs absolutas y seguras.
- Atributos y correcciones específicas para Outlook cuando sean necesarias.
- Metadatos, preencabezado oculto y estructura semántica apropiada.
- Generación inicial de texto plano y posibilidad de editarlo.
- Minificación que no altere el comportamiento ni dificulte diagnosticar errores.
- Identificadores estables de enlaces para informes de clics.
- Inserción del pie legal protegido en la compilación final aunque una plantilla antigua carezca de él.
- Sanitización final independiente de la validación del editor.
- Snapshot del JSON, HTML compilado y texto en cada versión usada por una campaña.

Se mantendrá una batería de plantillas de referencia para comprobar Gmail web y móvil, Apple Mail, Outlook web y versiones representativas de Outlook de escritorio.

### 10.17 Versión web

- Versión alojada y de solo lectura del contenido exacto enviado.
- Variable `{{web_version_url}}` disponible desde el buscador del editor.
- URL no enumerable que no exponga datos personales.
- Personalización reducida a la estrictamente necesaria y sin información sensible.
- Conservación ligada a la política del historial de campañas.
- Archivo público opcional por lista, desactivado de forma predeterminada y sin información individual.

### 10.18 Integración con campañas

- Elegir una plantilla en el asistente creará una versión de contenido propia de la campaña.
- Editar ese contenido abrirá `/campanas/:id/contenido` en pantalla completa.
- Guardar y salir regresará al paso exacto del asistente desde el que se abrió.
- Modificar el contenido de una campaña no modificará la plantilla maestra.
- Se podrá guardar el contenido de una campaña como plantilla nueva.
- Una actualización posterior de la plantilla maestra no cambiará campañas existentes.
- El editor recibirá la lista principal de la campaña para ofrecer solo variables válidas.
- Asunto, preencabezado, remitente y nombre interno podrán mostrarse en el editor, pero conservarán un único origen de verdad con el asistente.
- La campaña no podrá enviarse mientras el documento tenga errores bloqueantes o una compilación pendiente.
- El snapshot definitivo conservará documento, HTML, texto, recursos y versión del compilador.

### 10.19 Criterios de aceptación del constructor

El constructor no se considerará terminado hasta demostrar que:

1. Se puede crear un email completo responsive sin escribir HTML.
2. Se puede trabajar durante una sesión larga sin perder cambios al recargar, navegar o sufrir una desconexión breve.
3. Todas las operaciones importantes se pueden realizar con ratón y teclado.
4. Un documento antiguo se abre después de actualizar el editor mediante migraciones de esquema verificadas.
5. Las variables y valores vacíos se pueden revisar con datos reales y ficticios.
6. El HTML compilado mantiene una presentación legible en los clientes de correo definidos.
7. La versión histórica de una campaña no cambia al editar plantillas, bloques o imágenes.
8. Los errores de baja, seguridad, variables y compilación impiden enviar.
9. El flujo campaña → editor completo → campaña conserva todos los datos y el punto de retorno.

---

## 11. Campañas

### 11.1 Ciclo de vida

- Borrador.
- Pendiente de aprobación, cuando se configure.
- Programada.
- Preparando audiencia.
- En cola.
- Enviando.
- Pausada.
- Completada.
- Cancelada.
- Fallida.

Cada transición debe estar validada y auditada. Una campaña ya iniciada no puede volver a borrador ni modificar su contenido congelado.

### 11.2 Asistente de creación

1. Nombre interno y lista principal.
2. Remitente, dirección de respuesta, asunto y preencabezado.
3. Selección de plantilla y acceso al constructor de contenido en pantalla completa.
4. Audiencia: toda la lista o segmento, más exclusiones.
5. Seguimiento, etiquetas UTM y opciones avanzadas.
6. Prueba, revisión y envío inmediato o programado.

El asistente guardará el progreso y podrá reanudarse. Al entrar en el constructor, el asistente conservará el borrador y el paso actual; al guardar y salir, se volverá al mismo punto con la miniatura y el estado de validación actualizados.

### 11.3 Audiencia

- Estimación en tiempo real de incluidos y excluidos.
- Desglose de bajas, supresiones, duplicados, campos inválidos y bloqueos.
- Un destinatario recibe como máximo un email por campaña.
- Vista de muestra de destinatarios antes de enviar.
- Snapshot definitivo al iniciar la campaña.
- Exportación del snapshot para auditoría.

### 11.4 Pruebas y revisión previa

- Envío de prueba a una o varias direcciones autorizadas.
- Elección de un suscriptor de muestra para la personalización.
- Vista previa HTML y texto.
- Verificación automática de remitente, asunto, lista, contenido, enlaces, variables, pie legal, baja, DNS conocido, SES, cuota y worker.
- Advertencias diferenciadas de errores bloqueantes.
- Confirmación final mostrando destinatarios estimados, fecha, zona horaria y velocidad prevista.

### 11.5 Programación y control

- Envío ahora o en fecha y hora, mostrando siempre la zona horaria.
- Editar o cancelar antes de que comience la preparación.
- Pausar la creación de nuevos trabajos y reanudarla de forma segura.
- Cancelar pendientes sin poder retirar mensajes ya aceptados por SES.
- Reprogramar una campaña que todavía no haya empezado.
- Duplicar una campaña para reutilizar configuración y contenido.
- Envío manual posterior a quienes no recibieron por un fallo técnico corregido.

### 11.6 Pruebas A/B

- Variante de asunto, preencabezado, remitente o contenido.
- Tamaño de la muestra y reparto configurables.
- Ganador por clics, aperturas o elección manual.
- Tiempo de espera antes de enviar la variante ganadora al resto.
- Límites mínimos de muestra y advertencias cuando el resultado no sea significativo.
- Informes separados y combinados.

Las pruebas A/B pertenecen a campañas puntuales; no introducen automatizaciones.

### 11.7 Aprobación opcional

- Requerir aprobación de un administrador antes de programar o enviar.
- Comentario de solicitud, aprobación o rechazo.
- Invalidar la aprobación si cambia audiencia, asunto, remitente o contenido.

---

## 12. Emails transaccionales

El módulo transaccional permitirá que una aplicación externa envíe mensajes individuales como confirmaciones, restablecimientos de contraseña, recibos, facturas, avisos de cuenta o notificaciones operativas. No utilizará listas ni segmentos y no se presentará como una variante de campaña.

### 12.1 Formas de envío

La API admitirá dos formas mutuamente excluyentes:

1. **Plantilla:** se proporciona `template_key` o `template_version_id` y un objeto de variables.
2. **HTML directo:** se proporcionan `subject`, `html` y, opcionalmente, `text`.

En ambos casos podrán indicarse destinatario, nombre, remitente permitido, `reply_to`, metadatos internos, tracking y adjuntos admitidos. Si no se envía texto plano, el sistema generará una primera versión y la guardará junto al HTML final.

Cada petición representará un solo email y un solo destinatario. Para varios destinatarios, la aplicación cliente realizará varias peticiones o utilizará un endpoint batch que internamente creará mensajes independientes y devolverá un resultado por cada uno.

### 12.2 Contrato mínimo de envío

Ejemplo con plantilla:

```json
{
  "to": { "email": "ana@example.com", "name": "Ana" },
  "template_key": "pedido_confirmado",
  "variables": {
    "nombre": "Ana",
    "numero_pedido": "A-1042",
    "total": "49,90 €"
  },
  "metadata": {
    "order_id": "A-1042"
  },
  "track_opens": true,
  "track_clicks": true
}
```

Ejemplo con HTML directo:

```json
{
  "to": { "email": "ana@example.com", "name": "Ana" },
  "subject": "Tu pedido A-1042 está confirmado",
  "html": "<html><body><h1>Pedido confirmado</h1></body></html>",
  "text": "Pedido confirmado",
  "metadata": {
    "order_id": "A-1042"
  }
}
```

La petición requerirá `Idempotency-Key`. Si se repite la misma clave con el mismo contenido, se devolverá el mismo `message_id` sin reenviar. Si se reutiliza con un contenido distinto, se responderá con conflicto.

Respuesta inicial:

```json
{
  "id": "msg_01...",
  "status": "queued",
  "created_at": "2026-08-04T10:30:00Z",
  "status_url": "/api/v1/transactional/messages/msg_01..."
}
```

La API responderá `202 Accepted` después de validar y persistir de forma duradera el mensaje. Los fallos posteriores se comunicarán mediante estado consultable y webhooks.

### 12.3 Plantillas transaccionales

- Tipo de plantilla explícito: marketing o transaccional.
- Clave estable y única para usar desde código, independiente del nombre visible.
- Versiones de borrador y versión publicada.
- HTML, texto, asunto y nombre de remitente predeterminados.
- Esquema de variables con nombre, tipo, obligatoriedad, ejemplo y valor alternativo.
- Preview y render mediante API sin enviar.
- Envío por versión publicada o por una versión concreta autorizada.
- Publicar una versión nueva no cambiará mensajes ya aceptados.
- Posibilidad de crear, actualizar, versionar, publicar y archivar totalmente por API enviando HTML.
- Editor HTML en la interfaz y constructor visual básico opcional para estas plantillas.
- Envío de prueba desde la interfaz o la API.

Las plantillas serán propiedad de KiroMail; no dependerán de las plantillas almacenadas en SES. SES actuará como transporte para que el renderizado, el versionado y la previsualización histórica tengan una única fuente de verdad.

### 12.4 HTML directo

- No será necesario crear una plantilla previamente.
- El HTML se validará, se normalizarán URLs y se rechazará contenido peligroso o cabeceras inyectadas.
- Se aceptará texto plano opcional.
- Se aplicarán remitente y políticas de seguridad configurados.
- Se podrán insertar tracking de apertura y redirecciones de clic si la petición lo habilita.
- Se guardará el HTML final posterior al renderizado y al tracking: exactamente el que se entrega a SES.
- Un envío directo no creará automáticamente una plantilla ni aparecerá en la biblioteca.
- Podrá copiarse manualmente como plantilla desde el detalle del mensaje, si el usuario tiene permiso.

### 12.5 Estados y eventos de un mensaje

El estado operativo y el historial de eventos se almacenarán por separado. Un clic no debe sustituir el hecho de que el mensaje fue entregado.

Estados operativos:

- `accepted`: petición validada y persistida.
- `queued`: preparada para el worker.
- `processing`: reclamado por el worker y transmitiendo el MIME ya persistido.
- `sent`: SES aceptó el mensaje y devolvió `messageId`.
- `delivered`: el servidor receptor confirmó la entrega.
- `delayed`: SES informó de retraso.
- `bounced`: entrega fallida definitivamente.
- `complained`: el destinatario presentó una queja.
- `failed`: error local o rechazo no recuperable.

Eventos inmutables:

- `accepted`.
- `queued`.
- `processed`.
- `send_attempted`.
- `sent`.
- `delivered`.
- `delivery_delayed`.
- `opened`, total y primera apertura.
- `clicked`, con URL, total y primer clic.
- `bounced`, con tipo y diagnóstico.
- `complained`.
- `rejected`.
- `failed`.

Cada evento guardará identificador único, mensaje, tipo, fecha de ocurrencia, fecha de recepción, fuente, payload técnico sanitizado y datos derivados. La deduplicación tolerará eventos repetidos o desordenados de SES.

`accepted` y `queued` solo se alcanzan después de resolver variables, enlaces y tracking y persistir HTML, texto y RFC/MIME finales. `processed` significa que el worker ha reclamado ese contenido inmutable y ha iniciado un intento de transporte. `sent` significa que SES lo ha aceptado y ha devuelto un `messageId`; no equivale a `delivered`. Aperturas y clics son eventos de interacción y no sustituyen el estado de entrega.

### 12.6 Registro y detalle en la interfaz

La sección «Transaccionales» tendrá una tabla con:

- Identificador propio y `messageId` de SES.
- Fecha.
- Destinatario.
- Asunto.
- Plantilla o indicador de HTML directo.
- Estado de procesamiento y entrega.
- Aperturas y clics.
- Metadatos buscables seleccionados.

Filtros:

- Periodo.
- Estado.
- Destinatario.
- Plantilla y versión.
- Clave o valor de metadata.
- Con aperturas, clics, rebote, queja o error.

El detalle mostrará:

- Línea temporal completa y ordenada de eventos.
- Remitente, destinatario, asunto, respuesta y metadatos.
- Plantilla, versión, variables resueltas y clave de idempotencia parcialmente oculta.
- HTML exacto en un `iframe` aislado y versión de texto plano.
- Código fuente HTML descargable si el rol lo permite.
- Enlaces rastreados, destino original y clics.
- Intentos, reintentos, latencia, respuesta de SES y diagnóstico de error.
- Tamaño exacto del RFC/MIME codificado y disponibilidad del blob.
- Payload técnico sanitizado de cada evento.
- Acción «crear un nuevo envío a partir de este», nunca reenvío silencioso del mismo registro.

### 12.7 Almacenamiento del HTML enviado

Los metadatos, estados, índices y eventos se guardarán en PostgreSQL. El HTML y texto exactos se guardarán como blobs inmutables fuera de las filas principales:

- Volumen de filesystem persistente como opción predeterminada autohospedada.
- Backend S3 o compatible como opción recomendada para varias réplicas o mayor volumen.
- Interfaz de almacenamiento común para poder cambiar de backend sin migrar el dominio funcional.
- Contenido comprimido, identificado por SHA-256 y deduplicado cuando los bytes sean idénticos.
- Escritura mediante archivo temporal y renombrado atómico en filesystem.
- Ruta derivada del hash, nunca del email ni de datos del destinatario.
- Registro en base de datos con hash, tamaño, tipo, backend, clave y política de conservación.
- Reconciliador para detectar blobs huérfanos, ausentes o dañados.
- Descarga siempre a través de un endpoint autenticado; el volumen no se expone como archivos públicos.
- Preview dentro de un `iframe` sandboxed con una política CSP restrictiva.

La respuesta `202` solo se devolverá cuando el registro, HTML, texto y RFC/MIME final estén almacenados de forma recuperable. Los blobs serán inmutables: un reenvío crea un mensaje nuevo con su propio `Message-ID`, fecha y MIME.

La retención del contenido será configurable globalmente y por plantilla. Al expirar, se eliminarán HTML, texto y variables sensibles, pero se conservarán el hash, los estados, los eventos necesarios y las métricas agregadas. La interfaz indicará claramente cuando la previsualización ya no esté disponible.

### 12.8 Tracking de aperturas y clics

- Activación predeterminada por plantilla y sobrescritura permitida por petición.
- Píxel y enlaces vinculados al `message_id`, sin exponer el destinatario.
- Redirección rápida al destino original aun cuando el sistema de analítica esté degradado.
- Primer evento y eventos totales separados.
- URL original normalizada y conservada.
- IP y agente de usuario sujetos a la política de privacidad y conservación.
- Detección y marcado de aperturas o clics probablemente automáticos.
- Opción de utilizar eventos de SES o tracking propio, con una sola fuente para evitar duplicados.
- Tracking desactivado por defecto para mensajes sensibles de recuperación de acceso, salvo decisión explícita.

### 12.9 Colas, prioridad y reintentos

- Cola transaccional separada de la cola de campañas.
- Reserva configurable de capacidad de envío para tráfico transaccional.
- Prioridad superior sin ignorar la cuota total de SES.
- Tiempo máximo en cola y alerta cuando se incumpla.
- Reintentos solo para errores temporales, con backoff y límite.
- La idempotencia prevalece sobre reinicios, timeouts del cliente y reintentos del worker.
- Un error después de que SES haya aceptado el mensaje nunca provocará un segundo envío automático.
- Dead-letter queue con inspección y acción manual.
- Posibilidad de pausar campañas sin pausar transaccionales, y viceversa.

### 12.10 Adjuntos

- Adjuntos opcionales mediante `asset_id` o subida API específica; no URLs arbitrarias descargadas en el momento del envío.
- Nombre, MIME y disposición validados.
- Tamaño máximo local configurable e inferior o igual al permitido por SES.
- Cómputo byte a byte del tamaño MIME final antes de encolar, con rechazo `413 message_too_large` si supera el límite configurable.
- Rechazo de ejecutables y tipos peligrosos.
- Almacenamiento, permisos y retención equivalentes a los del HTML.
- Recomendación de enlazar archivos grandes en lugar de adjuntarlos.

### 12.11 Webhooks transaccionales

- Eventos seleccionables: procesado, enviado, entregado, retrasado, abierto, clic, rebote, queja y fallo.
- Payload con `message_id`, `event_id`, timestamp, plantilla, metadata y datos propios del evento.
- Firma HMAC, fecha y protección contra replay.
- Entrega al menos una vez; el consumidor deduplicará por `event_id`.
- Reintentos con backoff, historial de respuestas y reenvío manual.
- Orden no garantizado y documentado.
- Filtros opcionales por plantilla o metadata.

### 12.12 Métricas transaccionales

- Volumen aceptado, procesado, enviado y entregado.
- Fallos, rebotes, quejas, aperturas y clics.
- Latencia de API a procesado, procesado a SES y SES a entrega, con percentiles.
- Tiempo actual y máximo en cola.
- Rendimiento por plantilla y versión.
- Errores por tipo, proveedor y periodo.
- Comparación independiente del canal de marketing.
- Exportación de mensajes y eventos respetando permisos y retención.

### 12.13 Seguridad y uso correcto

- Scope de API específico `transactional:send` y scopes separados para lectura, plantillas y eventos.
- Solo remitentes y dominios verificados incluidos en una allowlist.
- Cabeceras personalizadas limitadas a una lista segura.
- Límites por clave, plantilla y periodo.
- Metadata con tamaño, profundidad y claves limitados; nunca se indexará todo indiscriminadamente.
- Variables sensibles ocultables en logs y detalle.
- Prohibición de usar el endpoint para lotes promocionales o para eludir bajas.
- Alerta por patrones masivos, picos anómalos o tasa de quejas.
- Auditoría de claves, peticiones y accesos a previsualizaciones.
- La baja de una lista no bloquea un mensaje transaccional legítimo; una supresión global por rebote, queja o bloqueo sí lo hace.

### 12.14 Criterios de aceptación transaccional

1. Enviar mediante una plantilla publicada y mediante HTML directo.
2. Repetir una petición tras timeout sin producir un segundo email.
3. Consultar procesado, enviado, entregado, abierto y clicado como hechos diferenciados.
4. Abrir el HTML exacto que se entregó a SES incluso después de actualizar la plantilla.
5. Relacionar de forma inequívoca eventos SES con el mensaje propio.
6. Recibir webhooks firmados y reintentados sin asumir orden ni entrega única.
7. Mantener envíos transaccionales dentro de su objetivo de latencia durante una campaña grande.
8. Reiniciar worker, Redis o aplicación sin perder ni duplicar mensajes aceptados.
9. Aplicar retención de contenido sin destruir los eventos y métricas que deban conservarse.
10. Bloquear remitentes no verificados, HTML peligroso, adjuntos no admitidos y direcciones globalmente suprimidas.

---

## 13. Motor de envío

### 13.1 Preparación

- Proceso consistente para crear el snapshot de destinatarios de una campaña.
- Registro duradero individual antes de aceptar un email transaccional.
- Comprobación final de suscripción activa para marketing y de supresión aplicable para ambos canales justo antes de encolar.
- Copia de los valores necesarios para personalizar y auditar cada mensaje.
- Registro de la razón exacta de exclusión.
- Generación multipart HTML/texto y codificación correcta de caracteres.
- Una petición independiente a SES por destinatario en ambos canales.
- Persistencia del HTML y texto finales antes del primer intento de envío.

### 13.2 Cola, velocidad y reintentos

- Trabajos pequeños y reanudables en Redis/BullMQ.
- Velocidad limitada por la menor entre configuración local y cuota de SES.
- Concurrencia y reserva transaccional configurables sin exceder el ritmo total permitido.
- Colas independientes para campañas y transaccionales, con prioridad controlada.
- Clave de idempotencia por campaña/destinatario o por petición transaccional.
- Bloqueos con vencimiento y recuperación tras caída del worker.
- Reintentos con espera exponencial para errores temporales.
- Sin reintentos para errores permanentes o direcciones suprimidas.
- Cola de trabajos fallidos, motivo, inspección y reintento administrativo controlado.
- Parada ordenada del worker durante despliegues.

### 13.3 Garantías

- Nunca enviar dos veces por un reinicio, timeout, reintento del cliente o webhook duplicado.
- Nunca enviar marketing a una baja de la lista ni ningún canal a una queja, rebote permanente o bloqueo global aplicable.
- No aplicar una baja promocional como bloqueo automático de un transaccional legítimo.
- No marcar como entregado hasta recibir el evento correspondiente.
- Conservar el identificador local y el `messageId` de SES para relacionar eventos.
- Procesar eventos de forma idempotente y tolerar que lleguen desordenados.

### 13.4 Cabeceras, clasificación y seguimiento

- `List-Unsubscribe` y `List-Unsubscribe-Post` obligatorios solo en marketing.
- Los mensajes transaccionales no incluirán una baja promocional salvo que su contenido sea realmente mixto, caso que se tratará como marketing.
- Tags de SES para canal, campaña o mensaje, plantilla y versión.
- URLs de apertura y clic firmadas, no predecibles y sin exponer el email.
- Opción de desactivar aperturas y clics globalmente, por campaña, plantilla transaccional o petición.
- Parámetros UTM configurables sin alterar enlaces de baja.

---

## 14. Amazon SES y entregabilidad

**Estado de implementación:** completo y probado con Mailpit en Docker. Todos los controles, eventos, conciliación, alertas y bloqueos están implementados; la última validación contra SES de producción se ejecutará al instalar credenciales y DNS reales.

### 14.1 Asistente de conexión

- Selección de región.
- Uso recomendado de rol IAM en EC2; claves mediante secretos de entorno solo cuando sea necesario.
- Las credenciales nunca se guardarán en la base de datos ni se mostrarán en la interfaz.
- Detección de acceso, sandbox, cuota diaria y velocidad máxima.
- Listado y estado de identidades verificadas.
- Comprobación de dominio de envío, DKIM, MAIL FROM personalizado y ambos Configuration Sets.
- Envío de prueba técnico con diagnóstico claro.
- Modo local Mailpit separado y visiblemente identificado.

### 14.2 Configuration Sets y eventos

- Configuration Sets separados para marketing y transaccional en producción.
- Tags de canal, campaña o mensaje, plantilla y versión en cada envío.
- Destino de eventos mediante SNS para send, delivery, bounce, complaint, reject, delivery delay y rendering failure.
- Apertura y clic podrán medirse localmente o con SES, pero no duplicarse; habrá una fuente configurada y documentada.
- Endpoint capaz de confirmar suscripciones SNS.
- Verificación criptográfica de la firma y origen de cada mensaje SNS.
- Idempotencia por identificador de evento y almacenamiento del payload original sanitizado.
- Soporte para notificaciones que contengan más de un destinatario.

AWS exige disponer de un mecanismo para gestionar rebotes y quejas, y sus eventos pueden llegar duplicados si se habilitan varios mecanismos. El sistema debe utilizar una configuración única y deduplicar siempre.

Se recomendarán subdominios de envío distintos para marketing y transaccional. Si se utilizan IP dedicadas, los Configuration Sets podrán asociarse a pools separados para aislar reputación, tal como contempla Amazon SES.

### 14.3 Rebotes, quejas y supresiones

- Rebote permanente: supresión global inmediata.
- Rebote transitorio final: registro del motivo y política configurable; no tratarlo automáticamente como permanente.
- Queja: supresión global inmediata.
- Rechazo y retraso: estado y diagnóstico visibles.
- Lista local de supresión como autoridad previa a cualquier envío.
- Sincronización opcional y conciliación con la lista de supresión de la cuenta SES.
- Desbloqueo manual excepcional con permiso de administrador, motivo y nueva evidencia de consentimiento.

### 14.4 Reputación

- Tasa de rebote y queja global, por canal, campaña y plantilla transaccional.
- Alertas con umbrales conservadores configurables.
- Evolución de entregabilidad y retrasos.
- Enlace y guía para Google Postmaster Tools y DMARC.
- Checklist de SPF, DKIM, DMARC, alineación del `From`, TLS y dominio de seguimiento.
- Aviso para aumentar el volumen de forma gradual en dominios o IP nuevas.
- Compatibilidad con Virtual Deliverability Manager como integración opcional, no como dependencia.

Google exige a los remitentes masivos autenticación, alineación, bajas de un clic y mantener baja la tasa de spam. KiroMail debe mostrar estos requisitos como controles de producción, no como documentación escondida.

---

## 15. Bajas y centro de preferencias

### 15.1 Baja visible en el mensaje

- Enlace de baja obligatorio en el cuerpo de todas las campañas.
- Página clara que identifique la lista y confirme la acción.
- Sin necesidad de iniciar sesión.
- Token firmado que no incluya datos personales legibles.
- Idempotencia: repetir la petición devuelve éxito sin alterar el historial.

### 15.2 Baja de un clic

- Petición POST conforme a RFC 8058.
- Ejecución directa de la baja de la lista asociada, sin redirección ni formulario.
- No usar una petición GET como acción irreversible, para evitar bajas causadas por escáneres de enlaces.
- Respuesta rápida aun cuando otros sistemas estén temporalmente degradados.
- Procesamiento inmediato antes del siguiente envío.

### 15.3 Centro de preferencias

- Ver todas las listas en las que está suscrita la persona.
- Activar o desactivar listas individualmente.
- Darse de baja de todas las comunicaciones promocionales.
- Editar campos globales y preferencias permitidas.
- Mostrar fecha y origen de cada suscripción cuando proceda.
- Confirmación visible y email opcional de confirmación de cambios.
- Enlace firmado y revocable, con protección contra manipulación.

### 15.4 Reactivación

- Una baja nunca se revierte por importación o edición masiva accidental.
- La reactivación exige una acción explícita, nueva evidencia y registro de consentimiento.
- Una queja o rebote permanente requiere además intervención administrativa justificada.

---

## 16. Informes

La entrada de Informes permitirá cambiar entre «Campañas» y «Transaccionales». Las métricas transaccionales conservarán su propia latencia, volumen y estados y no se mezclarán con tasas de campaña.

**Estado de implementación:** completo para las señales disponibles. El periodo anterior, segmentos y campos categóricos usan snapshots históricos y umbrales de privacidad. Cliente y dispositivo nunca se deducen de agentes genéricos: la sección aparece solo cuando supera los mínimos documentados de muestra, cobertura y tamaño de grupo.

### 16.1 Informe de campaña

- Enviados a SES, entregados, retrasados, rechazados y fallidos.
- Aperturas totales y únicas.
- Clics totales y únicos.
- Tasa de clic sobre entregados y sobre abiertos.
- Rebotes permanentes y transitorios finales.
- Quejas y bajas.
- Evolución temporal desde el inicio del envío.
- Estado actual por destinatario y motivo de cualquier fallo.
- Exportación CSV de resultados y destinatarios.

### 16.2 Enlaces y contenido

- Ranking de enlaces por clics únicos y totales.
- Mapa visual de clics sobre la campaña.
- Separación entre enlaces de contenido, preferencias y baja.
- Resultados por variante A/B.
- Comparación de rendimiento por dispositivo o cliente solo cuando los datos sean suficientemente fiables y respeten la configuración de privacidad.

### 16.3 Audiencia y tendencias

- Altas, bajas y crecimiento neto por lista y periodo.
- Origen de las nuevas suscripciones.
- Evolución de activos, pendientes, suprimidos y no interactivos.
- Comparación de campañas y medianas por lista.
- Rendimiento por segmentos o valores de campos, evitando grupos demasiado pequeños.

### 16.4 Interpretación correcta

- Diferenciar eventos únicos y totales en todas las pantallas.
- Explicar que las aperturas pueden estar infladas o falseadas por protección de privacidad y precarga de imágenes.
- Detectar y etiquetar clics probables de bots o escáneres sin borrar el evento bruto.
- No presentar geolocalización inferida por IP como ubicación real del suscriptor.
- Mantener los eventos brutos y los indicadores derivados separados para poder recalcular métricas.

---

## 17. Ajustes

### 17.1 Organización

- Nombre, logotipo, idioma, zona horaria y formatos regionales.
- Dirección postal y datos legales predeterminados.
- Valores predeterminados de remitente y respuesta.
- URL pública canónica de la aplicación.

### 17.2 Marca y contenido

- Colores, tipografías seguras, ancho, logotipo y estilos de botones.
- Pie legal predeterminado.
- Parámetros UTM y política de seguimiento.
- Variables predeterminadas y sus valores alternativos.

### 17.3 Envío

- Transporte local o Amazon SES.
- Región, Configuration Sets de marketing y transaccional, ritmo total, reserva transaccional y concurrencias.
- Remitentes permitidos e identidades verificadas.
- Dirección de respuesta predeterminada.
- Seguimiento de aperturas y clics por canal.
- Backend de blobs local o S3 compatible.
- Retención de HTML transaccional, adjuntos, variables, eventos, IP y agente de usuario.

### 17.4 Usuarios y auditoría

- Invitación, edición, desactivación y cambio de rol.
- MFA y sesiones activas.
- Registro filtrable por usuario, acción, entidad y fecha.
- Exportación del registro de auditoría.

### 17.5 Mantenimiento

- Versión instalada y migraciones pendientes.
- Estado de servicios y colas.
- Última copia de seguridad conocida y último ensayo de restauración registrado.
- Exportación de diagnóstico sin secretos.
- Modo mantenimiento y pausa global de nuevos envíos.

---

## 18. API, integraciones y webhooks

### 18.1 API

- API REST versionada y documentada con OpenAPI.
- SDK no obligatorio; cualquier cliente HTTP podrá utilizarla.
- JSON como formato principal y subida multipart solo para archivos.
- Paginación por cursor, filtros, orden, errores coherentes y fechas ISO 8601.
- Respuestas de error con código estable, mensaje, campo y `request_id`.
- Claves API con nombre, permisos, caducidad opcional, rotación y último uso.
- El secreto solo se muestra una vez.
- Permisos separados para listas, suscriptores, plantillas, campañas, transaccionales, eventos e informes.
- Límite de peticiones por clave y cabeceras con límite, restante y reintento.
- `Idempotency-Key` para creación de mensajes, lanzamiento de campañas y operaciones sensibles.
- `ETag` o número de versión para impedir actualizaciones concurrentes perdidas.
- `request_id` propagado a logs, auditoría y respuestas.
- Endpoint de salud no autenticado sin información sensible y endpoint de diagnóstico protegido.
- Colección OpenAPI descargable y ejemplos ejecutables para cURL, JavaScript, PHP y Python.

### 18.2 Listas, campos y suscripciones por API

Operaciones mínimas:

- `GET /api/v1/lists` y `POST /api/v1/lists`.
- `GET`, `PATCH` y archivo mediante `DELETE /api/v1/lists/{id}`.
- `GET` y `POST /api/v1/lists/{id}/fields`.
- `PATCH`, reordenación y archivo de `/api/v1/lists/{id}/fields/{field_id}`.
- Consulta paginada de suscripciones de una lista.
- Crear o actualizar una suscripción con campos propios, origen y consentimiento.
- Dar de baja, reactivar explícitamente o archivar una suscripción.
- Importaciones masivas como trabajos asíncronos consultables.
- Exportaciones asíncronas con enlace temporal.

Crear una lista podrá incluir sus campos iniciales en la misma petición idempotente. Las respuestas devolverán claves internas de campos y versiones para poder configurar integraciones sin depender del texto visible.

### 18.3 Suscriptores por API

- Buscar, listar y obtener por ID o email normalizado.
- Crear o actualizar datos globales.
- Consultar todas sus suscripciones, estados y campos por lista.
- Exportar los datos completos de una persona.
- Bloquear globalmente, anonimizar o eliminar según permiso.
- Acciones masivas mediante trabajos, nunca peticiones síncronas sin límite.
- Las actualizaciones no reactivarán bajas ni eliminarán supresiones salvo operación explícita y autorizada.

### 18.4 Plantillas y versiones por API

Operaciones mínimas:

- `GET /api/v1/templates` y `POST /api/v1/templates`.
- `GET`, `PATCH` y archivo de `/api/v1/templates/{id}`.
- Crear versión con `POST /api/v1/templates/{id}/versions`.
- Publicar una versión con una acción explícita.
- Obtener una versión concreta y su HTML/texto.
- Renderizar con variables sin enviar.
- Validar HTML, variables, enlaces y requisitos del canal.
- Enviar una prueba.

Al crear una plantilla se podrá mandar directamente:

```json
{
  "key": "pedido_confirmado",
  "name": "Pedido confirmado",
  "channel": "transactional",
  "subject": "Pedido {{numero_pedido}} confirmado",
  "html": "<html><body>...</body></html>",
  "text": "Pedido {{numero_pedido}} confirmado",
  "variables_schema": {
    "numero_pedido": { "type": "string", "required": true },
    "nombre": { "type": "string", "required": false, "default": "" }
  }
}
```

- `key` será estable, único y apropiado para código.
- `channel` será `marketing` o `transactional`.
- Actualizar HTML creará una versión; no sobrescribirá una versión publicada.
- Las versiones podrán permanecer en borrador y requerir publicación.
- La API devolverá diagnósticos antes de publicar.
- También se aceptará el documento estructurado del editor visual, pero nunca será obligatorio para una plantilla HTML.

### 18.5 Campañas por API

Operaciones mínimas:

- Listar, obtener, crear, editar, duplicar y archivar borradores.
- Crear con lista principal, segmentos, exclusiones, remitente, asunto y preencabezado.
- Elegir `template_version_id` o mandar `html` y `text` directamente.
- Validar y obtener la estimación de audiencia sin enviar.
- Enviar prueba.
- Programar, enviar ahora, pausar, reanudar o cancelar según el estado permitido.
- Consultar progreso, métricas, destinatarios y errores.
- Exportar el snapshot y el informe.

Ejemplo de borrador con HTML directo:

```json
{
  "name": "Newsletter agosto",
  "list_id": "list_01...",
  "subject": "Novedades de agosto",
  "from": { "name": "KiroMail", "email": "news@example.com" },
  "content": {
    "html": "<html><body>...</body></html>",
    "text": "Novedades de agosto"
  },
  "segment_id": null,
  "exclusion_segment_ids": []
}
```

El HTML directo quedará versionado dentro de la campaña y no creará una plantilla. Lanzar una campaña será una acción separada con `Idempotency-Key`, confirmación del número estimado y errores bloqueantes. La API nunca omitirá preflight, bajas o supresiones.

### 18.6 Emails transaccionales por API

- `POST /api/v1/transactional/send` para un mensaje.
- `POST /api/v1/transactional/batch` para lotes de 1–100 elementos que creen mensajes independientes y devuelvan el resultado de cada uno.
- `GET /api/v1/transactional/batches/{id}` para consultar el resultado persistido del lote.
- `GET /api/v1/transactional/messages/{id}` para estado y metadatos.
- `GET /api/v1/transactional/messages/{id}/content` para HTML/texto según permiso y retención.
- `POST /api/v1/transactional/messages/{id}/retry` para crear de forma idempotente un mensaje nuevo desde un fallo que el proveedor no llegó a aceptar.
- `POST /api/v1/transactional/render` para renderizar sin guardar ni enviar.
- Consulta paginada y filtrable de mensajes.

La consulta de detalle incluye la línea temporal, los intentos de transporte, los adjuntos, el lote y el vínculo con el mensaje original cuando sea un reintento. Los adjuntos se cargan primero como activos con scope de plantillas y se referencian por UUID; nunca se descargan desde una URL arbitraria durante el envío.

El contrato detallado, la idempotencia, el almacenamiento y los estados están definidos en la sección de emails transaccionales.

### 18.7 Operaciones públicas para formularios externos

- Alta en una lista concreta.
- Alta pendiente y envío de confirmación.
- Confirmación mediante token.
- Actualización de preferencias.
- Medidas contra abuso, enumeración de emails y envíos repetidos.

No habrá un constructor interno de formularios.

### 18.8 Webhooks salientes

- Eventos de alta, confirmación, baja, campaña iniciada o completada y todos los eventos transaccionales seleccionables.
- URL, eventos seleccionados y secreto por endpoint.
- Firma HMAC, fecha y protección contra replay.
- Reintentos con backoff, historial de entregas y respuesta recibida.
- Reenvío manual de una entrega fallida.
- Desactivación automática tras fallos prolongados con aviso al administrador.

---

## 19. Arquitectura de datos propuesta

Entidades principales:

- `users`, `sessions` y recuperación/MFA.
- `contacts` para la identidad única y los campos globales.
- `lists`.
- `list_fields` para definir columnas particulares.
- `subscriptions` para estado, fechas, origen y valores validados de una persona en una lista.
- `consent_events` como historial inmutable.
- `segments` y su definición versionada de reglas.
- `imports`, `import_rows` y archivos de resultado.
- `templates` y `template_versions`, con canal, clave, formato, esquema de variables y estado de publicación.
- `reusable_blocks` y `assets`.
- `campaigns`, `campaign_versions`, variantes A/B y segmentos de inclusión/exclusión.
- `campaign_recipients` como snapshot de audiencia y exclusiones.
- `outbound_messages` como registro canónico de cada email individual, sea de campaña o transaccional.
- `message_content_blobs` para referenciar HTML, texto y MIME inmutables en el backend de almacenamiento.
- `message_attachments` para metadatos y blobs adjuntos.
- `email_events` como registro bruto idempotente vinculado a `outbound_messages`.
- `tracked_links` vinculados al mensaje y a su destino original.
- `suppressions` globales.
- `api_keys`, `webhook_endpoints` y `webhook_deliveries`.
- `settings` y `audit_log`.

### 19.1 Reglas de integridad

- Email único por comparación normalizada.
- Una suscripción por pareja suscriptor/lista.
- Una entrega lógica por campaña/suscriptor.
- Un destinatario por `outbound_message`.
- Un mensaje será de campaña o transaccional, nunca ambos.
- Un mensaje transaccional no requerirá contacto ni suscripción.
- Una clave idempotente única por clave API y operación transaccional.
- Una clave de evento única para deduplicar SES.
- Contenido y versión de plantilla inmutables desde la aceptación del mensaje.
- Hash y tamaño verificados antes de servir una previsualización histórica.
- No borrar físicamente entidades referenciadas por campañas o consentimientos.
- Guardar tiempos en UTC y mostrarlos en la zona horaria configurada.
- Validar tipos de campos tanto en API como en base de datos o capa de persistencia.
- Mantener eventos brutos separados de contadores derivados.
- Índices para email, estados, fechas, lista, campaña, canal, plantilla, metadata seleccionada, `messageId` de SES y consultas frecuentes de campos personalizados.

---

## 20. Instalación y operación con Docker

### 20.1 Servicios

- Aplicación web.
- Worker de colas y envíos.
- PostgreSQL.
- Redis con persistencia.
- Servicio de migración de base de datos.
- Volumen persistente de blobs para HTML, texto y adjuntos cuando se utilice el backend local.
- Mailpit únicamente en el perfil local/desarrollo.
- Proxy HTTPS externo recomendado y ejemplos para Caddy o Nginx.

### 20.2 Configuración

- `.env.example` completo y sin secretos reales.
- Validación de configuración al arrancar, con errores comprensibles.
- Secretos mediante variables protegidas, Docker secrets o rol IAM.
- Imágenes con versiones fijadas y política documentada de actualización.
- Contenedores ejecutados como usuario no privilegiado siempre que sea posible.
- Volúmenes explícitos para base de datos, Redis y archivos.
- Configuración intercambiable de `CONTENT_STORAGE=filesystem|s3`, ruta local, bucket, endpoint y credenciales mediante secretos.
- Colas y workers diferenciables para campañas y transaccionales, aunque puedan compartir imagen de contenedor.

### 20.3 Despliegues y migraciones

- Migraciones incrementales, repetibles y compatibles con datos existentes.
- Copia de seguridad recomendada antes de migraciones de riesgo.
- Despliegue que detenga ordenadamente workers sin duplicar envíos.
- Posibilidad de ejecutar varias réplicas de aplicación y worker.
- Verificación de salud antes de exponer la nueva versión.
- Guía de rollback de aplicación; las migraciones destructivas requerirán estrategia de compatibilidad.

### 20.4 Copias de seguridad y recuperación

- Copia programada de PostgreSQL, archivos subidos y blobs de mensajes que sigan dentro de retención.
- Cifrado y destino fuera del propio servidor.
- Retención configurable y limpieza segura.
- Comando y procedimiento documentados de restauración.
- Prueba periódica de restauración, no solo confirmación de que existe un archivo.
- Redis se considera recuperable para trabajos transitorios, pero la base de datos debe permitir reconstruir el estado seguro de las campañas.

### 20.5 Observabilidad

- Logs estructurados con `request_id`, `message_id`, identificadores de campaña y trabajo, sin incluir secretos, HTML ni contenido personal innecesario.
- Métricas separadas por canal para peticiones, errores, latencia, cola, envíos, reintentos y eventos SES.
- Endpoints separados de vida y disponibilidad.
- Alertas por aplicación caída, worker detenido, cola bloqueada, fallo de backup, espacio en disco, errores de base de datos y tasas de rebote/queja.
- Página de diagnóstico descargable con datos sensibles ocultos.

---

## 21. Seguridad y privacidad

- HTTPS obligatorio en producción y cabeceras de seguridad adecuadas.
- Protección CSRF en operaciones autenticadas y validación estricta de entrada.
- Consultas parametrizadas y mínimo privilegio en base de datos.
- Escape y sanitización de HTML para impedir XSS en editor, previsualizaciones e informes.
- `iframe` aislado y CSP restrictiva para previsualizar contenido enviado o editable.
- Validación contra inyección de cabeceras en asunto, remitente, respuesta y nombres de adjuntos.
- Validación de URL para impedir redirecciones peligrosas o SSRF.
- Límites y análisis de archivos subidos; nombres generados por el servidor.
- Verificación criptográfica de notificaciones SNS.
- Tokens de baja, preferencias, confirmación y recuperación firmados, acotados y revocables.
- Rotación de secretos sin invalidar inmediatamente enlaces legítimos; soporte de claves activa y anterior durante la transición.
- Cifrado de copias de seguridad y mínimo acceso a datos personales.
- Retención configurable para IP, agente de usuario, eventos detallados, importaciones y auditoría.
- Auditoría sin posibilidad de edición desde la interfaz.
- Autorización específica para consultar HTML, variables, adjuntos y metadata de mensajes transaccionales.
- Claves API almacenadas mediante hash, con scopes mínimos, rotación y revocación inmediata.
- Idempotencia transaccional persistente para que un timeout del cliente no provoque un segundo mensaje.
- Cifrado del backend de blobs y políticas de conservación adecuadas para contenido transaccional sensible.
- Dependencias actualizadas y análisis automático de vulnerabilidades de imagen y paquetes.
- Guía de respuesta a incidentes y revocación de claves.

La configuración debe favorecer privacidad por defecto: recoger solo los datos necesarios, explicar el seguimiento y permitir reducir la conservación.

---

## 22. Requisitos no funcionales

### 22.1 Rendimiento de referencia

**Estado de implementación:** superado en Docker con 100.000 contactos y suscripciones. Todos los P95 quedaron dentro de los umbrales; la prueba conserva capacidad transaccional reservada y limpia su conjunto temporal. Se ejecuta con `node scripts/verify-performance.mjs`.

- Base inicial objetivo: 100.000 suscriptores únicos y campañas de 100.000 destinatarios en una instalación estándar.
- Listados habituales con respuesta percibida inferior a 2 segundos en el percentil 95.
- Operaciones API simples inferiores a 500 ms en el percentil 95, excluyendo trabajos asíncronos.
- Aceptación durable de un transaccional sin adjuntos inferior a 500 ms en el percentil 95 en la instalación de referencia.
- Primer intento transaccional hacia SES en menos de 5 segundos en el percentil 95 mientras haya cuota y capacidad disponibles.
- Inicio de campañas programadas dentro del minuto previsto si SES y la infraestructura están disponibles.
- Importaciones y exportaciones grandes siempre en segundo plano.
- Escalado horizontal de aplicación y workers sin duplicar mensajes.
- Una campaña grande no podrá consumir la capacidad reservada al canal transaccional.

### 22.2 Accesibilidad y experiencia

**Estado de implementación:** objetivo administrativo verificado mediante navegador real en las diez secciones: semántica, nombres, etiquetas, encabezados, texto alternativo, teclado, foco modal, Escape, contraste y desbordamiento. El tema y los breakpoints incorporan las correcciones encontradas.

- Objetivo WCAG 2.2 AA para la interfaz administrativa.
- Uso completo por teclado, foco visible, etiquetas accesibles y mensajes anunciables.
- Diseño adaptable desde portátil hasta monitor amplio; móvil apto para consulta y acciones esenciales.
- Español como idioma inicial, con textos preparados para internacionalización.
- Fechas, números y zonas horarias mostrados de forma inequívoca.
- Confirmación y posibilidad de recuperación en acciones destructivas.

### 22.3 Compatibilidad

- Últimas dos versiones estables de Chrome, Firefox, Safari y Edge.
- Emails comprobados en Gmail web/móvil, Apple Mail, Outlook web y Outlook de escritorio representativo.
- Degradación legible cuando un cliente no admite una propiedad visual.

### 22.4 Fiabilidad

- Todas las tareas asíncronas deben poder retomarse tras reinicio.
- Eventos externos y órdenes internas deben ser idempotentes.
- Los contadores se podrán reconstruir desde destinatarios y eventos.
- Una degradación de informes nunca debe permitir saltarse una baja o supresión.
- Las pruebas automáticas deben cubrir consentimiento, audiencia, personalización, APIs, idempotencia transaccional, almacenamiento de contenido, envío, reintento, eventos y bajas.

---

## 23. Plan integral de implementación

Aunque se implemente el producto completo, el trabajo debe integrarse en bloques verificables y en este orden para no construir sobre un modelo provisional.

### Bloque 1 — Fundamentos y datos

- Nuevo modelo de suscriptor, lista, suscripción, campos y consentimiento.
- Migración sin pérdida de los datos actuales.
- Usuarios, roles, sesiones y auditoría.
- Operaciones CRUD y reglas de integridad.

### Bloque 2 — Gestión de audiencia

- Pantallas completas de suscriptores y listas.
- Constructor de campos.
- Segmentos tipados.
- Importación, exportación, tareas masivas y supresiones.
- API de suscripción y centro de preferencias.

### Bloque 3 — Contenido

- Biblioteca y rutas propias para plantillas y contenido de campaña.
- CRUD completo de plantillas y versiones mediante API, con HTML como formato de primera clase.
- Constructor visual práctico de pantalla completa con bloques esenciales y compilador versionado.
- Responsive, marca, recursos, variables y bloques reutilizables como copias.
- HTML, texto plano, autosave, historial y recuperación.
- Preview, envíos de prueba, comprobaciones de compatibilidad y accesibilidad.

### Bloque 4 — Transaccionales y núcleo de mensajes

- `outbound_messages`, contenido inmutable y almacenamiento filesystem/S3.
- API con plantilla o HTML directo, idempotencia y adjuntos controlados.
- Cola prioritaria, reintentos, estados, eventos, tracking y previsualización exacta.
- Registro de mensajes, detalle, métricas y webhooks firmados.

### Bloque 5 — Campañas y motor

- Asistente completo y preflight.
- Snapshot, colas, idempotencia, pausa, cancelación y recuperación.
- Programación, pruebas y A/B.
- Cabeceras de baja y seguimiento.

### Bloque 6 — SES y entregabilidad

- [x] Asistente de configuración y modo local claramente separado.
- [x] Configuration Sets separados, SNS firmado, TopicArn autorizado y todos los eventos por canal.
- [x] Supresiones, conciliación opcional, cuotas, reputación, alertas y diagnósticos.
- [x] Prueba técnica y parada global controlada antes de habilitar producción.
- [ ] Ensayo final contra la cuenta SES real de la instalación, dependiente de credenciales, DNS y Topics externos.

### Bloque 7 — Informes

- Métricas separadas para campañas y transaccionales.
- Enlaces, evolución, comparativas y crecimiento de listas.
- Latencia transaccional, detección de señales poco fiables y exportaciones.

### Bloque 8 — Producción

- [x] Seguridad, rendimiento y accesibilidad.
- [x] Docker, proxy, copias de seguridad, restauración y observabilidad.
- [x] Documentación de instalación, actualización, operación e incidentes.
- [x] Pruebas de extremo a extremo locales y ensayo de actualización/rollback.
- [ ] Ensayo completo con SES real, dependiente de la cuenta y DNS del propietario.

Cada bloque debe terminar con migraciones, pruebas automáticas, pruebas manuales, documentación y un camino de rollback antes de comenzar el siguiente.

---

## 24. Criterios para declarar el producto completo

KiroMail no se considerará listo para uso real hasta demostrar todos estos recorridos:

1. Crear una lista con campos propios, importar un CSV mapeando columnas y corregir errores sin duplicados.
2. Dar de alta el mismo email en dos listas con datos y estados independientes.
3. Crear por API una lista con sus campos y suscripciones, repetir la petición idempotente y obtener el mismo resultado.
4. Crear por API una plantilla HTML versionada, validarla, publicarla y renderizarla con variables.
5. Crear un segmento con campos personalizados e interacción histórica y obtener un recuento reproducible.
6. Diseñar en el constructor de pantalla completa un email responsive, recuperarlo sin pérdidas y comprobarlo mediante preview, HTML, texto y un envío de prueba.
7. Crear por API una campaña con HTML directo, validar la audiencia y programarla sin pasar por la interfaz.
8. Programar una campaña, reiniciar aplicación y worker durante el proceso y completar sin duplicados.
9. Enviar transaccionales con plantilla y HTML directo, repetir tras timeout sin duplicar y abrir después el HTML exacto enviado.
10. Consultar y recibir por webhook los eventos procesado, enviado, entregado, abierto, clic, rebote y fallo de cada transaccional.
11. Recibir y deduplicar eventos reales de entrega, rebote, queja, retraso, apertura y clic de SES.
12. Dar de baja mediante el enlace visible y mediante one-click, impidiendo cualquier campaña posterior de esa lista.
13. Mantener activa otra lista y permitir transaccionales legítimos después de una baja promocional específica.
14. Bloquear globalmente una queja o rebote permanente y evitar el envío desde campañas y transaccionales.
15. Restaurar una copia de seguridad en una instalación limpia y recuperar datos, blobs, campañas, mensajes e historial.
16. Actualizar de una versión anterior conservando suscriptores y envíos.
17. Superar pruebas de seguridad, accesibilidad, rendimiento y compatibilidad de email definidas para la versión.

**Estado de aceptación:** los recorridos reproducibles en local están demostrados por los verificadores E2E y el registro de continuidad. El punto 11 queda verificado con eventos firmados simulados y pendiente de repetición contra la cuenta SES real; la comprobación física final de Gmail, Apple Mail y Outlook se realiza al conectar esa infraestructura. Ninguna de estas dos dependencias externas bloquea la instalación en modo seguro Mailpit ni la revisión funcional del producto.

---

## 25. Referencias técnicas y de cumplimiento

- [Amazon SES: uso de Configuration Sets y publicación de eventos](https://docs.aws.amazon.com/ses/latest/dg/using-configuration-sets.html).
- [Amazon SES API v2: operación SendEmail para contenido simple, raw o mediante plantilla](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html).
- [Amazon SES: contenido de eventos publicados mediante SNS](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html).
- [Amazon SES: gestión obligatoria de rebotes y quejas](https://docs.aws.amazon.com/ses/latest/dg/monitor-sending-activity-using-notifications.html).
- [Amazon SES: cuotas del servicio](https://docs.aws.amazon.com/ses/latest/dg/quotas.html).
- [Google: directrices vigentes para remitentes de email](https://support.google.com/mail/answer/81126).
- [IETF RFC 8058: baja de listas en un clic](https://datatracker.ietf.org/doc/html/rfc8058).
- [Reglamento General de Protección de Datos, texto oficial](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
- [Directiva 2002/58/CE sobre comunicaciones electrónicas, texto consolidado](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02002L0058-20060503).

Esta especificación define capacidades técnicas y de producto. La configuración concreta de consentimiento, conservación y comunicaciones comerciales debe revisarse para la jurisdicción y el caso de uso del responsable de los datos; no sustituye asesoramiento legal.

---

## 26. Decisiones de producto resueltas

La implementación 1.1 fija estos valores, todos configurables donde se indica:

1. Se mantienen administrador, editor y analista con permisos mínimos distintos.
2. TOTP es opcional, recomendado para todos y especialmente para administradores.
3. Las pruebas A/B forman parte de esta versión completa.
4. Un rebote transitorio conserva diagnóstico y permite reintento; no crea una supresión global.
5. Valores iniciales: eventos 730 días, auditoría 1.095 días e IP/agente 90 días, configurables en Ajustes.
6. El centro de preferencias solo expone campos marcados expresamente como públicos.
7. Cada instalación elige una sola fuente de aperturas/clics, propia o SES, evitando duplicación.
8. La referencia validada es 100.000 contactos y suscripciones.
9. El contenido exacto parte de 90 días de retención, configurable y sujeto a la política del responsable.
10. Los adjuntos admiten 8 MiB por defecto, el MIME final 40 MB y cada batch 1–100 mensajes.
11. Configuration Sets separados son obligatorios; subdominios separados se recomiendan, pero no se fuerzan.
12. El tracking transaccional está desactivado por defecto y se activa solo por ajuste, plantilla o petición justificada.
