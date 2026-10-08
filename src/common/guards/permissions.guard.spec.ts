import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PermissionsGuard } from './permissions.guard.js';

function createContext(
  required: string[] | undefined,
  permissions: string[] | undefined,
): { guard: PermissionsGuard; context: ExecutionContext } {
  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;

  const request = (
    permissions === undefined ? {} : { membership: { permissions } }
  ) as unknown as Request;

  const guard = new PermissionsGuard(reflector);

  return {
    guard,
    context: {
      getHandler: () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

function check(required: string[] | undefined, permissions: string[] | undefined) {
  const { guard, context } = createContext(required, permissions);
  return () => guard.canActivate(context);
}

describe('PermissionsGuard', () => {
  it('permite rutas sin permisos requeridos', () => {
    expect(check(undefined, [])()).toBe(true);
    expect(check([], [])()).toBe(true);
  });

  it('permite cuando el usuario tiene todos los permisos', () => {
    expect(
      check(
        ['sales.invoice.create', 'sales.invoice.read'],
        ['sales.invoice.create', 'sales.invoice.read', 'dashboard.read'],
      )(),
    ).toBe(true);
  });

  it('rechaza cuando falta un permiso', () => {
    expect(check(['accounting.period.close'], ['sales.invoice.create'])).toThrow(
      ForbiddenException,
    );
  });

  it('el comodín * concede todos los permisos', () => {
    expect(check(['accounting.period.close'], ['*'])()).toBe(true);
  });

  it('rechaza usuarios sin membresía activa', () => {
    expect(check(['company.read'], undefined)).toThrow(ForbiddenException);
  });
});
