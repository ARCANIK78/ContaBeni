import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { getTenantContext } from './context.js';
import { isTenantModel } from './tenant-models.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnyRecord = Record<string, any>;

/**
 * Extensión de Prisma que inyecta `companyId` (tenant activo) en cada
 * operación sobre modelos de negocio, de forma transparente para los
 * servicios: no pueden leer ni escribir datos de otra empresa aunque se
 * olviden de filtrar.
 */
function applyTenantExtension(client: PrismaClient) {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: AnyRecord | undefined;
          query: (args?: AnyRecord) => Promise<unknown>;
        }) {
          const { companyId } = getTenantContext();
          if (!companyId || !isTenantModel(model)) {
            return query(args);
          }

          const a: AnyRecord = args ?? {};

          switch (operation) {
            case 'create': {
              const data = a.data as AnyRecord;
              if (data && data.companyId === undefined) data.companyId = companyId;
              break;
            }
            case 'createMany':
            case 'createManyAndReturn': {
              const data = a.data as AnyRecord[] | unknown;
              if (Array.isArray(data)) {
                a.data = data.map((d: AnyRecord) => ({
                  ...(d ?? {}),
                  ...(d?.companyId === undefined ? { companyId } : {}),
                }));
              }
              break;
            }
            case 'findUnique':
            case 'findUniqueOrThrow':
            case 'findFirst':
            case 'findFirstOrThrow':
            case 'findMany':
            case 'count':
            case 'aggregate':
            case 'groupBy':
            case 'update':
            case 'updateMany':
            case 'updateManyAndCount':
            case 'delete':
            case 'deleteMany': {
              a.where = { ...(a.where as AnyRecord | undefined), companyId };
              break;
            }
            case 'upsert': {
              a.where = { ...(a.where as AnyRecord | undefined), companyId };
              const create = a.create as AnyRecord;
              if (create && create.companyId === undefined) {
                create.companyId = companyId;
              }
              break;
            }
            default:
              break;
          }

          return query(a);
        },
      },
    },
  });
}

let baseClient: PrismaClient | undefined;

export function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env().DATABASE_URL });
  baseClient = new PrismaClient({
    adapter,
    log:
      env().NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });
  return applyTenantExtension(baseClient);
}

export type AppPrisma = ReturnType<typeof createPrismaClient>;

export async function disconnectPrisma(): Promise<void> {
  await baseClient?.$disconnect();
}

export const PRISMA = 'PRISMA';

export const prismaProvider = {
  provide: PRISMA,
  useFactory: createPrismaClient,
};
