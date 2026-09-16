import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignsService } from './campaigns.service';

class StepDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  brief: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  delayDays?: number;
}

class PrepareCampaignDto {
  @IsString()
  goal: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  productUrl?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  emailType?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(5)
  stepCount?: number;
}

class CreateCampaignDto {
  @IsString()
  name: string;

  @IsString()
  brief: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  emailType?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsUUID()
  senderId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  prospectIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  listIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  steps?: StepDto[];
}

class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  brief?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  emailType?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsUUID()
  senderId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  prospectIds?: string[] | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  listIds?: string[] | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  steps?: StepDto[];
}

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Post('prepare')
  prepare(@Body() dto: PrepareCampaignDto) {
    return this.campaigns.prepare(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.campaigns.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.campaigns.remove(id);
  }

  @Post(':id/generate')
  generate(@Param('id') id: string) {
    return this.campaigns.generate(id);
  }

  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.campaigns.send(id);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.campaigns.stats(id);
  }
}
