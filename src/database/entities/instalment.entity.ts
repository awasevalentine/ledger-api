import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Loan } from './loan.entity';
import { bigintTransformer } from '../bigint-transformer';

@Entity({ name: 'instalments' })
@Unique(['loanId', 'sequence'])
export class Instalment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'loan_id', type: 'uuid' })
  loanId!: string;

  @ManyToOne(() => Loan, (l) => l.instalments)
  @JoinColumn({ name: 'loan_id' })
  loan?: Loan;

  @Column({ type: 'int' })
  sequence!: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({ name: 'opening_balance_kobo', type: 'bigint', transformer: bigintTransformer })
  openingBalanceKobo!: bigint;

  @Column({ name: 'interest_kobo', type: 'bigint', transformer: bigintTransformer })
  interestKobo!: bigint;

  @Column({ name: 'principal_kobo', type: 'bigint', transformer: bigintTransformer })
  principalKobo!: bigint;

  @Column({ name: 'payment_kobo', type: 'bigint', transformer: bigintTransformer })
  paymentKobo!: bigint;

  @Column({ name: 'closing_balance_kobo', type: 'bigint', transformer: bigintTransformer })
  closingBalanceKobo!: bigint;

  @Column({ name: 'interest_accrued', type: 'boolean', default: false })
  interestAccrued!: boolean;

  @Column({ name: 'accrual_entry_id', type: 'uuid', nullable: true })
  accrualEntryId!: string | null;
}
