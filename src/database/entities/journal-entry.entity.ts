import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { JournalLine } from './journal-line.entity';

@Entity({ name: 'journal_entries' })
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate!: string;

  @Column({ type: 'text', nullable: true })
  memo!: string | null;

  @Column({ name: 'reference_type', type: 'text', nullable: true })
  referenceType!: string | null;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId!: string | null;

  @Column({ name: 'reverses_entry_id', type: 'uuid', nullable: true })
  reversesEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { nullable: true })
  @JoinColumn({ name: 'reverses_entry_id' })
  reversesEntry?: JournalEntry | null;

  @Column({ name: 'posted_in_period', type: 'char', length: 7 })
  postedInPeriod!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => JournalLine, (l) => l.entry)
  lines?: JournalLine[];
}
