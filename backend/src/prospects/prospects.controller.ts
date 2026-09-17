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
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { EnrichmentService, ProspectsService } from './prospects.service';
import { ProductMatcherService } from '../product-matcher/product-matcher.service';
import type { ProductReviewState } from '../product-matcher/product-matcher.types';

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

class MatchManyDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

class ReviewProductDto {
  @IsIn(['unreviewed', 'accepted', 'overridden', 'rejected'])
  reviewState: ProductReviewState;

  @IsOptional()
  @IsString()
  productId?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

@Controller('prospects')
export class ProspectsController {
  constructor(
    private readonly prospects: ProspectsService,
    private readonly enrichment: EnrichmentService,
    private readonly matcher: ProductMatcherService,
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

  @Get('product-catalog')
  productCatalog() {
    return this.matcher.catalog();
  }

  @Post('enrich')
  enrichMany(@Body() dto: EnrichManyDto) {
    return this.enrichment.enrichMany(dto.ids);
  }

  @Post('match-products')
  matchMany(@Body() dto: MatchManyDto) {
    return this.matcher.matchMany(dto.ids);
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

  @Post(':id/match-product')
  matchProduct(@Param('id') id: string) {
    return this.matcher.matchOne(id);
  }

  @Patch(':id/product-recommendation')
  reviewProduct(@Param('id') id: string, @Body() dto: ReviewProductDto) {
    return this.matcher.review(id, dto);
  }
}
