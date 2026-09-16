import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ListsService } from './lists.service';
import { EnrichmentService } from '../prospects/prospects.service';

class CreateListDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  slug?: string;
}

class UpdateListDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

@Controller('lists')
export class ListsController {
  constructor(
    private readonly lists: ListsService,
    private readonly enrichment: EnrichmentService,
  ) {}

  @Get()
  list() {
    return this.lists.findAll();
  }

  @Post('install-defaults')
  installDefaults() {
    return this.lists.installDefaults();
  }

  @Post('dedupe')
  dedupeAll() {
    return this.lists.dedupe();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.lists.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateListDto) {
    return this.lists.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateListDto) {
    return this.lists.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.lists.remove(id);
  }

  @Post(':id/import')
  importJson(@Param('id') id: string, @Body() body: unknown) {
    return this.lists.importRecords(id, body);
  }

  @Post(':id/dedupe')
  dedupeList(@Param('id') id: string) {
    return this.lists.dedupe(id);
  }

  @Post(':id/enrich')
  async enrichList(@Param('id') id: string) {
    const list = await this.lists.findOne(id);
    const ids = (list.prospects || [])
      .filter((p) => !p.unsubscribedAt)
      .map((p) => p.id);
    return this.enrichment.enrichMany(ids);
  }
}
