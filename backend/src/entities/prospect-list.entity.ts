import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Prospect } from './prospect.entity';

@Entity('prospect_lists')
export class ProspectList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ManyToMany(() => Prospect, (p) => p.lists, { cascade: false })
  @JoinTable({
    name: 'prospect_list_members',
    joinColumn: { name: 'listId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'prospectId', referencedColumnName: 'id' },
  })
  prospects: Prospect[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
