import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Account } from './account.entity';
import { JournalEntry } from './journal-entry.entity';
import { bigintTransformer } from '../bigint-transformer';

export type Direction = 'DR' | 'CR';

@Entity({ name: 'journal_lines' })
export class JournalLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'entry_id', type: 'uuid' })
  entryId!: string;

  @ManyToOne(() => JournalEntry, (e) => e.lines, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'entry_id' })
  entry?: JournalEntry;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account?: Account;

  @Column({ type: 'char', length: 2 })
  direction!: Direction;

  @Column({ name: 'amount_kobo', type: 'bigint', transformer: bigintTransformer })
  amountKobo!: bigint;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
