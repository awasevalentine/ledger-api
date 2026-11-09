import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Payment } from './payment.entity';

@Entity({ name: 'reversal_audits' })
export class ReversalAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @ManyToOne(() => Payment)
  @JoinColumn({ name: 'payment_id' })
  payment?: Payment;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'before_state', type: 'jsonb' })
  beforeState!: unknown;

  @Column({ name: 'after_state', type: 'jsonb' })
  afterState!: unknown;

  @Column({ name: 'correcting_entry_ids', type: 'jsonb' })
  correctingEntryIds!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
