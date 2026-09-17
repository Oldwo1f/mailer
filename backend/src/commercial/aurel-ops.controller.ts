import { Body, Controller, Get, Put } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsUrl,
  Min,
} from 'class-validator';
import { AurelOpsService } from './aurel-ops.service';

class UpdateAurelOpsDto {
  @IsOptional()
  @IsUrl({ require_protocol: true })
  bookingUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPerSearchXpf?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPerEmailXpf?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPerAiGenerationXpf?: number;

  @IsOptional()
  @IsBoolean()
  hotPipelineFollowUpsEnabled?: boolean;
}

@Controller('aurel/ops')
export class AurelOpsController {
  constructor(private readonly ops: AurelOpsService) {}

  @Get()
  snapshot() {
    return this.ops.snapshot();
  }

  @Put()
  update(@Body() dto: UpdateAurelOpsDto) {
    return this.ops.update(dto);
  }
}
