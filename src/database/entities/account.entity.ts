import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity';
export type NormalSide = 'DR' | 'CR';

@Entity({ name: 'accounts' })
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  type!: AccountType;

  @Column({ name: 'normal_side', type: 'char', length: 2 })
  normalSide!: NormalSide;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

export const ACCOUNT_CODES = {
  CASH: 'CASH',
  LOANS_RECEIVABLE: 'LOANS_RECEIVABLE',
  INTEREST_RECEIVABLE: 'INTEREST_RECEIVABLE',
  INVOICE_RECEIVABLES: 'INVOICE_RECEIVABLES',
  CLIENT_RECEIVABLE: 'CLIENT_RECEIVABLE',
  INTEREST_INCOME: 'INTEREST_INCOME',
  FEE_INCOME: 'FEE_INCOME',
  PENALTY_INCOME: 'PENALTY_INCOME',
  CLIENT_PAYABLE: 'CLIENT_PAYABLE',
  UNAPPLIED_CREDIT: 'UNAPPLIED_CREDIT',
} as const;

export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];
