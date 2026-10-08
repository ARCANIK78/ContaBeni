import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PERMISSIONS: Array<{
  code: string;
  module: string;
  description: string;
}> = [
  // Empresa y acceso
  { code: 'company.read', module: 'company', description: 'Ver datos de la empresa' },
  { code: 'company.update', module: 'company', description: 'Editar la empresa' },
  { code: 'company.member.read', module: 'company', description: 'Ver miembros' },
  { code: 'company.member.create', module: 'company', description: 'Agregar miembros' },
  { code: 'company.member.update', module: 'company', description: 'Editar miembros' },
  { code: 'company.member.delete', module: 'company', description: 'Quitar miembros' },
  { code: 'user.read', module: 'user', description: 'Ver usuarios' },
  { code: 'user.create', module: 'user', description: 'Crear usuarios' },
  { code: 'user.update', module: 'user', description: 'Editar usuarios' },
  { code: 'role.read', module: 'role', description: 'Ver roles y permisos' },
  // Dashboard
  { code: 'dashboard.read', module: 'dashboard', description: 'Ver tablero' },
  // Productos
  { code: 'products.read', module: 'products', description: 'Ver catálogo' },
  { code: 'products.create', module: 'products', description: 'Crear productos' },
  { code: 'products.update', module: 'products', description: 'Editar productos' },
  { code: 'products.delete', module: 'products', description: 'Eliminar productos' },
  { code: 'products.stock.manage', module: 'products', description: 'Movimientos de stock' },
  // Ventas
  { code: 'sales.customer.read', module: 'sales', description: 'Ver clientes' },
  { code: 'sales.customer.create', module: 'sales', description: 'Crear clientes' },
  { code: 'sales.customer.update', module: 'sales', description: 'Editar clientes' },
  { code: 'sales.quote.create', module: 'sales', description: 'Crear cotizaciones' },
  { code: 'sales.quote.update', module: 'sales', description: 'Editar cotizaciones' },
  { code: 'sales.quote.read', module: 'sales', description: 'Ver cotizaciones' },
  { code: 'sales.note.create', module: 'sales', description: 'Crear notas de venta' },
  { code: 'sales.note.read', module: 'sales', description: 'Ver notas de venta' },
  { code: 'sales.invoice.create', module: 'sales', description: 'Emitir facturas' },
  { code: 'sales.invoice.read', module: 'sales', description: 'Ver facturas' },
  { code: 'sales.invoice.void', module: 'sales', description: 'Anular facturas' },
  { code: 'sales.payment.create', module: 'sales', description: 'Registrar cobros' },
  // Compras
  { code: 'purchases.supplier.read', module: 'purchases', description: 'Ver proveedores' },
  { code: 'purchases.supplier.create', module: 'purchases', description: 'Crear proveedores' },
  { code: 'purchases.supplier.update', module: 'purchases', description: 'Editar proveedores' },
  { code: 'purchases.order.create', module: 'purchases', description: 'Crear órdenes de compra' },
  { code: 'purchases.order.read', module: 'purchases', description: 'Ver órdenes de compra' },
  { code: 'purchases.invoice.create', module: 'purchases', description: 'Registrar facturas de gasto' },
  { code: 'purchases.invoice.read', module: 'purchases', description: 'Ver facturas de gasto' },
  { code: 'purchases.withholding.manage', module: 'purchases', description: 'Gestionar retenciones' },
  // Cajas y bancos
  { code: 'cash.account.read', module: 'cash', description: 'Ver cuentas y cajas' },
  { code: 'cash.account.manage', module: 'cash', description: 'Administrar cuentas y cajas' },
  { code: 'cash.transaction.create', module: 'cash', description: 'Registrar transacciones' },
  { code: 'cash.reconcile', module: 'cash', description: 'Conciliar movimientos' },
  // Contabilidad
  { code: 'accounting.account.read', module: 'accounting', description: 'Ver plan de cuentas' },
  { code: 'accounting.account.manage', module: 'accounting', description: 'Administrar plan de cuentas' },
  { code: 'accounting.entry.create', module: 'accounting', description: 'Crear asientos' },
  { code: 'accounting.entry.post', module: 'accounting', description: 'Contabilizar asientos' },
  { code: 'accounting.period.close', module: 'accounting', description: 'Cerrar períodos' },
  { code: 'accounting.reports', module: 'accounting', description: 'Estados financieros' },
  // Multi-moneda
  { code: 'exchange.rate.read', module: 'exchange', description: 'Ver tipos de cambio' },
  { code: 'exchange.rate.manage', module: 'exchange', description: 'Administrar tipos de cambio' },
  // Auditoría
  { code: 'audit.read', module: 'audit', description: 'Ver bitácora' },
];

