<p align="center">
  <img src="public/kiro-cat.svg" width="104" height="104" alt="Kiro, el gato de KiroMail">
</p>

<h1 align="center">KiroMail</h1>

<p align="center">
  Email marketing autoinstalable para newsletters y mensajes transaccionales.<br>
  Tus contactos, tus plantillas, tus datos y tu infraestructura.
</p>

KiroMail permite gestionar audiencias con campos personalizados, diseñar y versionar plantillas, enviar campañas o emails transaccionales y analizar todo el ciclo de entrega. Usa Amazon SES en producción y Mailpit como buzón seguro durante el desarrollo local. El nombre y el icono están inspirados en Kiro, el gato que acompaña el proyecto.

> **Estado:** `1.0.0-rc.2`. La aplicación está funcionalmente completa y preparada para instalarse en un servidor; la validación final debe repetirse con el dominio, DNS y cuenta SES reales de cada instalación.

## Qué incluye

- Contactos de newsletter, listas independientes, campos propios y consentimiento trazable.
- Importación y exportación CSV, segmentos tipados y centro público de preferencias.
- Campañas programadas, pruebas A/B, pausa, reanudación y snapshot de audiencia.
- Plantillas HTML versionadas y editor visual práctico en pantalla completa.
- Email transaccional individual o batch mediante plantilla o HTML directo.
- API REST documentada con OpenAPI, claves con scopes, idempotencia y webhooks firmados.
- Eventos de envío, entrega, apertura, clic, rebote, queja y baja.
- Amazon SES, SNS, Mailpit, PostgreSQL, Redis/BullMQ, almacenamiento local o S3.
- Usuarios con roles, sesiones revocables, TOTP, auditoría, métricas y operaciones.
- Docker Compose, HTTPS con Caddy, secretos, backups cifrados y rollback documentado.

## Arquitectura

KiroMail está construido con Next.js 16, React 19, PostgreSQL 17, Redis y BullMQ. La aplicación web y los workers comparten el mismo modelo de datos; Amazon SES o SMTP actúan únicamente como transporte. El HTML exacto enviado y sus eventos quedan disponibles para auditoría según la política de retención configurada.

## Arranque local

Necesitas Docker Desktop o Docker Engine con Compose.

```bash
docker compose up --build
```

Cuando todos los servicios estén saludables:

- Aplicación: http://localhost:3100
- Buzón de pruebas Mailpit: http://localhost:8026
- Usuario: `admin@kiromail.local`
- Contraseña: `kiromail-local-2026`

El primer arranque crea el esquema y carga datos de demostración. Los volúmenes de PostgreSQL, Redis, Mailpit, activos y contenido exacto sobreviven a los reinicios.

## Flujo local de campañas

1. Crea o importa suscriptores.
2. Diseña una plantilla HTML.
3. Crea una campaña y selecciona una newsletter, un segmento o todos los suscritos.
4. Envía o programa la campaña.
5. Abre Mailpit para inspeccionar cada mensaje sin mandar correo real.

Las aperturas, clics y bajas se registran también en local al interactuar con el mensaje desde Mailpit.

## Formato CSV

La única columna obligatoria es `email`. Se reconocen nombres de columna tanto en español como en inglés:

```csv
email,nombre,apellidos,telefono,ciudad,pais
ana@example.com,Ana,López,+34123456789,Madrid,España
```

## Activar Amazon SES

1. Verifica el dominio y el remitente en SES y solicita acceso de producción.
2. Configura DKIM, SPF, DMARC y, si procede, un dominio MAIL FROM personalizado.
3. Crea dos Configuration Sets distintos —marketing y transaccional— y publica en SNS `SEND`, `DELIVERY`, `BOUNCE`, `COMPLAINT`, `REJECT`, `DELIVERY_DELAY` y `RENDERING_FAILURE`. Añade `OPEN` y `CLICK` solamente si eliges SES como fuente de seguimiento.
4. Apunta la suscripción HTTPS de SNS a `https://tu-dominio/api/events/ses`.
5. Copia `.env.example` a `.env`, añade `SNS_TOPIC_ARNS` y las credenciales solo si no usas un rol IAM.
6. En Ajustes selecciona Amazon SES, región y ambos Configuration Sets; después abre Entregabilidad y ejecuta «Comprobar ahora».

