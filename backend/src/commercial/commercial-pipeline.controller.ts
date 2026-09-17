import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import type { LeadStatus } from '../entities/prospect.entity';
import { CommercialPipelineService } from './commercial-pipeline.service';
import { LEAD_STATUSES } from './commercial.rules';

class UpdateCommercialDto {
  @IsOptional()
  @IsIn(LEAD_STATUSES)
  leadStatus?: LeadStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  dealValueXpf?: number | null;

  @IsOptional()
  @IsString()
  lostReason?: string | null;
}

@Controller('commercial')
export class CommercialPipelineController {
  constructor(private readonly pipeline: CommercialPipelineService) {}

  @Get('pipeline')
  list() {
    return this.pipeline.list();
  }

  @Get('summary')
  summary() {
    return this.pipeline.summary();
  }

  @Get('analytics/products')
  productAnalytics() {
    return this.pipeline.productAnalytics();
  }

  @Get('radar')
  radar() {
    return this.pipeline.radar();
  }

  @Patch('prospects/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCommercialDto) {
    return this.pipeline.updateProspect(id, dto);
  }
}
