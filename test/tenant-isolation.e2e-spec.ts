import { createPrismaClient } from '../src/database/prisma.provider.js';
import { tenantStorage } from '../src/database/context.js';

/**
 * Verifica que la extensión de Prisma aísla los datos por empresa aunque
 * el servicio olvide filtrar por companyId.
 */
describe('Aislamiento de tenant (Prisma)', () => {
  const db = createPrismaClient();
  const stamp = Date.now();

  const companyA = `tenant-a-${stamp}`;
  const companyB = `tenant-b-${stamp}`;

  afterAll(async () => {
    await db.auditLog.deleteMany({
      where: { entity: 'TenantIsolationTest' },
    });
    await db.company.deleteMany({
      where: { name: { in: [companyA, companyB] } },
    });
    await db.$disconnect();
  });

  it('crea registros con el companyId del contexto automáticamente', async () => {
    const a = await db.company.create({ data: { name: companyA } });
    const b = await db.company.create({ data: { name: companyB } });

    await tenantStorage.run({ companyId: a.id }, async () => {
      await db.auditLog.create({
        data: { action: 'test', entity: 'TenantIsolationTest' },
      });
      const logs = await db.auditLog.findMany({
        where: { entity: 'TenantIsolationTest' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].companyId).toBe(a.id);
    });

    await tenantStorage.run({ companyId: b.id }, async () => {
      await db.auditLog.create({
        data: { action: 'test', entity: 'TenantIsolationTest' },
      });
      const logs = await db.auditLog.findMany({
        where: { entity: 'TenantIsolationTest' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].companyId).toBe(b.id);
    });

    // Sin contexto no se inyecta companyId: se ven todos.
    const all = await db.auditLog.findMany({
      where: { entity: 'TenantIsolationTest' },
    });
    expect(all).toHaveLength(2);
  });

  it('el companyId del contexto prevalece sobre un where manipulado', async () => {
    const a = await db.company.findFirst({ where: { name: companyA } });
    const b = await db.company.findFirst({ where: { name: companyB } });
    if (!a || !b) throw new Error('empresas de prueba no creadas');

    await tenantStorage.run({ companyId: a.id }, async () => {
      // Intento deliberado de leer datos de la empresa B: el contexto
      // debe prevalecer y devolver solo registros de A.
      const logs = await db.auditLog.findMany({
        where: { entity: 'TenantIsolationTest', companyId: b.id },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].companyId).toBe(a.id);
    });
  });

  it('deleteMany solo afecta registros de la empresa activa', async () => {
    const a = await db.company.findFirst({ where: { name: companyA } });
    const b = await db.company.findFirst({ where: { name: companyB } });
    if (!a || !b) throw new Error('empresas de prueba no creadas');

    await tenantStorage.run({ companyId: a.id }, async () => {
      const result = await db.auditLog.deleteMany({
        where: { entity: 'TenantIsolationTest' },
      });
      expect(result.count).toBe(1);
    });

    const remaining = await db.auditLog.findMany({
      where: { entity: 'TenantIsolationTest' },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].companyId).toBe(b.id);
  });
});
