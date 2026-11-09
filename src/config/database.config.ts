import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Account } from '../database/entities/account.entity';
import { JournalEntry } from '../database/entities/journal-entry.entity';
import { JournalLine } from '../database/entities/journal-line.entity';
import { Loan } from '../database/entities/loan.entity';
import { Instalment } from '../database/entities/instalment.entity';
import { Payment } from '../database/entities/payment.entity';
import { PaymentAllocation } from '../database/entities/payment-allocation.entity';
import { IdempotencyKey } from '../database/entities/idempotency-key.entity';
import { Period } from '../database/entities/period.entity';
import { ReversalAudit } from '../database/entities/reversal-audit.entity';
import { Invoice } from '../database/entities/invoice.entity';
import { InitialSchema1700000000000 } from '../database/migrations/1700000000000-InitialSchema';
import { Invoices1700000001000 } from '../database/migrations/1700000001000-Invoices';

export function buildTypeOrmOptions(): TypeOrmModuleOptions {
  const url = process.env.DATABASE_URL ?? 'postgres://ledger:ledger@localhost:55432/ledger';
  const autoMigrate = process.env.AUTO_MIGRATE !== 'false';
  return {
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
    migrationsRun: autoMigrate,
    synchronize: false,
    logging: false,
  };
}
