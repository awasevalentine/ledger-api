import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type PeriodStatus = 'open' | 'closed';

@Entity({ name: 'periods' })
export class Period {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'year_month', type: 'char', length: 7, unique: true })
  yearMonth!: string;

  @Column({ type: 'text' })
  status!: PeriodStatus;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;
}
