import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { AccountCode } from '../database/entities/account.entity';
import { PostEntryInput, PostedEntry, TrialBalanceRow } from './ledger.types';
import { yearMonth } from '../money/date';

@Injectable()
export class LedgerService implements OnModuleInit {
  private accountIdByCode = new Map<string, string>();

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.loadAccountCache();
  }

  private async loadAccountCache(): Promise<void> {
    const rows: Array<{ id: string; code: string }> = await this.ds.query(
      `SELECT id, code FROM accounts`,
    );
    this.accountIdByCode.clear();
    for (const r of rows) this.accountIdByCode.set(r.code, r.id);
  }

  private resolveAccountId(code: AccountCode): string {
    const id = this.accountIdByCode.get(code);
    if (!id) throw new Error(`unknown account code: ${code}`);
    return id;
  }

  async postEntry(qr: QueryRunner, input: PostEntryInput): Promise<PostedEntry> {
    if (this.accountIdByCode.size === 0) await this.loadAccountCache();

    const lines = input.lines.filter((l) => l.amountKobo > 0n);
    if (lines.length < 2) {
      throw new BadRequestException('journal entry must have at least two non-zero lines');
    }

    let dr = 0n;
    let cr = 0n;
    for (const l of lines) {
      if (l.amountKobo <= 0n) {
        throw new BadRequestException('amount must be a positive integer kobo');
      }
      if (l.direction === 'DR') dr += l.amountKobo;
      else cr += l.amountKobo;
    }
    if (dr !== cr) {
      throw new BadRequestException(`entry is unbalanced: DR=${dr} CR=${cr}`);
    }

    const period = yearMonth(input.entryDate);

    const [entry] = (await qr.query(
      `INSERT INTO journal_entries
         (entry_date, memo, reference_type, reference_id, reverses_entry_id, posted_in_period)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, entry_date, memo, reference_type, reference_id, reverses_entry_id, posted_in_period`,
      [
        input.entryDate,
        input.memo ?? null,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.reversesEntryId ?? null,
        period,
      ],
    )) as Array<{
      id: string;
      entry_date: Date;
      memo: string | null;
      reference_type: string | null;
      reference_id: string | null;
      reverses_entry_id: string | null;
      posted_in_period: string;
    }>;

    for (const l of lines) {
      await qr.query(
        `INSERT INTO journal_lines (entry_id, account_id, direction, amount_kobo)
         VALUES ($1, $2, $3, $4)`,
        [entry.id, this.resolveAccountId(l.accountCode), l.direction, l.amountKobo.toString()],
      );
    }

    return {
      id: entry.id,
      entryDate: input.entryDate,
      memo: entry.memo,
      referenceType: entry.reference_type,
      referenceId: entry.reference_id,
      reversesEntryId: entry.reverses_entry_id,
      postedInPeriod: entry.posted_in_period,
    };
  }

  async reverseEntry(
    qr: QueryRunner,
    entryId: string,
    opts: { entryDate: string; memo?: string },
  ): Promise<PostedEntry> {
    const rows: Array<{ id: string; reverses_entry_id: string | null }> = await qr.query(
      `SELECT id, reverses_entry_id FROM journal_entries WHERE id = $1`,
      [entryId],
    );
    const original = rows[0];
    if (!original) throw new NotFoundException(`journal entry ${entryId} not found`);
    if (original.reverses_entry_id) {
      throw new BadRequestException('cannot reverse a reversal entry');
    }

    const existing: Array<{ id: string }> = await qr.query(
      `SELECT id FROM journal_entries WHERE reverses_entry_id = $1`,
      [entryId],
    );
    if (existing.length > 0) {
      throw new BadRequestException(`entry ${entryId} has already been reversed`);
    }

    const lines: Array<{ account_id: string; direction: 'DR' | 'CR'; amount_kobo: string }> =
      await qr.query(
        `SELECT account_id, direction, amount_kobo FROM journal_lines WHERE entry_id = $1`,
        [entryId],
      );

    const period = yearMonth(opts.entryDate);
    const [entry] = (await qr.query(
      `INSERT INTO journal_entries
         (entry_date, memo, reference_type, reference_id, reverses_entry_id, posted_in_period)
       VALUES ($1, $2, 'reversal', $3, $3, $4)
       RETURNING id, entry_date, memo, reference_type, reference_id, reverses_entry_id, posted_in_period`,
      [opts.entryDate, opts.memo ?? `reversal of ${entryId}`, entryId, period],
    )) as Array<{
      id: string;
      entry_date: Date;
      memo: string | null;
      reference_type: string | null;
      reference_id: string | null;
      reverses_entry_id: string | null;
      posted_in_period: string;
    }>;

    for (const l of lines) {
      const flip: 'DR' | 'CR' = l.direction === 'DR' ? 'CR' : 'DR';
      await qr.query(
        `INSERT INTO journal_lines (entry_id, account_id, direction, amount_kobo)
         VALUES ($1, $2, $3, $4)`,
        [entry.id, l.account_id, flip, l.amount_kobo],
      );
    }

    return {
      id: entry.id,
      entryDate: opts.entryDate,
      memo: entry.memo,
      referenceType: entry.reference_type,
      referenceId: entry.reference_id,
      reversesEntryId: entry.reverses_entry_id,
      postedInPeriod: entry.posted_in_period,
    };
  }

  async reverseEntryStandalone(
    entryId: string,
    opts: { entryDate: string; memo?: string },
  ): Promise<PostedEntry> {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const entry = await this.reverseEntry(qr, entryId, opts);
      await qr.commitTransaction();
      return entry;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async trialBalance(asOf?: string): Promise<TrialBalanceRow[]> {
    const params: unknown[] = [];
    const where = asOf ? `WHERE je.entry_date <= $1` : '';
    if (asOf) params.push(asOf);

    const rows: Array<{
      code: string;
      name: string;
      type: string;
      normal_side: 'DR' | 'CR';
      dr: string;
      cr: string;
    }> = await this.ds.query(
      `
      SELECT a.code, a.name, a.type, a.normal_side,
             COALESCE(SUM(CASE WHEN jl.direction='DR' THEN jl.amount_kobo ELSE 0 END), 0) AS dr,
             COALESCE(SUM(CASE WHEN jl.direction='CR' THEN jl.amount_kobo ELSE 0 END), 0) AS cr
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jl.entry_id ${where}
      GROUP BY a.id, a.code, a.name, a.type, a.normal_side
      ORDER BY a.code
      `,
      params,
    );

    return rows.map((r) => {
      const dr = BigInt(r.dr);
      const cr = BigInt(r.cr);
      const net = r.normal_side === 'DR' ? dr - cr : cr - dr;
      return {
        accountCode: r.code as AccountCode,
        accountName: r.name,
        accountType: r.type,
        normalSide: r.normal_side,
        debitsKobo: dr.toString(),
        creditsKobo: cr.toString(),
        netKobo: net.toString(),
      };
    });
  }

  async getAccountNet(accountCode: AccountCode, asOf?: string): Promise<bigint> {
    const row: Array<{ dr: string; cr: string; normal_side: 'DR' | 'CR' }> = await this.ds.query(
      `
      SELECT a.normal_side,
             COALESCE(SUM(CASE WHEN jl.direction='DR' THEN jl.amount_kobo ELSE 0 END), 0) AS dr,
             COALESCE(SUM(CASE WHEN jl.direction='CR' THEN jl.amount_kobo ELSE 0 END), 0) AS cr
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jl.entry_id ${asOf ? 'AND je.entry_date <= $2' : ''}
      WHERE a.code = $1
      GROUP BY a.normal_side
      `,
      asOf ? [accountCode, asOf] : [accountCode],
    );
    const r = row[0];
    if (!r) return 0n;
    const dr = BigInt(r.dr);
    const cr = BigInt(r.cr);
    return r.normal_side === 'DR' ? dr - cr : cr - dr;
  }
}
