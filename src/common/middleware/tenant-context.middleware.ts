import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { tenantStorage, type TenantContext } from '../../database/context.js';

/**
 * Abre el contexto de tenant (AsyncLocalStorage) antes de que llegue a la
 * petición a guards/controladores. El JwtAuthGuard completa userId y
 * companyId sobre el mismo objeto.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const headerCompanyId = req.headers['x-company-id'];
    const store: TenantContext = {
      companyId:
        typeof headerCompanyId === 'string' ? headerCompanyId : undefined,
    };
    tenantStorage.run(store, next);
  }
}
