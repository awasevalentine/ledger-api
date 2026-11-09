import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../bigint-transformer';

export type InvoiceStatus = 'advanced' | 'settled';

@Entity({ name: 'invoices' })
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'face_value_kobo', type: 'bigint', transformer: bigintTransformer })
  faceValueKobo!: bigint;

  @Column({ name: 'advance_kobo', type: 'bigint', transformer: bigintTransformer })
  advanceKobo!: bigint;

  @Column({ name: 'reserve_kobo', type: 'bigint', transformer: bigintTransformer })
  reserveKobo!: bigint;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate!: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({ type: 'text', default: 'advanced' })
  status!: InvoiceStatus;

  @Column({ name: 'advance_entry_id', type: 'uuid', nullable: true })
  advanceEntryId!: string | null;

  @Column({ name: 'settlement_entry_id', type: 'uuid', nullable: true })
  settlementEntryId!: string | null;

  @Column({ name: 'settled_at', type: 'date', nullable: true })
  settledAt!: string | null;

  @Column({ name: 'discount_fee_kobo', type: 'bigint', transformer: bigintTransformer, nullable: true })
  discountFeeKobo!: bigint | null;

  @Column({ name: 'late_penalty_kobo', type: 'bigint', transformer: bigintTransformer, nullable: true })
  latePenaltyKobo!: bigint | null;

  @Column({ name: 'amount_received_kobo', type: 'bigint', transformer: bigintTransformer, nullable: true })
  amountReceivedKobo!: bigint | null;

  @Column({ name: 'payable_to_client_kobo', type: 'bigint', transformer: bigintTransformer, nullable: true })
  payableToClientKobo!: bigint | null;

  @Column({ name: 'client_shortfall_kobo', type: 'bigint', transformer: bigintTransformer, nullable: true })
  clientShortfallKobo!: bigint | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
