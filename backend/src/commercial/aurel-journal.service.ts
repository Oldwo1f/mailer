import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AurelActionLog } from '../entities/aurel-action-log.entity';

@Injectable()
export class AurelJournalService {
  constructor(
    @InjectRepository(AurelActionLog)
    private readonly logs: Repository<AurelActionLog>,
  ) {}

  log(input: {
    actionType: string;
    status?: string;
    prospectId?: string | null;
    campaignId?: string | null;
    jobId?: string | null;
    summary: string;
    details?: Record<string, unknown> | null;
  }) {
    return this.logs.save(
      this.logs.create({
        actionType: input.actionType,
        status: input.status || 'done',
        prospectId: input.prospectId || null,
        campaignId: input.campaignId || null,
        jobId: input.jobId || null,
        summary: input.summary,
        details: input.details || null,
      }),
    );
  }

  recent(limit = 50) {
    return this.logs.find({
      order: { createdAt: 'DESC' },
      take: Math.max(1, Math.min(200, limit)),
    });
  }
}
