import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { PRISMA, type AppPrisma } from '../database/prisma.provider.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: AppPrisma) {}

  @Public()
  @Get()
  async check() {
    const [db] = await this.prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    return {
      status: 'ok',
      database: db?.ok === 1 ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }
}
