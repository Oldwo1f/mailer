import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Send } from './send.entity';

@Entity('clicks')
export class Click {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sendId: string;

  @ManyToOne(() => Send, (s) => s.clicks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sendId' })
  send: Send;

  @Column({ type: 'text' })
  url: string;

  @CreateDateColumn()
  clickedAt: Date;
}
