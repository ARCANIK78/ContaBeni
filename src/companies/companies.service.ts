import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PRISMA, type AppPrisma } from '../database/prisma.provider.js';
import { withoutTenant } from '../database/context.js';
import { paginated, skip } from '../common/dto/pagination.dto.js';
import type {
  AddMemberDto,
  CreateCompanyDto,
  UpdateCompanyDto,
  UpdateMemberDto,
} from './dto/company.dto.js';

@Injectable()
export class CompaniesService {
  constructor(@Inject(PRISMA) private readonly prisma: AppPrisma) {}

  async listMine(userId: string) {
    const memberships = await withoutTenant(() =>
      this.prisma.membership.findMany({
        where: { userId, isActive: true },
        include: { company: true, role: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return memberships.map((m) => ({
      companyId: m.companyId,
      name: m.company.name,
      nit: m.company.nit,
      baseCurrency: m.company.baseCurrency,
      isActive: m.company.isActive,
      roleCode: m.role.code,
      roleName: m.role.name,
    }));
  }

  async create(userId: string, dto: CreateCompanyDto) {
    const role = await this.prisma.role.findUnique({ where: { code: 'ADMIN' } });
    if (!role) throw new BadRequestException('Roles del sistema no inicializados');

    const company = await this.prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          name: dto.name,
          legalName: dto.legalName ?? dto.name,
          nit: dto.nit,
          baseCurrency: dto.baseCurrency ?? 'BOB',
          address: dto.address,
          city: dto.city,
        },
      });
      await tx.membership.create({
        data: { userId, companyId: created.id, roleId: role.id },
      });
      return created;
    });

    return company;
  }

  async findOne(companyId: string, userId: string) {
    await this.assertMember(companyId, userId);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }

  async update(companyId: string, userId: string, dto: UpdateCompanyDto) {
    await this.assertMember(companyId, userId);
    const { fiscalYearStartMonth, ...data } = dto;
    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...data,
        ...(fiscalYearStartMonth !== undefined
          ? { fiscalYearStartMonth }
          : {}),
      },
    });
  }

  async listMembers(companyId: string, userId: string, page: number, limit: number, search?: string) {
    await this.assertMember(companyId, userId);
    const where = {
      companyId,
      ...(search
        ? {
            user: {
              OR: [
                { email: { contains: search, mode: 'insensitive' as const } },
                { firstName: { contains: search, mode: 'insensitive' as const } },
                { lastName: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.membership.count({ where }),
      this.prisma.membership.findMany({
        where,
        include: { user: true, role: true },
        orderBy: { createdAt: 'asc' },
        skip: skip(page, limit),
        take: limit,
      }),
    ]);

    return paginated(
      rows.map((m) => ({
        membershipId: m.id,
        userId: m.userId,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        isActive: m.isActive,
        userActive: m.user.isActive,
        roleId: m.roleId,
        roleCode: m.role.code,
        roleName: m.role.name,
      })),
      total,
      page,
      limit,
    );
  }

  async addMember(companyId: string, userId: string, dto: AddMemberDto) {
    await this.assertMember(companyId, userId);

    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!role) throw new NotFoundException('Rol inexistente');

    let member = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!member) {
      if (!dto.password || !dto.firstName || !dto.lastName) {
        throw new BadRequestException(
          'Para usuarios nuevos se requieren firstName, lastName y password',
        );
      }
      const passwordHash = await bcrypt.hash(dto.password, 10);
      member = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      });
    }

    const existing = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId: member.id, companyId } },
    });
    if (existing) throw new ConflictException('El usuario ya es miembro');

    const membership = await this.prisma.membership.create({
      data: { userId: member.id, companyId, roleId: role.id },
      include: { user: true, role: true },
    });

    return {
      membershipId: membership.id,
      userId: membership.userId,
      email: membership.user.email,
      roleCode: membership.role.code,
    };
  }

  async updateMember(
    companyId: string,
    membershipId: string,
    actorId: string,
    dto: UpdateMemberDto,
  ) {
    await this.assertMember(companyId, actorId);
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, companyId },
      include: { role: true },
    });
    if (!membership) throw new NotFoundException('Miembro no encontrado');

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
      });
      if (!role) throw new NotFoundException('Rol inexistente');
    }

    await this.assertNotLastAdmin(companyId, membership, dto);

    return this.prisma.membership.update({
      where: { id: membership.id },
      data: {
        ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: { id: true, isActive: true, roleId: true },
    });
  }

  async removeMember(companyId: string, membershipId: string, actorId: string) {
    await this.assertMember(companyId, actorId);
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, companyId },
      include: { role: true },
    });
    if (!membership) throw new NotFoundException('Miembro no encontrado');

    await this.assertNotLastAdmin(companyId, membership, { isActive: false });

    await this.prisma.membership.delete({ where: { id: membership.id } });
    return { success: true };
  }

  private async assertMember(companyId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { companyId, userId, isActive: true },
    });
    if (!membership) {
      throw new ForbiddenException('No pertenece a esta empresa');
    }
    return membership;
  }

  private async assertNotLastAdmin(
    companyId: string,
    membership: { id: string; roleId: string; role: { code: string } },
    dto: { roleId?: string; isActive?: boolean },
  ) {
    if (membership.role.code !== 'ADMIN') return;

    let willStopBeingAdmin = false;
    if (dto.isActive === false) willStopBeingAdmin = true;
    if (dto.roleId !== undefined && dto.roleId !== membership.roleId) {
      const newRole = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
      });
      willStopBeingAdmin = newRole?.code !== 'ADMIN';
    }
    if (!willStopBeingAdmin) return;

    const activeAdmins = await this.prisma.membership.count({
      where: { companyId, isActive: true, role: { code: 'ADMIN' } },
    });
    if (activeAdmins <= 1) {
      throw new ForbiddenException(
        'No se puede quitar o desactivar el único administrador de la empresa',
      );
    }
  }
}
