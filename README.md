# api_incidentReport

Microservicio independiente para convertir alertas normalizadas entregadas por `api_zaSmaOlt` en incidentes, impacto de clientes y reportes. No contiene GIS, aprovisionamiento ONU ni conexiones directas a SmartOLT o Zabbix.

## Fase 1 implementada

- NestJS con TypeScript estricto, Pino, Helmet, CORS y filtro global de errores.
- PostgreSQL con Prisma y una migración inicial para configuración del sistema.
- Clientes de Redis y RabbitMQ preparados como dependencias globales.
- Exchange RabbitMQ durable `network.events` y cola durable de salud verificables.
- Endpoint de salud: `GET /api/v1/health`.
- OpenAPI/Swagger: `GET /api/docs`.
- Docker Compose para API, PostgreSQL, Redis, RabbitMQ Management y MailHog opcional.

Los módulos de alertas, incidentes, correlación, impacto, reportes, SLA y notificaciones se incorporarán en las fases siguientes sin cambiar esta infraestructura ni el núcleo de autenticación.

## Fase 2 implementada

- Usuarios, roles y permisos persistidos en PostgreSQL; los roles iniciales son `ADMIN`, `NOC_SUPERVISOR`, `NOC_OPERATOR`, `TECHNICIAN`, `AUDITOR` y `VIEWER`.
- Autenticación JWT con token de acceso, refresh token rotatorio, revocación y hashes Argon2id.
- RBAC basado en permisos y limitación global de solicitudes.
- Endpoints: `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` y gestión protegida bajo `/api/v1/users`.

## Fase 3 implementada

- Contrato DTO estricto para los catorce eventos normalizados de `api_zaSmaOlt`.
- Persistencia de alertas con restricción única en `externalEventId`, deduplicación rápida en Redis e idempotencia segura ante concurrencia en PostgreSQL.
- Consumidor durable de RabbitMQ para `network.events` con prefetch de 20 mensajes, reintentos con backoff exponencial y cola de mensajes fallidos `network.events.dlq`.
- Ingestión HTTP protegida por el encabezado `x-integration-api-key`: `POST /api/v1/alerts/ingest`.
- Consulta paginada y protegida de alertas: `GET /api/v1/alerts` y `GET /api/v1/alerts/:id`.

## Fase 4 implementada

- Motor de incidentes que crea `INC-YYYY-000001` de forma secuencial y enlaza cada alerta una sola vez.
- Agrupación inicial por ventana temporal, tipo de evento, OLT y PON; la correlación basada en reglas se incorpora en la Fase 6.
- Estados protegidos: `DETECTED → INVESTIGATING → CONFIRMED → IN_PROGRESS → MONITORING → RESOLVED → CLOSED`, con soporte para `FALSE_POSITIVE` y reapertura controlada desde `RESOLVED`.
- Timeline completo y eventos asociados por incidente, incluyendo alertas de recuperación que lo trasladan a `MONITORING`.
- Endpoints: `GET /api/v1/incidents`, `GET /api/v1/incidents/:id`, `GET /api/v1/incidents/:id/timeline`, `GET /api/v1/incidents/:id/events`, y acciones de acknowledge, estado, resolve y close.

## Fase 5 implementada

- Adapter reemplazable para `api_zaSmaOlt`: modo `mock` para desarrollo y modo `http` con timeout, encabezado de API key y circuit breaker.
- Impact Engine que se ejecuta después de cada alerta asociada a un incidente, persiste los clientes/ONU afectados y actualiza sus contadores operativos.
- Escenario mock verificable para `OLT-CUE-01`, PON `1/4`: 32 clientes potenciales, 29 offline y 3 online.
- Endpoints protegidos: `GET /api/v1/incidents/:id/customers` y `POST /api/v1/incidents/:id/impact/refresh`.

## Fase 6 implementada

- Motor determinístico de correlación con clave por OLT, PON u ONU y ventana temporal configurable mediante `INCIDENT_CORRELATION_WINDOW_SECONDS`.
- Reglas persistidas en PostgreSQL para clasificar tipo de incidente, causa raíz, confianza y severidad, incluyendo escalamiento por cantidad de clientes afectados.
- Cada alerta conserva su resultado de correlación y se incorpora un evento `CORRELATION_ANALYZED` en el timeline del incidente.
- Escenario inicial: diez ONU offline distintas en una PON dentro de la ventana se consolidan como `PON_FAILURE` con 85 % de confianza y severidad `CRITICAL`.
- Administración protegida para administradores: `GET`, `POST`, `PATCH` y `DELETE` bajo `/api/v1/correlation/rules`.

## Fase 7 implementada

