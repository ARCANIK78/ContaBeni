import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentCompanyId } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import type { AuthUser } from '../common/types/auth.types.js';
import { CompaniesService } from './companies.service.js';
import {
  AddMemberDto,
  CreateCompanyDto,
  UpdateCompanyDto,
  UpdateMemberDto,
} from './dto/company.dto.js';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.companiesService.listMine(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDto) {
    return this.companiesService.create(user.id, dto);
  }

  @Get(':id')
  @Permissions('company.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.companiesService.findOne(id, user.id);
  }

  @Patch(':id')
  @Permissions('company.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(id, user.id, dto);
  }

  @Get(':id/members')
  @Permissions('company.member.read')
  listMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.companiesService.listMembers(
      id,
      user.id,
      query.page,
      query.limit,
      query.search,
    );
  }

  @Post(':id/members')
  @Permissions('company.member.create')
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddMemberDto,
  ) {
    return this.companiesService.addMember(id, user.id, dto);
  }

  @Patch(':id/members/:memberId')
  @Permissions('company.member.update')
  updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.companiesService.updateMember(id, memberId, user.id, dto);
  }

  @Delete(':id/members/:memberId')
  @Permissions('company.member.delete')
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.companiesService.removeMember(id, memberId, user.id);
  }

  @Get(':id/current-company')
  currentCompany(@CurrentCompanyId() companyId?: string) {
    return { companyId: companyId ?? null };
  }
}
