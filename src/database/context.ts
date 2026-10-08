import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  userId?: string;
  companyId?: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext {
  return tenantStorage.getStore() ?? {};
}

export function getCompanyId(): string | undefined {
  return getTenantContext().companyId;
}

export function requireCompanyId(): string {
  const companyId = getTenantContext().companyId;
  if (!companyId) {
    throw new Error('Se requiere una empresa activa (companyId) en el contexto');
  }
  return companyId;
}

/**
 * Ejecuta `fn` sin tenant activo: Prisma no inyectará companyId.
 * Úsalo conscientemente para consultas legítimas entre empresas
 * (p. ej. listar las empresas de un usuario) que ya están acotadas
 * por otros campos (userId).
 */
export function withoutTenant<T>(fn: () => Promise<T> | T): Promise<T> {
  return tenantStorage.run({}, async () => (await fn()) as T);
}
