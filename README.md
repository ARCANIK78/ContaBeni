# ContaBeni API

Backend del ERP contable **ContaBeni** (Bolivia): ventas, compras, productos, cajas y bancos, y contabilidad.

Stack:

- **NestJS 12** (TypeScript, ESM) + REST + Swagger
- **PostgreSQL 16** + **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **JWT access + refresh** (rotación) y **RBAC** por permisos
- **Multi-empresa** (aislamiento por `companyId` automático a nivel de consultas Prisma)
- **Multi-moneda** (BOB/USD con tipo de cambio)

## Arranque rápido

```bash
# 1. Base de datos (Postgres 16)
docker compose up -d db

# 2. Variables de entorno
cp .env.example .env
#  -> genera claves seguras para JWT_SECRET y JWT_REFRESH_SECRET (mín. 32 caracteres)

# 3. Instalar y preparar la base
npm install
npm run db:setup        # aplica migraciones + seed (roles, permisos, monedas, datos demo)

# 4. Levantar el servidor
npm run start:dev
```

- API: http://localhost:3000/api/v1
- Documentación Swagger: http://localhost:3000/docs
- Usuario demo (seed): `admin@contabeni.bo` / `Admin123!`

## Scripts

| Comando               | Descripción                                  |
| --------------------- | -------------------------------------------- |
| `npm run start:dev`   | Desarrollo con watch                         |
| `npm run build`       | Genera cliente Prisma y compila a `dist/`    |
| `npm run typecheck`   | `tsc --noEmit`                               |
| `npm run lint`        | oxlint                                       |
| `npm test`            | Tests unitarios (vitest)                     |
| `npm run test:e2e`    | Prepara DB de prueba + migra + seed + e2e    |
| `npm run db:migrate`  | `prisma migrate dev`                         |
| `npm run db:deploy`   | `prisma migrate deploy`                      |
| `npm run db:seed`     | Seed (roles/permisos/monedas/demo)           |
| `npm run db:reset`    | Restablece la base (borra datos)             |

## Arquitectura

Módulos NestJS con capa `controller → service → Prisma` (`database/` provee el cliente). El aislamiento de empresa se hace en **una extensión global de Prisma**: cuando la petición tiene una empresa activa (JWT `cid` o header `x-company-id`), `companyId` se inyecta automáticamente en `where`/`create` de los modelos de negocio. Un testeo en contra (`test/tenant-isolation.e2e-spec.ts`) garantiza que no se filtren datos entre empresas.

### Módulos

```
src/
├── auth/          # registro, login, refresh (rotación), me
├── companies/     # empresas (tenants), membresías, roles y permisos
├── database/      # contexto de tenant, extensión Prisma, proveedor
├── common/        # guards (JWT, permisos, throttling), filtro de errores, paginación
├── config/        # validación de entorno (zod)
├── health/        # healthcheck
└── generated/     # cliente Prisma generado (no se versiona)
```

### Contexto de petición

1. `TenantContextMiddleware` abre un `AsyncLocalStorage` con la empresa del header `x-company-id`.
2. `JwtAuthGuard` verifica el token, carga el usuario y valida la membresía de la empresa seleccionada, completando `userId`/`companyId` y los permisos.
3. `PermissionsGuard` exige los permisos de cada endpoint (`@Permissions('accounting.period.close')`).
4. La extensión Prisma aplica `companyId` automáticamente en todo acceso a modelos listados en `src/database/tenant-models.ts`.

Para consultas legítimas entre empresas (ej. "mis empresas") se usa `withoutTenant(...)` de `src/database/context.ts`.

## Autenticación

- `POST /api/v1/auth/register` crea usuario + primera empresa + rol ADMIN.
- `POST /api/v1/auth/login` (email + contraseña; `companyId` opcional).
- `POST /api/v1/auth/refresh` rota el refresh token (vía cookie `refresh_token` o body). Los refresh tokens revocados/rotados quedan invalidados.
- `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.

## Roles y permisos (seed)

`ADMIN` (todo), `CONTADOR`, `VENDEDOR`, `CAJERO`. Códigos tipo `sales.invoice.create`, `accounting.period.close`, `cash.reconcile`, etc. Se siembran con `npm run db:seed`.

## Roadmap (por fases)

- ✅ Fase 0 — Base: scaffold, auth + RBAC, multi-empresa, Swagger, CI
- ⏳ Fase 1 — Productos y stock · Ventas (clientes, cotizaciones → nota → factura, PDF, adaptador SIN mock) + contabilidad en paralelo
- ⏳ Fase 2 — Compras y gastos (proveedores, OC, retenciones)
- ⏳ Fase 3 — Cajas y bancos (conciliación)
- ⏳ Fase 4 — Contabilidad (plan de cuentas, diario, asientos automáticos, estados financieros)
- ⏳ Fase 5 — Dashboard, reportes y facturación electrónica SIN real

## Entorno (`.env`)

| Variable                 | Descripción                                    |
| ------------------------ | ---------------------------------------------- |
| `DATABASE_URL`           | Cadena de conexión Postgres                    |
| `JWT_SECRET`             | Firma de access tokens (mín. 32 chars)         |
| `JWT_REFRESH_SECRET`     | Firma de refresh tokens (mín. 32 chars)        |
| `JWT_EXPIRES_IN`         | Ej. `15m`                                      |
| `JWT_REFRESH_EXPIRES_IN` | Ej. `7d`                                       |
| `CORS_ORIGINS`           | Orígenes permitidos separados por coma         |
| `LOG_LEVEL`              | `error`/`warn`/`log`/`debug`/`verbose`         |