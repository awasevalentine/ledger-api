import { BadRequestException, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { AccrualService } from './accrual.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly accrual: AccrualService) {}

  @Post('accrue')
  @HttpCode(200)
  run(@Query('asOf') asOf: string) {
    if (!asOf) throw new BadRequestException('asOf query parameter is required');
    return this.accrual.accrue(asOf);
  }
}
