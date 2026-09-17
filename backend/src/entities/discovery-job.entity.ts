import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  DiscoverJobResults,
  DiscoverJobStatus,
  DiscoverLogEntry,
} from '../discover/discover.types';

@Entity('discovery_jobs')
export class DiscoveryJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  status: DiscoverJobStatus;

  @Column()
  keywords: string;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column()
  listId: string;

  @Column()
  listName: string;

  @Column({ type: 'int' })
  batchSize: number;

  /** `manual` or `aurel-acquisition`. */
  @Column({ type: 'varchar', default: 'manual' })
  source: string;

  /** Stable strategy key used to avoid hammering the same segment. */
  @Column({ type: 'varchar', nullable: true })
  missionKey: string | null;

  @Column({ type: 'varchar', nullable: true })
  targetProductId: string | null;

  @Column({ type: 'varchar', nullable: true })
  targetActivity: string | null;

  @Column({ default: 0 })
  found: number;

  @Column({ default: 0 })
  merged: number;

  @Column({ default: 0 })
  skipped: number;

  @Column({ default: 0 })
  searches: number;

  @Column({ default: 0 })
  scrapes: number;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'simple-json', nullable: true })
  log: DiscoverLogEntry[] | null;

  @Column({ type: 'simple-json', nullable: true })
  results: DiscoverJobResults | null;

  /** Once set, Product Matcher/market post-processing has already run. */
  @Column({ type: 'datetime', nullable: true })
  autopilotProcessedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null;
}
