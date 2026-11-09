import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Payment } from './payment.entity';
import { Instalment } from './instalment.entity';
import { bigintTransformer } from '../bigint-transformer';

@Entity({ name: 'payment_allocations' })
@Unique(['paymentId', 'version', 'slot'])
export class PaymentAllocation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @ManyToOne(() => Payment, (p) => p.allocations)
  @JoinColumn({ name: 'payment_id' })
  payment?: Payment;

  @Column({ type: 'int' })
  version!: number;

  @Column({ name: 'instalment_id', type: 'uuid', nullable: true })
  instalmentId!: string | null;

  @ManyToOne(() => Instalment, { nullable: true })
  @JoinColumn({ name: 'instalment_id' })
  instalment?: Instalment | null;

  @Column({ type: 'int' })
  slot!: number;

  @Column({ name: 'penalty_kobo', type: 'bigint', transformer: bigintTransformer, default: '0' })
  penaltyKobo!: bigint;

  @Column({ name: 'fee_kobo', type: 'bigint', transformer: bigintTransformer, default: '0' })
  feeKobo!: bigint;

  @Column({ name: 'interest_kobo', type: 'bigint', transformer: bigintTransformer, default: '0' })
  interestKobo!: bigint;

  @Column({ name: 'principal_kobo', type: 'bigint', transformer: bigintTransformer, default: '0' })
  principalKobo!: bigint;

  @Column({ name: 'unapplied_kobo', type: 'bigint', transformer: bigintTransformer, default: '0' })
  unappliedKobo!: bigint;

  @Column({ name: 'is_current', type: 'boolean' })
  isCurrent!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
