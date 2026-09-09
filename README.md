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

Los módulos de dominio (usuarios, alertas, incidentes, correlación, impacto, reportes, SLA y notificaciones) se incorporarán en las fases siguientes, sin cambiar esta infraestructura.

## Arquitectura de integración

`api_zaSmaOlt` es el único proveedor operativo externo. Este servicio recibirá eventos a través de RabbitMQ y, en la fase de integración, consultará su API HTTP mediante un adapter. No comparte base de datos ni se conecta a SmartOLT/Zabbix.

## Inicio local

1. Copie `.env.example` a `.env` y sustituya los secretos de ejemplo.
2. Instale dependencias: `npm install`.
3. Arranque infraestructura: `docker compose up -d postgres redis rabbitmq`.
4. Genere Prisma y aplique esquema: `npm run prisma:generate` y `npm run prisma:deploy`.
5. Inicie la API: `npm run start:dev`.

Para ejecutar el conjunto completo en contenedores: `docker compose up -d --build`. RabbitMQ Management queda en `http://localhost:15672` (credenciales de desarrollo: `incident_user` / `incident_password`). MailHog se habilita con `docker compose --profile mail up -d`.

## Verificación

Ejecute `npm run build`, `npm test` y `npm run lint`. El endpoint de salud devuelve `healthy` cuando PostgreSQL, Redis, RabbitMQ, el almacenamiento y `api_zaSmaOlt` son accesibles; de otro modo devuelve HTTP 503 con el estado por dependencia.

## Variables de entorno

Revise `.env.example`. La configuración de desarrollo apunta a `omniSentinel_db` en `postgres.db`. En Docker, PostgreSQL conserva ese mismo hostname mediante un alias interno; Redis y RabbitMQ se sustituyen por sus nombres de servicio internos automáticamente. No use la contraseña de desarrollo fuera de un entorno local controlado.

## Próxima fase

Fase 2: módulos `auth` y `users`, JWT con refresh token, roles, permisos y RBAC.
