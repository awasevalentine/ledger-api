import { Controller, Get } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  report() {
    return this.reconciliation.report();
  }
}
