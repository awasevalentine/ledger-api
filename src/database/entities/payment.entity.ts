import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Loan } from './loan.entity';
import { PaymentAllocation } from './payment-allocation.entity';
import { bigintTransformer } from '../bigint-transformer';

export type PaymentStatus = 'applied' | 'reversed';

@Entity({ name: 'payments' })
@Unique(['loanId', 'sequence'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'loan_id', type: 'uuid' })
  loanId!: string;

  @ManyToOne(() => Loan, (l) => l.payments)
  @JoinColumn({ name: 'loan_id' })
  loan?: Loan;

  @Column({ name: 'amount_kobo', type: 'bigint', transformer: bigintTransformer })
  amountKobo!: bigint;

  @Column({ name: 'received_at', type: 'date' })
  receivedAt!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  sequence!: bigint;

  @Column({ name: 'external_ref', type: 'text', nullable: true })
  externalRef!: string | null;

  @Column({ type: 'text', default: 'applied' })
  status!: PaymentStatus;

  @Column({ name: 'entry_id', type: 'uuid', nullable: true })
  entryId!: string | null;

  @Column({ name: 'reversal_entry_id', type: 'uuid', nullable: true })
  reversalEntryId!: string | null;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt!: Date | null;

  @Column({ name: 'reversal_reason', type: 'text', nullable: true })
  reversalReason!: string | null;

  @Column({ name: 'idempotency_key', type: 'text', nullable: true })
  idempotencyKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => PaymentAllocation, (a) => a.payment)
  allocations?: PaymentAllocation[];
}
