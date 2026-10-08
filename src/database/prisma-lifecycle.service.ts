import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { disconnectPrisma } from './prisma.provider.js';

@Injectable()
export class PrismaLifecycle implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await disconnectPrisma();
  }
}
