import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('aurel_action_logs')
export class AurelActionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  actionType: string;

  @Column({ type: 'varchar', default: 'done' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  prospectId: string | null;

  @Column({ type: 'uuid', nullable: true })
  campaignId: string | null;

  @Column({ type: 'uuid', nullable: true })
  jobId: string | null;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'simple-json', nullable: true })
  details: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
