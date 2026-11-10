import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ReversalController } from './reversal.controller';
import { ReversalService } from './reversal.service';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  controllers: [PaymentsController, ReversalController],
  providers: [PaymentsService, ReversalService],
  exports: [PaymentsService, ReversalService],
})
export class PaymentsModule {}
