import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Instalment } from './instalment.entity';
import { Payment } from './payment.entity';
import { bigintTransformer } from '../bigint-transformer';

@Entity({ name: 'loans' })
export class Loan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'principal_kobo', type: 'bigint', transformer: bigintTransformer })
  principalKobo!: bigint;

  @Column({ name: 'annual_rate_bps', type: 'int' })
  annualRateBps!: number;

  @Column({ name: 'term_months', type: 'int' })
  termMonths!: number;

  @Column({ name: 'disbursement_date', type: 'date' })
  disbursementDate!: string;

  @Column({ name: 'disbursement_entry_id', type: 'uuid', nullable: true })
  disbursementEntryId!: string | null;

  @Column({ name: 'payment_sequence', type: 'bigint', transformer: bigintTransformer })
  paymentSequence!: bigint;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => Instalment, (i) => i.loan)
  instalments?: Instalment[];

  @OneToMany(() => Payment, (p) => p.loan)
  payments?: Payment[];
}
