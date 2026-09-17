import { Controller, Get, Post, Query } from '@nestjs/common';
import { AurelReportService } from './aurel-report.service';
import { AurelJournalService } from './aurel-journal.service';
import { AurelDeferredFollowUpService } from './aurel-deferred-followup.service';

@Controller('aurel')
export class AurelCommandController {
  constructor(
    private readonly reportService: AurelReportService,
    private readonly journal: AurelJournalService,
    private readonly followUps: AurelDeferredFollowUpService,
  ) {}

  @Get('report')
  report() {
    return this.reportService.report();
  }

  @Get('journal')
  journalEntries(@Query('limit') limit?: string) {
    return this.journal.recent(Number(limit) || 50);
  }

  @Post('followups/run')
  runFollowUps() {
    return this.followUps.processDue();
  }
}
