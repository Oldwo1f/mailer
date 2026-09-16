import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { MAIL_PROVIDERS, SettingsService } from './settings.service';
import { QuotaService } from '../quota/quota.service';

class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  publicUrl?: string;

  @IsOptional()
  @IsString()
  mailserverUrl?: string;

  @IsOptional()
  @IsNumber()
  sendDelayMs?: number;

  @IsOptional()
  @IsString()
  openaiModel?: string;

  @IsOptional()
  @IsIn(['auto', ...MAIL_PROVIDERS])
  mailProvider?: string;

  @IsOptional()
  @IsString()
  smtpHost?: string | null;

  @IsOptional()
  @IsNumber()
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  mailFrom?: string | null;

  @IsOptional()
  @IsString()
  mailFromName?: string | null;

  @IsOptional()
  @IsString()
  mailgunDomain?: string | null;

  @IsOptional()
  @IsString()
  openaiApiKey?: string | null;

  @IsOptional()
  @IsString()
  tavilyApiKey?: string | null;

  @IsOptional()
  @IsString()
  youApiKey?: string | null;

  @IsOptional()
  @IsString()
  nimbleApiKey?: string | null;

  @IsOptional()
  @IsString()
  firecrawlApiKey?: string | null;

  @IsOptional()
  @IsString()
  serpapiApiKey?: string | null;

  @IsOptional()
  @IsString()
  exaApiKey?: string | null;

  @IsOptional()
  @IsString()
  mailserverApiKey?: string | null;

  @IsOptional()
  @IsString()
  resendApiKey?: string | null;

  @IsOptional()
  @IsString()
  brevoApiKey?: string | null;

  @IsOptional()
  @IsString()
  sendgridApiKey?: string | null;

  @IsOptional()
  @IsString()
  mailjetApiKey?: string | null;

  @IsOptional()
  @IsString()
  mailjetSecretKey?: string | null;

  @IsOptional()
  @IsString()
  mailgunApiKey?: string | null;

  @IsOptional()
  @IsString()
  smtpUser?: string | null;

  @IsOptional()
  @IsString()
  smtpPass?: string | null;
}

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly quota: QuotaService,
  ) {}

  @Get()
  async get() {
    const pub = await this.settings.getPublic();
    const usage = await this.quota.snapshot();
    return {
      ...pub,
      usage,
    };
  }

  @Put()
  async update(@Body() dto: UpdateSettingsDto) {
    const pub = await this.settings.update({ ...dto });
    const usage = await this.quota.snapshot();
    return { ...pub, usage };
  }
}
