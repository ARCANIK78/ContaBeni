import { Global, Module } from '@nestjs/common';
import { prismaProvider, PRISMA, type AppPrisma } from './prisma.provider.js';
import { PrismaLifecycle } from './prisma-lifecycle.service.js';

@Global()
@Module({
  providers: [prismaProvider, PrismaLifecycle],
  exports: [PRISMA],
})
export class DatabaseModule {}

export { PRISMA };
export type { AppPrisma };
