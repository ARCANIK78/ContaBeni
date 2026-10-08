import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import type { Request } from 'express';
import { IS_PUBLIC } from '../decorators/public.decorator.js';
import { tenantStorage } from '../../database/context.js';
import { PRISMA, type AppPrisma } from '../../database/prisma.provider.js';
import type {
  AccessTokenPayload,
  AuthMembership,
  AuthUser,
} from '../types/auth.types.js';

function extractToken(req: Request): string | undefined {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme === 'Bearer' && token) return token;
  const cookies = (req as Request & { cookies?: Record<string, string> })
    .cookies;
  return cookies?.['access_token'];
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Inject(PRISMA) private readonly prisma: AppPrisma,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractToken(request);
    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Se requiere token de acceso');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true },
    });
    if (!user) {
      if (isPublic) return true;
      throw new UnauthorizedException('Usuario inexistente o inactivo');
    }

    const store = tenantStorage.getStore();
    const requestedCompanyId =
      (request.headers['x-company-id'] as string | undefined) ?? payload.cid;

    let membership: AuthMembership | undefined;
    if (requestedCompanyId) {
      const found = await this.prisma.membership.findFirst({
        where: {
          companyId: requestedCompanyId,
          userId: user.id,
          isActive: true,
        },
        include: {
          role: {
            include: { rolePermissions: { include: { permission: true } } },
          },
        },
      });
      if (!found && !isPublic) {
        throw new ForbiddenException(
          'El usuario no pertenece a la empresa solicitada',
        );
      }
      if (found) {
        membership = {
          id: found.id,
          companyId: found.companyId,
          roleId: found.roleId,
          roleCode: found.role.code,
          permissions: found.role.rolePermissions.map(
            (rp) => rp.permission.code,
          ),
        };
      }
    }

    if (store) {
      store.userId = user.id;
      if (membership) store.companyId = membership.companyId;
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyId: membership?.companyId,
    };
    request.user = authUser;
    request.membership = membership;

    return true;
  }
}
