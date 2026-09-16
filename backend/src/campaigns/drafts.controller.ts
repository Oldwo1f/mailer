import { Body, Controller, Param, Patch } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CampaignsService } from './campaigns.service';

class UpdateDraftDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  html?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsIn(['ready', 'approved', 'skipped'])
  status?: 'ready' | 'approved' | 'skipped';
}

@Controller('drafts')
export class DraftsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDraftDto) {
    return this.campaigns.updateDraft(id, dto);
  }
}