`MAIL_TRANSPORT` y `AWS_REGION` vacíos permiten gobernar ambos valores desde la interfaz. Si los defines en el entorno se convierten en overrides visibles en Entregabilidad.

En una instancia EC2 es preferible asignar un rol IAM al servidor y omitir claves estáticas. Para el asistente y el envío hacen falta, como mínimo, `ses:SendEmail`, `ses:GetAccount`, `ses:ListEmailIdentities`, `ses:GetEmailIdentity`, `ses:ListConfigurationSets` y `ses:GetConfigurationSetEventDestinations`. Si activas conciliación de supresiones, añade `ses:ListSuppressedDestinations` y, para el modo bidireccional, `ses:PutSuppressedDestination`.

## Seguridad antes de publicar

- Cambia `ADMIN_PASSWORD`, `SESSION_SECRET` y `DATA_ENCRYPTION_KEY`; las dos claves deben ser largas, aleatorias y diferentes.
- Activa TOTP desde Ajustes y conserva los códigos de recuperación fuera del servidor.
- Sirve la aplicación detrás de HTTPS y configura `TRUST_PROXY=true` solo cuando el proxy sea el único punto de entrada.
- Restringe el acceso a PostgreSQL y Redis a la red interna de Docker.
- Define un `METRICS_TOKEN` independiente para el scraper Prometheus.
- Limita las credenciales de AWS al envío de SES.
- Configura y prueba las notificaciones de rebotes y quejas.

La aplicación añade CSP, HSTS cuando detecta HTTPS, protección CSRF de las sesiones, límites distribuidos en Redis por clave/IP, `X-Request-Id` y comprobaciones de configuración insegura. Las variables sensibles admiten el patrón `NAME_FILE=/run/secrets/name`; el valor montado prevalece sobre la variable normal.

## Despliegue HTTPS con secretos

El override de producción incluye Caddy, elimina los puertos públicos de app y Mailpit, monta secretos como archivos y arranca una base limpia sin datos de demostración. La guía completa está en [docs/produccion.md](docs/produccion.md).

```bash
cp .env.production.example .env
${EDITOR:-vi} .env
npm run prod:secrets
./scripts/prod-compose.sh config --quiet
./scripts/prod-compose.sh --profile ops up -d --build
```

El ejemplo [Caddyfile.example](Caddyfile.example) obtiene y renueva TLS automáticamente. La URL `/api/health/live` comprueba el proceso; `/api/health/ready` valida PostgreSQL, Redis y secretos. La sección Operaciones muestra workers, colas, almacenamiento, mantenimiento y trabajos agotados. `/api/metrics` sirve formato Prometheus con `Authorization: Bearer $METRICS_TOKEN`.

En AWS se recomienda un rol IAM de mínimo privilegio. Si necesitas claves estáticas, la aplicación también admite `AWS_ACCESS_KEY_ID_FILE`, `AWS_SECRET_ACCESS_KEY_FILE` y `AWS_SESSION_TOKEN_FILE`; móntalas como secretos adicionales, no dentro de la imagen ni del repositorio.

## Almacenamiento de contenido

`filesystem` conserva HTML/texto comprimidos en el volumen `content_data`. Para S3 configura `S3_BUCKET`, región y credenciales o rol IAM, y elige S3 en Ajustes; cada objeto se cifra en servidor, mantiene SHA-256 y se vuelve a verificar al leer. `S3_ENDPOINT` y `S3_FORCE_PATH_STYLE=true` permiten usar implementaciones compatibles como MinIO. La retención elimina únicamente blobs caducados y deja el mensaje y sus eventos para auditoría.

## Copias y recuperación

El perfil `ops` genera cada día una copia cifrada AES-256 de PostgreSQL, activos y contenido local, con hash SHA-256 y retención configurable:

```bash
./scripts/prod-compose.sh --profile ops up -d backup
./scripts/prod-compose.sh --profile ops run --rm backup /opt/kiromail/backup.sh
```

Comprueba una copia restaurándola de verdad en la base aislada y fija `kiromail_restore_test`:

