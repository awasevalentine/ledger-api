import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/errors';
import '../src/common/json-bigint';

export interface Harness {
  app: INestApplication;
  ds: DataSource;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const ds = app.get(DataSource);

  const reset = async () => {
    await ds.query(`
      TRUNCATE TABLE reversal_audits, idempotency_keys, payment_allocations, payments,
                     instalments, loans, invoices, journal_lines, journal_entries, periods
      RESTART IDENTITY CASCADE
    `);
  };

  const close = async () => {
    await app.close();
  };

  return { app, ds, reset, close };
}
