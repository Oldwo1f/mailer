import { Controller, Get } from '@nestjs/common';
import { QuotaService } from './quota.service';

@Controller('usage')
export class UsageController {
  constructor(private readonly quota: QuotaService) {}

  @Get()
  get() {
    return this.quota.snapshot();
  }
}
