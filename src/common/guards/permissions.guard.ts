import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS } from '../decorators/permissions.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const permissions = new Set(request.membership?.permissions ?? []);

    const granted = required.every(
      (code) => permissions.has(code) || permissions.has('*'),
    );
    if (!granted) {
      throw new ForbiddenException(
        `Permisos requeridos: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