const ALL = PERMISSIONS.map((p) => p.code);

const ROLES: Array<{
  code: string;
  name: string;
  description: string;
  permissions: string[];
}> = [
  {
    code: 'ADMIN',
    name: 'Administrador',
    description: 'Acceso total a la empresa',
    permissions: ALL,
  },
  {
    code: 'CONTADOR',
    name: 'Contador',
    description: 'Contabilidad, reportes y acceso de lectura a operaciones',
    permissions: [
      'company.read',
      'company.member.read',
      'user.read',
      'role.read',
      'dashboard.read',
      'products.read',
      'sales.customer.read',
      'sales.quote.read',
      'sales.note.read',
      'sales.invoice.read',
      'purchases.supplier.read',
      'purchases.order.read',
      'purchases.invoice.read',
      'purchases.withholding.manage',
      'cash.account.read',
      'cash.reconcile',
      'accounting.account.read',
      'accounting.account.manage',
      'accounting.entry.create',
      'accounting.entry.post',
      'accounting.period.close',
      'accounting.reports',
      'exchange.rate.read',
      'exchange.rate.manage',
      'audit.read',
    ],
  },
  {
    code: 'VENDEDOR',
    name: 'Vendedor',
    description: 'Clientes, cotizaciones, notas y facturación',
    permissions: [
      'company.read',
      'company.member.read',
      'dashboard.read',
      'products.read',
      'sales.customer.read',
      'sales.customer.create',
      'sales.customer.update',
      'sales.quote.create',
      'sales.quote.update',
      'sales.quote.read',
      'sales.note.create',
      'sales.note.read',
      'sales.invoice.create',
      'sales.invoice.read',
      'sales.payment.create',
    ],
  },
  {
    code: 'CAJERO',
    name: 'Cajero',
    description: 'Caja chica, cobros y consulta de productos',
    permissions: [
      'company.read',
      'company.member.read',
      'dashboard.read',
      'products.read',
      'sales.invoice.read',
      'sales.payment.create',
      'cash.account.read',
      'cash.transaction.create',
    ],
  },
];

const CURRENCIES = [
  { code: 'BOB', name: 'Boliviano', symbol: 'Bs', decimals: 2 },
  { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$', decimals: 2 },
];

async function main() {
  console.log('→ Monedas');
  for (const c of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: c,
      create: c,
    });
  }

  console.log('→ Permisos');
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, description: p.description },
      create: p,
    });
  }

  console.log('→ Roles');
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: { code: r.code, name: r.name, description: r.description },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const permissions = await prisma.permission.findMany({
      where: { code: { in: r.permissions } },
      select: { id: true },
    });
    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({
          roleId: role.id,
          permissionId: p.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  console.log('→ Datos demo');
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@contabeni.bo';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';

  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        firstName: 'Admin',
        lastName: 'ContaBeni',
      },
    });
    console.log(`  usuario ${email} creado`);
  }

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'ADMIN' },
  });

  let company = await prisma.company.findFirst({
    where: { name: 'Beni Demo SRL' },
  });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Beni Demo SRL',
        legalName: 'Beni Demo Sociedad de Responsabilidad Limitada',
        nit: '1234567029',
        city: 'Trinidad',
        address: 'Av. Ballivián 123',
        baseCurrency: 'BOB',
      },
    });
    console.log(`  empresa "${company.name}" creada`);
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_companyId: { userId: admin.id, companyId: company.id },
    },
  });
  if (!membership) {
    await prisma.membership.create({
      data: {
        userId: admin.id,
        companyId: company.id,
        roleId: adminRole.id,
      },
    });
    console.log('  membresía admin creada');
  }

  console.log('✓ Seed completado');
  console.log(`  login: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
