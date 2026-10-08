import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS = 'permissions';

/** Requiere todos los códigos de permiso indicados. */
export const Permissions = (...codes: string[]) =>
  SetMetadata(PERMISSIONS, codes);
