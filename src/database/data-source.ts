import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Account } from './entities/account.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import { Loan } from './entities/loan.entity';
import { Instalment } from './entities/instalment.entity';
import { Payment } from './entities/payment.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { Period } from './entities/period.entity';
import { ReversalAudit } from './entities/reversal-audit.entity';
import { Invoice } from './entities/invoice.entity';
import { InitialSchema1700000000000 } from './migrations/1700000000000-InitialSchema';
import { Invoices1700000001000 } from './migrations/1700000001000-Invoices';

config();

const url =
  process.env.DATABASE_URL ?? 'postgres://ledger:ledger@localhost:55432/ledger';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url,
  entities: [
    Account,
    JournalEntry,
    JournalLine,
    Loan,
    Instalment,
    Payment,
    PaymentAllocation,
    IdempotencyKey,
    Period,
    ReversalAudit,
    Invoice,
  ],
  migrations: [InitialSchema1700000000000, Invoices1700000001000],
  synchronize: false,
  logging: false,
});
