import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  controllers: [CompaniesController, RolesController],
  providers: [CompaniesService, RolesService],
  exports: [CompaniesService, RolesService],
})
export class CompaniesModule {}
