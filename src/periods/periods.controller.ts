import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { PeriodsService } from './periods.service';

@Controller('periods')
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  @Get()
  list() {
    return this.periods.list();
  }

  @Post(':yearMonth/close')
  @HttpCode(200)
  close(@Param('yearMonth') yearMonth: string) {
    return this.periods.close(yearMonth);
  }
}
