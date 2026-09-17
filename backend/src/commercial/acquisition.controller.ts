import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AurelAcquisitionService } from './aurel-acquisition.service';

class UpdateAcquisitionPolicyDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(6)
  @Max(72)
  minHoursBetweenRuns?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  maxRuns24h?: number;

  @IsOptional()
  @IsBoolean()
  autoAcceptHighConfidence?: boolean;
}

class RunAcquisitionDto {
  @IsOptional()
  @IsString()
  missionKey?: string;
}

@Controller('commercial/acquisition')
export class AcquisitionController {
  constructor(private readonly acquisition: AurelAcquisitionService) {}

  @Get()
  snapshot() {
    return this.acquisition.snapshot();
  }

  @Patch('policy')
  updatePolicy(@Body() dto: UpdateAcquisitionPolicyDto) {
    return this.acquisition.updatePolicy(dto);
  }

  @Post('run')
  run(@Body() dto: RunAcquisitionDto) {
    return this.acquisition.runNow(dto.missionKey || null);
  }
}
