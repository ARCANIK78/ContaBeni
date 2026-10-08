import { Inject, Injectable } from '@nestjs/common';
import { PRISMA, type AppPrisma } from '../database/prisma.provider.js';

@Injectable()
export class RolesService {
  constructor(@Inject(PRISMA) private readonly prisma: AppPrisma) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: { code: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      membersCount: r._count.memberships,
      permissions: r.rolePermissions.map((rp) => rp.permission.code),
    }));
  }

  async permissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
    return permissions;
  }
}
