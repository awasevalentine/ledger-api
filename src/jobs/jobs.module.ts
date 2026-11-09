import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { AccrualService } from './accrual.service';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  controllers: [JobsController],
  providers: [AccrualService],
  exports: [AccrualService],
})
export class JobsModule {}