- Report Engine desacoplado mediante estrategias para `PDF` (Puppeteer), `XLSX` (ExcelJS), `CSV` (fast-csv) y `JSON`.
- Entidad `Report` persistida con estado, formato, período, usuario solicitante, tamaño, ruta y posible error de generación.
- PDF con resumen ejecutivo, KPIs, detalle del incidente, clientes afectados y timeline; XLSX con hojas de resumen, incidentes, clientes, timeline y eventos.
- Endpoints protegidos: `GET /api/v1/reports`, `POST /api/v1/reports/generate`, `GET /api/v1/reports/:id`, `GET /api/v1/reports/:id/download` y `GET /api/v1/incidents/:id/reports`.

## Fase 8 implementada

- Motor de notificaciones desacoplado con canales `EMAIL` (SMTP/Nodemailer) y `WEBHOOK` (HTTP JSON con timeout).
- Reglas persistidas por evento, severidad mínima, canal y destino; las reglas iniciales quedan deshabilitadas para que una instalación nueva no envíe mensajes sin configurar un destinatario.
- Entregas auditables con estado `PENDING`, `SENDING`, `SENT`, `FAILED` o `SKIPPED`, contador de intentos, error y metadatos de entrega.
- Eventos cubiertos: creación y correlación de incidente, detección de recuperación, resolución y cierre manual. Un fallo de entrega queda registrado y no interrumpe el procesamiento de alertas.
- Endpoints protegidos: historial en `GET /api/v1/notifications` y `GET /api/v1/incidents/:id/notifications`; administración de reglas mediante `GET`, `POST`, `PATCH` y `DELETE` bajo `/api/v1/notifications/rules`.

## Fase 9 implementada

- Cálculo de SLA por período y alcance `GLOBAL`, `OLT`, `PON` o `CUSTOMER`, incluyendo tiempo total, caída consolidada, disponibilidad, número de incidentes, MTTR y MTBF.
- Las ventanas de indisponibilidad que se superponen se fusionan antes de calcular SLA, evitando descontar el mismo minuto dos veces. Para clientes se usan los intervalos reales de afectación y recuperación registrados en `IncidentCustomer`.
- Snapshots SLA persistidos en PostgreSQL (`SlaRecord`) con clave única por alcance y período; recalcular el mismo snapshot lo actualiza de forma idempotente.
- Estadísticas de incidentes por día, severidad, estado, causa raíz, OLT y PON; además de clientes afectados, acumulado de indisponibilidad y el ranking de clientes más afectados.
- Resumen compacto para dashboard NOC: incidentes activos/críticos, clientes y ONU afectadas, resueltos hoy, MTTR y disponibilidad.
- Endpoints protegidos por `statistics.read`: `GET /api/v1/statistics`, `/statistics/incidents`, `/statistics/customers`, `/statistics/availability`, `GET /api/v1/sla` y `GET /api/v1/dashboard/summary`. Los snapshots se listan con `GET /api/v1/sla/snapshots` y se calculan/guardan con `POST /api/v1/sla/snapshots` (requiere `configuration.update`).

## Fase 10 implementada

- Pruebas unitarias para SLA, notificaciones, adaptadores y observabilidad; prueba E2E contra PostgreSQL, Redis y RabbitMQ que confirma salud, métricas y protección JWT de las estadísticas.
- Métricas Prometheus en `GET /metrics`: métricas estándar de proceso más `alerts_received_total`, `incidents_created_total`, `incidents_resolved_total`, `reports_generated_total`, `affected_customers_total`, `failed_events_total` y los histogramas de duración de eventos, reportes y llamadas a `api_zaSmaOlt`.
- El endpoint de métricas queda fuera del prefijo `/api/v1` para facilitar el scraping. En producción se desactiva si `METRICS_ENABLED` no se define; al activarlo requiere un bearer token de al menos 32 caracteres.
- Endurecimiento operativo: CORS explícito sin comodines, lista de métodos/encabezados permitidos, `Helmet`, Swagger deshabilitado por defecto en producción y soporte de `TRUST_PROXY` para un proxy inverso confiable.
- Actualización de seguridad para la dependencia transitiva `multer` a `2.3.0` mediante una anulación explícita y limpieza segura de conexiones Redis no inicializadas al apagar la aplicación.

## Arquitectura de integración

`api_zaSmaOlt` es el único proveedor operativo externo. Este servicio recibe eventos por HTTP o RabbitMQ y consulta su API mediante un adapter. No comparte base de datos ni se conecta directamente a SmartOLT/Zabbix.

## Inicio local

1. Copie `.env.example` a `.env` y sustituya los secretos de ejemplo.
2. Instale dependencias: `npm install`.
3. Arranque infraestructura: `docker compose up -d postgres redis rabbitmq`.
4. Genere Prisma y aplique esquema: `npm run prisma:generate` y `npm run prisma:deploy`.
5. Cargue los roles, permisos y administrador inicial: `npm run prisma:seed`.
6. Inicie la API: `npm run start:dev`.

