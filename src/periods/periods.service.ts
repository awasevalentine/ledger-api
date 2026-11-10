import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface PeriodState {
  yearMonth: string;
  status: 'open' | 'closed';
  closedAt: string | null;
}

@Injectable()
export class PeriodsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async close(yearMonth: string): Promise<PeriodState> {
    if (!YM.test(yearMonth)) throw new BadRequestException('period must be YYYY-MM');

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const existing: Array<{ status: string }> = await qr.query(
        `SELECT status FROM periods WHERE year_month = $1 FOR UPDATE`,
        [yearMonth],
      );

      if (existing.length === 0) {
        await qr.query(
          `INSERT INTO periods (year_month, status, closed_at) VALUES ($1, 'closed', now())`,
          [yearMonth],
        );
      } else if (existing[0]!.status === 'open') {
        await qr.query(
          `UPDATE periods SET status = 'closed', closed_at = now() WHERE year_month = $1`,
          [yearMonth],
        );
      }

      const [row]: Array<{ year_month: string; status: 'open' | 'closed'; closed_at: Date | null }> =
        await qr.query(
          `SELECT year_month, status, closed_at FROM periods WHERE year_month = $1`,
          [yearMonth],
        );

      await qr.commitTransaction();
      return {
        yearMonth: row.year_month,
        status: row.status,
        closedAt: row.closed_at ? row.closed_at.toISOString() : null,
      };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async list(): Promise<PeriodState[]> {
    const rows: Array<{ year_month: string; status: 'open' | 'closed'; closed_at: Date | null }> =
      await this.ds.query(`SELECT year_month, status, closed_at FROM periods ORDER BY year_month`);
    return rows.map((r) => ({
      yearMonth: r.year_month,
      status: r.status,
      closedAt: r.closed_at ? r.closed_at.toISOString() : null,
    }));
  }
}
