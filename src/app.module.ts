import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './config/database.config';
import { LedgerModule } from './ledger/ledger.module';
import { LoansModule } from './loans/loans.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { JobsModule } from './jobs/jobs.module';
import { PeriodsModule } from './periods/periods.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(buildTypeOrmOptions()),
    LedgerModule,
    LoansModule,
    InvoicesModule,
    PaymentsModule,
    JobsModule,
    PeriodsModule,
    ReconciliationModule,
  ],
})
export class AppModule {}
