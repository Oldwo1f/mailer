import { Controller, Get, Param, Post } from '@nestjs/common';
import { DemoPersonalizerService } from './demo-personalizer.service';

@Controller('demo-personalizer')
export class DemoPersonalizerController {
  constructor(private readonly demos: DemoPersonalizerService) {}

  @Get(':prospectId')
  get(@Param('prospectId') prospectId: string) {
    return this.demos.get(prospectId);
  }

  @Post(':prospectId/prepare')
  prepare(@Param('prospectId') prospectId: string) {
    return this.demos.prepare(prospectId);
  }
}