Para ejecutar el conjunto completo en contenedores: `docker compose up -d --build`. RabbitMQ Management queda en `http://localhost:15672` (credenciales de desarrollo: `incident_user` / `incident_password`). MailHog se habilita con `docker compose --profile mail up -d`.

## Verificación

Ejecute `npm run build`, `npm test` y `npm run lint`. El endpoint de salud devuelve `healthy` cuando PostgreSQL, Redis, RabbitMQ, el almacenamiento y `api_zaSmaOlt` son accesibles; de otro modo devuelve HTTP 503 con el estado por dependencia.

## Variables de entorno

Revise `.env.example`. La configuración para ejecutar la API desde el host apunta a `omniSentinel_db` en `localhost:5433`, evitando conflicto con un PostgreSQL local que ya use 5432. Dentro de Docker, PostgreSQL usa el alias interno `postgres.db`; Redis y RabbitMQ se sustituyen por sus nombres de servicio internos automáticamente. No use la contraseña de desarrollo fuera de un entorno local controlado.

`ADMIN_EMAIL`, `ADMIN_USERNAME` y `ADMIN_PASSWORD` se usan una vez para crear el administrador inicial durante el seed. Cambie la contraseña de desarrollo antes de una instalación real.

`ZASMAOLT_API_KEY` es la clave compartida temporal que `api_zaSmaOlt` debe enviar en `x-integration-api-key` al usar la ingestión HTTP. Rote el valor de desarrollo y guárdelo en un gestor de secretos antes de producción.

Para desarrollo mantenga `ZASMAOLT_ADAPTER_MODE=mock`. Cuando exista `api_zaSmaOlt`, cambie a `http` y configure `ZASMAOLT_API_URL`, `ZASMAOLT_API_KEY`, `ZASMAOLT_API_KEY_HEADER`, el timeout y el circuit breaker según el contrato real de esa API.

Las reglas de correlación y severidad se crean con valores iniciales durante la migración. Se modifican en Swagger con una cuenta que tenga el permiso `configuration.update`; esos cambios se conservan en PostgreSQL.

Para notificaciones, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM` con los datos de su proveedor de correo. En desarrollo puede levantar MailHog con `docker compose --profile mail up -d`, usar `SMTP_HOST=localhost`, `SMTP_PORT=1025` y consultar los mensajes en `http://localhost:8025`. `NOTIFICATION_EMAIL_RECIPIENTS` admite destinatarios separados por coma o punto y coma y se usa cuando una regla de correo no define su propio destino. Defina una URL HTTPS de su sistema receptor como destino de cada regla `WEBHOOK`; `NOTIFICATION_WEBHOOK_TIMEOUT_MS` limita su tiempo de espera.

Las reglas predeterminadas de notificación se instalan deshabilitadas. Actívelas y asigne destinos válidos desde Swagger antes de esperar envíos. Los intentos y errores quedan disponibles en el historial, incluso si después elimina una regla de prueba.

Las consultas de SLA y estadísticas aceptan `startDate`, `endDate`, `oltExternalId`, `ponIdentifier`, `customerCode`, `severity`, `status`, `type` y `rootCause` cuando corresponda. Si no indica período, se calcula sobre los últimos 30 días; una fecha de fin futura se limita al instante actual. El dashboard utiliza ese mismo período para sus indicadores de disponibilidad y MTTR, pero sus incidentes activos se calculan en tiempo real.

Para un despliegue de producción, use `NODE_ENV=production`, secretos únicos administrados fuera del repositorio y `CORS_ORIGINS` con los orígenes HTTPS exactos del frontend; no se aceptan comodines. Mantenga `SWAGGER_ENABLED` sin definir o en `false`. Para habilitar Prometheus, defina `METRICS_ENABLED=true` y un `METRICS_BEARER_TOKEN` aleatorio de al menos 32 caracteres; el scraper debe usar `Authorization: Bearer <token>`. Establezca `TRUST_PROXY=true` únicamente si la API está detrás de un proxy inverso que controla la cabecera de origen.

Ejecute `npm run lint`, `npm run build`, `npm test` y `npm run test:e2e` antes de promover una imagen. El último comando necesita los servicios locales PostgreSQL, Redis y RabbitMQ activos.

Los reportes completados se guardan en `REPORT_STORAGE_PATH` y requieren los permisos `report.generate` para generarlos y `report.read` para consultarlos o descargarlos. Puppeteer instala Chromium durante `npm install`; la imagen de producción deberá incluir sus dependencias del sistema en la Fase 10.

## Estado del plan

Las diez fases previstas están implementadas. Las mejoras posteriores pueden abarcar auditoría completa, programación de reportes, alertas de Prometheus y despliegue CI/CD según el entorno final.
