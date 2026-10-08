/**
 * Modelos con aislamiento por tenant (companyId).
 *
 * IMPORTANTE: todo modelo de negocio nuevo (ventas, compras, productos,
 * caja, contabilidad, ...) debe agregarse aquí. Prisma inyectará
 * automáticamente `companyId` en las operaciones cuando exista empresa
 * en el contexto de la petición.
 *
 * Modelos globales que NO se listan: Company, User, Role, Permission,
 * RolePermission, RefreshToken, Currency.
 */
export const TENANT_MODELS = new Set<string>([
  'Membership',
  'AuditLog',
  'DocumentSequence',
  'ExchangeRate',
]);

export function isTenantModel(model: string): boolean {
  return TENANT_MODELS.has(model);
}
