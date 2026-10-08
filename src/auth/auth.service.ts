import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { PRISMA, type AppPrisma } from '../database/prisma.provider.js';
import { withoutTenant } from '../database/context.js';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from '../common/types/auth.types.js';
import type { LoginDto, RegisterDto } from './dto/auth.dto.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  company?: { id: string; name: string; nit: string | null };
  memberships: Array<{
    companyId: string;
    companyName: string;
    roleId: string;
    roleCode: string;
  }>;
  permissions: string[];
  tokens: TokenPair;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: AppPrisma,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSession> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('El correo ya está registrado');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const adminRole = await this.prisma.role.findUnique({
      where: { code: 'ADMIN' },
    });
    if (!adminRole) {
      throw new ForbiddenException('Roles del sistema no inicializados');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      });
      const company = await tx.company.create({
        data: {
          name: dto.companyName,
          legalName: dto.companyName,
          nit: dto.nit,
        },
      });
      await tx.membership.create({
        data: {
          userId: user.id,
          companyId: company.id,
          roleId: adminRole.id,
        },
      });
      return { user, company };
    });

    return this.buildSession(result.user, result.company.id);
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    const memberships = await withoutTenant(() =>
      this.prisma.membership.findMany({
        where: { userId: user.id, isActive: true },
        include: { company: true, role: true },
        orderBy: { createdAt: 'asc' },
      }),
    );

    let companyId = dto.companyId;
    if (!companyId && memberships.length > 0) {
      companyId = memberships[0].companyId;
    }
    if (companyId && !memberships.some((m) => m.companyId === companyId)) {
      throw new ForbiddenException('No pertenece a esa empresa');
    }

    return this.buildSession(user, companyId, memberships);
  }

  async refresh(refreshToken: string | undefined): Promise<AuthSession> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token requerido');
    }

    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret: env().JWT_REFRESH_SECRET },
      );
      if (payload.typ !== 'refresh') throw new Error('typ');
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token revocado o expirado');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true },
    });
    if (!user) throw new UnauthorizedException('Usuario inexistente');

    // Rotación: se revoca el token actual y se emite uno nuevo.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const membership = await withoutTenant(() =>
      this.prisma.membership.findFirst({
        where: { userId: user.id, isActive: true },
        orderBy: { createdAt: 'asc' },
        include: { role: true },
      }),
    );

    return this.buildSession(user, membership?.companyId, undefined);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // idempotente: logout nunca debe fallar
    }
  }

  async me(userId: string, companyId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });
    if (!user) throw new UnauthorizedException('Usuario inexistente');

    const memberships = await withoutTenant(() =>
      this.prisma.membership.findMany({
        where: { userId },
        include: { company: true, role: true },
        orderBy: { createdAt: 'asc' },
      }),
    );

    const current = companyId
      ? memberships.find((m) => m.companyId === companyId)
      : undefined;

    return {
      user,
      company: current?.company ?? null,
      role: current?.role ?? null,
      permissions: current
        ? await this.permissionsForRole(current.roleId)
        : [],
      memberships: memberships.map((m) => ({
        companyId: m.companyId,
        companyName: m.company.name,
        roleCode: m.role.code,
        roleName: m.role.name,
        isActive: m.isActive,
      })),
    };
  }

  private async permissionsForRole(roleId: string): Promise<string[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rows.map((r) => r.permission.code);
  }

  private async buildSession(
    user: { id: string; email: string; firstName: string; lastName: string },
    companyId?: string,
    preloaded?:
      | Array<{
          companyId: string;
          company: { name: string; nit: string | null };
          roleId: string;
          role: { code: string };
        }>
      | null,
  ): Promise<AuthSession> {
    const memberships =
      preloaded ??
      (await withoutTenant(() =>
        this.prisma.membership.findMany({
          where: { userId: user.id, isActive: true },
          include: { company: true, role: true },
        }),
      ));

    const tokens = await this.issueTokens(user.id, user.email, companyId);

    let permissions: string[] = [];
    const current = companyId
      ? memberships.find((m) => m.companyId === companyId)
      : undefined;
    if (current) permissions = await this.permissionsForRole(current.roleId);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      company: current
        ? { id: current.companyId, name: current.company.name, nit: current.company.nit }
        : undefined,
      memberships: memberships.map((m) => ({
        companyId: m.companyId,
        companyName: m.company.name,
        roleId: m.roleId,
        roleCode: m.role.code,
      })),
      permissions,
      tokens,
    };
  }

  private async issueTokens(
    userId: string,
    email: string,
    companyId?: string,
  ): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: userId,
        email,
        cid: companyId,
        typ: 'access',
      } satisfies AccessTokenPayload,
      {
        secret: env().JWT_SECRET,
        expiresIn: env().JWT_EXPIRES_IN as JwtSignOptions['expiresIn'],
      },
    );

    const jti = randomUUID();
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, jti, typ: 'refresh' } satisfies RefreshTokenPayload,
      {
        secret: env().JWT_REFRESH_SECRET,
        expiresIn: env().JWT_REFRESH_EXPIRES_IN as JwtSignOptions['expiresIn'],
      },
    );

    const maxAge = this.parseDuration(env().JWT_REFRESH_EXPIRES_IN);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + maxAge),
      },
    });

    return { accessToken, refreshToken };
  }

  private parseDuration(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const n = Number(match[1]);
    const unit = match[2];
    const factor =
      unit === 's'
        ? 1000
        : unit === 'm'
          ? 60_000
          : unit === 'h'
            ? 3_600_000
            : 86_400_000;
    return n * factor;
  }
}
