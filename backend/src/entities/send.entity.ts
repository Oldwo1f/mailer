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
import { Draft } from './draft.entity';
import { Prospect } from './prospect.entity';
import { Campaign } from './campaign.entity';
import { Click } from './click.entity';

export type SendStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';

@Entity('sends')
export class Send {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column({ type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: Campaign;

  @Column({ type: 'uuid' })
  draftId: string;

  @ManyToOne(() => Draft, (d) => d.sends, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'draftId' })
  draft: Draft;

  @Column({ type: 'uuid' })
  prospectId: string;

  @ManyToOne(() => Prospect, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'prospectId' })
  prospect: Prospect;

  @Column()
  toEmail: string;

  @Column({ type: 'varchar', default: 'queued' })
  status: SendStatus;

  @Column({ type: 'varchar', nullable: true })
  messageId: string | null;

  @Column({ type: 'varchar', nullable: true })
  provider: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'datetime', nullable: true })
  sentAt: Date | null;

  @Column({ default: 0 })
  openCount: number;

  @Column({ type: 'datetime', nullable: true })
  lastOpenedAt: Date | null;

  @Column({ default: 0 })
  clickCount: number;

  @OneToMany(() => Click, (click) => click.send)
  clicks: Click[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
