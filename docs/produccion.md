# Puesta en producción de KiroMail

Esta guía describe una instalación nueva en un único servidor con Docker
Compose, Caddy y Amazon SES. Los comandos se ejecutan desde la raíz del
repositorio y usan siempre `scripts/prod-compose.sh`, que combina el Compose
base con su override de producción.

## 1. Servidor y red

Punto de partida recomendado para una instalación de hasta aproximadamente
100.000 contactos:

- Linux x86_64 o arm64 actualizado.
- 2 vCPU, 4 GiB de RAM y 40 GiB SSD como mínimo inicial.
- Docker Engine y Docker Compose v2 actuales.
- Acceso SSH mediante clave y actualizaciones de seguridad automáticas.
- Puertos públicos 80/TCP, 443/TCP y 443/UDP; PostgreSQL, Redis, aplicación y
  Mailpit no deben publicarse.
- Un registro DNS A y, si corresponde, AAAA para el dominio de la aplicación.

El tamaño real depende del volumen de HTML histórico, adjuntos y frecuencia de
envío. Se debe vigilar disco, memoria, colas y latencia después del estreno.

## 2. Preparar una versión recuperable

Despliega siempre un commit o una etiqueta concreta. No copies un árbol de
trabajo con cambios sin registrar. Conserva la etiqueta anterior para rollback
y no uses `latest` como única referencia operativa.

```bash
git status --short
git describe --always --dirty
```

## 3. Variables y secretos

```bash
cp .env.production.example .env
${EDITOR:-vi} .env
npm run prod:secrets
```

Como mínimo, cambia `APP_DOMAIN` y `ADMIN_EMAIL`. El generador crea secretos con
permisos `0600`, no sobrescribe los existentes y deja vacíos los tres archivos
de AWS. En una instancia AWS esos archivos vacíos indican que se utilizará el
rol IAM del servidor. En un VPS externo, escribe credenciales de mínimo
privilegio en:

- `secrets/aws_access_key_id`
- `secrets/aws_secret_access_key`
- `secrets/aws_session_token`, solo si corresponde

No guardes `.env` ni `secrets/` en Git, una imagen Docker, un ticket o una copia
sin cifrar.

## 4. Amazon SES y DNS de correo

En una única región AWS:

1. Verifica el dominio remitente y publica DKIM.
2. Configura DMARC y, preferiblemente, un subdominio MAIL FROM con MX y SPF.
3. Solicita acceso de producción y una cuota suficiente.
4. Crea Configuration Sets distintos para marketing y transaccional.
5. Publica en SNS `SEND`, `DELIVERY`, `BOUNCE`, `COMPLAINT`, `REJECT`,
   `DELIVERY_DELAY` y `RENDERING_FAILURE`. Añade `OPEN` y `CLICK` únicamente si
   SES será la fuente de seguimiento.
6. Suscribe el Topic HTTPS a
   `https://APP_DOMAIN/api/events/ses` y confirma la suscripción.
7. Añade todos los ARN autorizados a `SNS_TOPIC_ARNS` en `.env`.

Permisos IAM mínimos habituales: `ses:SendEmail`, `ses:GetAccount`,
`ses:ListEmailIdentities`, `ses:GetEmailIdentity`,
`ses:ListConfigurationSets` y `ses:GetConfigurationSetEventDestinations`. La
conciliación añade `ses:ListSuppressedDestinations` y el modo bidireccional
añade `ses:PutSuppressedDestination`.

## 5. Primer arranque

```bash
./scripts/prod-compose.sh config --quiet
./scripts/prod-compose.sh --profile ops up -d --build
./scripts/prod-compose.sh ps
```

El migrador de producción ejecuta exclusivamente las migraciones y crea el
primer administrador si todavía no existe ninguno. Nunca carga contactos,
campañas ni métricas de demostración.

Caddy obtiene y renueva el certificado. Cuando DNS y HTTPS estén listos:

```bash
curl --fail "https://${APP_DOMAIN}/api/health/live"
curl --fail "https://${APP_DOMAIN}/api/health/ready"
```

## 6. Configuración inicial en la aplicación

Entra con `ADMIN_EMAIL` y la contraseña de `secrets/admin_password`. En Ajustes:

