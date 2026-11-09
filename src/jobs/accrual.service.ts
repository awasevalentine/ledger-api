import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ACCOUNT_CODES } from '../database/entities/account.entity';
import { LedgerService } from '../ledger/ledger.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface AccrualResult {
  asOf: string;
  accruedCount: number;
  entries: Array<{ instalmentId: string; entryId: string; interestKobo: string }>;
}

@Injectable()
export class AccrualService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly ledger: LedgerService,
  ) {}

  async accrue(asOf: string): Promise<AccrualResult> {
    if (!ISO_DATE.test(asOf)) throw new BadRequestException('asOf must be YYYY-MM-DD');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const pending: Array<{ id: string; interest_kobo: string; due_date: string }> = await qr.query(
        `SELECT id, interest_kobo, due_date::text AS due_date
         FROM instalments
         WHERE due_date <= $1 AND interest_accrued = FALSE AND interest_kobo > 0
         ORDER BY due_date, sequence
         FOR UPDATE`,
        [asOf],
      );

      const entries: AccrualResult['entries'] = [];

      for (const row of pending) {
        const interest = BigInt(row.interest_kobo);
        const entry = await this.ledger.postEntry(qr, {
          entryDate: row.due_date,
          memo: `interest accrual for instalment ${row.id}`,
          referenceType: 'instalment-accrual',
          referenceId: row.id,
          lines: [
            { accountCode: ACCOUNT_CODES.INTEREST_RECEIVABLE, direction: 'DR', amountKobo: interest },
            { accountCode: ACCOUNT_CODES.INTEREST_INCOME, direction: 'CR', amountKobo: interest },
          ],
        });

        await qr.query(
          `UPDATE instalments SET interest_accrued = TRUE, accrual_entry_id = $1 WHERE id = $2`,
          [entry.id, row.id],
        );

        entries.push({ instalmentId: row.id, entryId: entry.id, interestKobo: interest.toString() });
      }

      await qr.commitTransaction();
      return { asOf, accruedCount: entries.length, entries };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }
}
