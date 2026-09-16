import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Campaign } from './campaign.entity';
import { Prospect } from './prospect.entity';
import { Send } from './send.entity';
import { CampaignStep } from './campaign-step.entity';

export type DraftStatus = 'pending' | 'ready' | 'approved' | 'skipped' | 'error';

@Entity('drafts')
export class Draft {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => Campaign, (c) => c.drafts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: Campaign;

  @Column({ type: 'uuid', nullable: true })
  stepId: string | null;

  @ManyToOne(() => CampaignStep, (s) => s.drafts, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'stepId' })
  step: CampaignStep | null;

  @Column({ type: 'uuid' })
  prospectId: string;

  @ManyToOne(() => Prospect, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'prospectId' })
  prospect: Prospect;

  @Column({ type: 'varchar', nullable: true })
  subject: string | null;

  @Column({ type: 'text', nullable: true })
  html: string | null;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ type: 'varchar', default: 'pending' })
  status: DraftStatus;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @OneToMany(() => Send, (send) => send.draft)
  sends: Send[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