```bash
./scripts/prod-compose.sh --profile ops run --rm backup /opt/kiromail/restore-test.sh /backups/kiromail-AAAAMMDDTHHMMSSZ.tar.gz.enc
```

La restauración completa exige una confirmación literal. Detén primero app y worker, conserva una copia del estado actual y después ejecuta:

```bash
./scripts/prod-compose.sh stop app worker
./scripts/prod-compose.sh --profile ops run --rm -e CONFIRM_RESTORE=RESTORE_KIROMAIL backup /opt/kiromail/restore.sh /backups/kiromail-AAAAMMDDTHHMMSSZ.tar.gz.enc
./scripts/prod-compose.sh up -d app worker
```

Los resultados de backup, prueba y mantenimiento quedan visibles en Operaciones. Se recomienda replicar el volumen `backup_data` cifrado fuera del servidor; una copia en el mismo host no protege frente a pérdida física.

Tras desplegar o actualizar, ejecuta `./scripts/prod-compose.sh exec -T -e VERIFY_BASE_URL=http://localhost:3000 app npm run verify:production`. La comprobación valida salud, cabeceras, CSRF, métricas, heartbeat, MFA completo, códigos de recuperación, validación de cabeceras, reconciliación y OpenAPI; usa un administrador temporal que deja desactivado al terminar.

## Actualización y rollback

Antes de actualizar, guarda el identificador de la versión en uso y crea una copia cifrada verificable. El ensayo automatizado construye dos bases temporales, aplica todas las migraciones salvo la última, introduce datos centinela, actualiza, comprueba que una aplicación anterior todavía puede leer y escribir y restaura el snapshot previo. No modifica `kiromail`:

```bash
npm run verify:upgrade
./scripts/prod-compose.sh --profile ops run --rm backup /opt/kiromail/backup.sh
```

Despliega con parada ordenada del worker, migración separada y readiness antes de volver a enviar:

```bash
./scripts/prod-compose.sh build app worker migrate
./scripts/prod-compose.sh stop worker
./scripts/prod-compose.sh run --rm migrate npm run db:migrate
./scripts/prod-compose.sh up -d app worker
curl --fail "https://${APP_DOMAIN}/api/health/ready"
./scripts/prod-compose.sh exec -T -e VERIFY_BASE_URL=http://localhost:3000 app npm run verify:production
```

Las migraciones actuales son aditivas y permiten volver temporalmente al código de la versión anterior sin revertir el esquema. Para ese rollback, detén el worker, despliega el commit o imagen anterior y repite las comprobaciones de salud. No ejecutes SQL inverso sobre la base en producción. Si una versión futura incluye un cambio destructivo, deberá usar expansión/contracción; si no fuera compatible, detén app y worker y restaura la copia completa con el procedimiento de la sección anterior.

PostgreSQL reserva por defecto `256mb` de memoria compartida para listados concurrentes en la referencia de 100.000 contactos. Ajusta `POSTGRES_SHM_SIZE` solo después de medir en el servidor. La carga reproducible se ejecuta con `node scripts/verify-performance.mjs`; crea y elimina su propio conjunto de 100.000 contactos y no debe lanzarse durante envíos reales.

## Desarrollo sin Docker

Con PostgreSQL, Redis y un SMTP accesibles:

```bash
npm install
npm run db:setup
npm run dev
npm run worker
```

## Comprobaciones

```bash
npm test
npm run lint
npm run build
npm run verify:bootstrap
npm run verify:upgrade
```

## Documentación

- [Especificación funcional completa](docs/especificacion-funcional.md)
- [Instalación y operación en producción](docs/produccion.md)
- Referencia OpenAPI integrada en `/api-docs` después de iniciar la aplicación

## Seguridad

No publiques vulnerabilidades en una issue. Usa la opción **Report a vulnerability** de GitHub para abrir un aviso privado con pasos de reproducción, impacto y versión afectada.

## Contribuciones

Las propuestas y correcciones son bienvenidas mediante issues y pull requests. Antes de enviar cambios, ejecuta `npm test`, `npm run lint` y `npm run build`.

## Licencia

El repositorio es público, pero todavía no se ha elegido una licencia de código abierto. Hasta que se añada un archivo `LICENSE`, se reservan todos los derechos sobre el código.
