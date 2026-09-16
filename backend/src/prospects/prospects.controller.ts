import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { EnrichmentService, ProspectsService } from './prospects.service';

class CreateProspectDto {
  @IsString()
  company: string;

  @IsArray()
  @IsString({ each: true })
  emails: string[];

  @IsOptional()
  @IsBoolean()
  starred?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  contactName?: string;
}

class UpdateProspectDto {
  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emails?: string[];

  @IsOptional()
  @IsBoolean()
  starred?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  contactName?: string | null;
}

class EnrichManyDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

@Controller('prospects')
export class ProspectsController {
  constructor(
    private readonly prospects: ProspectsService,
    private readonly enrichment: EnrichmentService,
  ) {}

  @Get()
  list(
    @Query('starred') starred?: string,
    @Query('unsubscribed') unsubscribed?: string,
    @Query('listId') listId?: string,
  ) {
    return this.prospects.findAll({
      starred: starred === 'true' ? true : undefined,
      unsubscribed:
        unsubscribed === 'true'
          ? true
          : unsubscribed === 'false'
            ? false
            : undefined,
      listId: listId || undefined,
    });
  }

  @Post('enrich')
  enrichMany(@Body() dto: EnrichManyDto) {
    return this.enrichment.enrichMany(dto.ids);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prospects.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProspectDto) {
    return this.prospects.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProspectDto) {
    return this.prospects.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prospects.remove(id);
  }

  @Post(':id/enrich')
  enrichOne(@Param('id') id: string) {
    return this.enrichment.enrichOne(id);
  }
}