1. Sustituye nombre, remitente, respuesta y dirección postal.
2. Selecciona Amazon SES, región y los dos Configuration Sets.
3. Ajusta los tres ritmos por debajo de la cuota SES efectiva.
4. Elige seguimiento local o SES sin activar ambos como autoridad.
5. Configura dominios autorizados, umbrales y conciliación.
6. Decide filesystem o S3 y revisa todas las retenciones.
7. Activa TOTP y guarda los códigos de recuperación fuera del servidor.
8. Crea cuentas personales; no compartas el administrador inicial.

En Entregabilidad ejecuta «Comprobar ahora». El panel debe confirmar dominio,
cuota, Configuration Sets y destinos antes de retirar la pausa global.

## 7. Verificación antes del primer envío

El verificador puede ejecutarse dentro del contenedor sin copiar la contraseña
al entorno del host:

```bash
./scripts/prod-compose.sh exec -T \
  -e VERIFY_BASE_URL=http://localhost:3000 \
  app npm run verify:production
```

Además:

- Envía una prueba a Gmail, Apple Mail y Outlook.
- Comprueba texto plano, enlaces, baja visible y one-click.
- Verifica entrega, apertura, clic, rebote, queja y retraso en SNS.
- Confirma que una baja de lista no afecta otras listas y que una queja sí
  bloquea globalmente.
- Ejecuta una campaña pequeña de contactos internos antes de importar la base
  completa.

## 8. Backup y restauración

El perfil `ops` mantiene una copia cifrada diaria, pero el volumen del mismo
servidor no protege frente a pérdida física. Replica los `.enc` y `.sha256` a
un destino externo con cifrado y control de acceso.

```bash
./scripts/prod-compose.sh --profile ops run --rm backup /opt/kiromail/backup.sh
./scripts/prod-compose.sh --profile ops run --rm backup \
  /opt/kiromail/restore-test.sh /backups/kiromail-AAAAMMDDTHHMMSSZ.tar.gz.enc
```

Restauración completa:

```bash
./scripts/prod-compose.sh stop app worker
./scripts/prod-compose.sh --profile ops run --rm \
  -e CONFIRM_RESTORE=RESTORE_KIROMAIL \
  backup /opt/kiromail/restore.sh /backups/kiromail-AAAAMMDDTHHMMSSZ.tar.gz.enc
./scripts/prod-compose.sh up -d app worker
curl --fail "https://${APP_DOMAIN}/api/health/ready"
```

Prueba la restauración al menos mensualmente y después de cambios relevantes
de almacenamiento.

## 9. Actualización y rollback

Antes de actualizar:

```bash
npm run verify:upgrade
./scripts/prod-compose.sh --profile ops run --rm backup /opt/kiromail/backup.sh
```

Despliegue ordenado:

```bash
./scripts/prod-compose.sh build app worker migrate
./scripts/prod-compose.sh stop worker
./scripts/prod-compose.sh run --rm migrate npm run db:migrate
./scripts/prod-compose.sh up -d app worker
curl --fail "https://${APP_DOMAIN}/api/health/ready"
./scripts/prod-compose.sh exec -T \
  -e VERIFY_BASE_URL=http://localhost:3000 \
  app npm run verify:production
```

Las migraciones actuales son aditivas. Para un rollback de aplicación, detén
el worker, despliega la etiqueta anterior y repite salud y verificación. No
reviertas SQL manualmente. Si una futura versión rompe compatibilidad, restaura
la copia completa con app y worker detenidos.

## 10. Operación y alertas

Configura como mínimo:

- Uptime externo sobre `/api/health/live` y `/api/health/ready`.
- Scraping autenticado de `/api/metrics`.
- Alertas por worker sin heartbeat, colas fallidas, DLQ, pausa global, rebotes,
  quejas, disco, memoria y certificado TLS.
- Confirmación diaria de backup y alerta por copia ausente.
- Rotación externa de la copia cifrada y prueba periódica de recuperación.

Compose limita por defecto cada log JSON a cinco archivos de 20 MiB. Ajusta
`DOCKER_LOG_MAX_SIZE` y `DOCKER_LOG_MAX_FILES` después de medir, sin desactivar
la retención externa de logs necesaria para investigar incidentes.
