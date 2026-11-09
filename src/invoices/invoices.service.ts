import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ACCOUNT_CODES } from '../database/entities/account.entity';
import { LedgerService } from '../ledger/ledger.service';
import { quoteInvoice } from '../domain/invoice';
import { kobo } from '../money/money';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { SettleInvoiceDto } from './dto/settle-invoice.dto';
import { PostLine } from '../ledger/ledger.types';

export interface InvoiceView {
  id: string;
  faceValueKobo: string;
  advanceKobo: string;
  reserveKobo: string;
  issueDate: string;
  dueDate: string;
  status: 'advanced' | 'settled';
  advanceEntryId: string | null;
  settlementEntryId: string | null;
  settledAt: string | null;
  discountFeeKobo: string | null;
  latePenaltyKobo: string | null;
  amountReceivedKobo: string | null;
  payableToClientKobo: string | null;
  clientShortfallKobo: string | null;
}

@Injectable()
export class InvoicesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly ledger: LedgerService,
  ) {}

  async create(dto: CreateInvoiceDto): Promise<InvoiceView> {
    const quote = quoteInvoice({
      faceValueKobo: kobo(dto.faceValueKobo),
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
    });

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [inv]: Array<{ id: string }> = await qr.query(
        `INSERT INTO invoices (face_value_kobo, advance_kobo, reserve_kobo, issue_date, due_date)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [quote.faceValueKobo.toString(), quote.advanceKobo.toString(), quote.reserveKobo.toString(), dto.issueDate, dto.dueDate],
      );

      const entry = await this.ledger.postEntry(qr, {
        entryDate: dto.issueDate,
        memo: `invoice advance ${inv.id}`,
        referenceType: 'invoice',
        referenceId: inv.id,
        lines: [
          { accountCode: ACCOUNT_CODES.INVOICE_RECEIVABLES, direction: 'DR', amountKobo: quote.advanceKobo },
          { accountCode: ACCOUNT_CODES.CASH, direction: 'CR', amountKobo: quote.advanceKobo },
        ],
      });

      await qr.query(`UPDATE invoices SET advance_entry_id = $1 WHERE id = $2`, [entry.id, inv.id]);
      await qr.commitTransaction();
      return this.load(inv.id);
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async settle(id: string, dto: SettleInvoiceDto): Promise<InvoiceView> {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const rows: Array<{
        id: string;
        face_value_kobo: string;
        advance_kobo: string;
        reserve_kobo: string;
        issue_date: string;
        due_date: string;
        status: 'advanced' | 'settled';
      }> = await qr.query(
        `SELECT id, face_value_kobo, advance_kobo, reserve_kobo,
                issue_date::text AS issue_date, due_date::text AS due_date, status
         FROM invoices WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const inv = rows[0];
      if (!inv) throw new NotFoundException(`invoice ${id} not found`);
      if (inv.status === 'settled') throw new ConflictException(`invoice ${id} is already settled`);

      const quote = quoteInvoice({
        faceValueKobo: BigInt(inv.face_value_kobo),
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        settlementDate: dto.settlementDate,
      });

      const amountReceived = dto.amountReceivedKobo ? kobo(dto.amountReceivedKobo) : quote.faceValueKobo;
      if (amountReceived !== quote.faceValueKobo) {
        throw new BadRequestException('partial debtor payments are not supported; amountReceivedKobo must equal face value');
      }

      const advance = BigInt(inv.advance_kobo);
      const lines: PostLine[] = [
        { accountCode: ACCOUNT_CODES.CASH, direction: 'DR', amountKobo: amountReceived },
        { accountCode: ACCOUNT_CODES.INVOICE_RECEIVABLES, direction: 'CR', amountKobo: advance },
      ];
      if (quote.discountFeeKobo > 0n) {
        lines.push({ accountCode: ACCOUNT_CODES.FEE_INCOME, direction: 'CR', amountKobo: quote.discountFeeKobo });
      }
      if (quote.latePenaltyKobo > 0n) {
        lines.push({ accountCode: ACCOUNT_CODES.PENALTY_INCOME, direction: 'CR', amountKobo: quote.latePenaltyKobo });
      }
      if (quote.payableToClientKobo > 0n) {
        lines.push({ accountCode: ACCOUNT_CODES.CLIENT_PAYABLE, direction: 'CR', amountKobo: quote.payableToClientKobo });
      }
      if (quote.clientShortfallKobo > 0n) {
        lines.push({ accountCode: ACCOUNT_CODES.CLIENT_RECEIVABLE, direction: 'DR', amountKobo: quote.clientShortfallKobo });
      }

      const entry = await this.ledger.postEntry(qr, {
        entryDate: dto.settlementDate,
        memo: `invoice settlement ${id}`,
        referenceType: 'invoice-settlement',
        referenceId: id,
        lines,
      });

      await qr.query(
        `UPDATE invoices
         SET status = 'settled',
             settlement_entry_id = $1,
             settled_at = $2,
             discount_fee_kobo = $3,
             late_penalty_kobo = $4,
             amount_received_kobo = $5,
             payable_to_client_kobo = $6,
             client_shortfall_kobo = $7
         WHERE id = $8`,
        [
          entry.id,
          dto.settlementDate,
          quote.discountFeeKobo.toString(),
          quote.latePenaltyKobo.toString(),
          amountReceived.toString(),
          quote.payableToClientKobo.toString(),
          quote.clientShortfallKobo.toString(),
          id,
        ],
      );

      await qr.commitTransaction();
      return this.load(id);
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async load(id: string): Promise<InvoiceView> {
    const rows: Array<{
      id: string;
      face_value_kobo: string;
      advance_kobo: string;
      reserve_kobo: string;
      issue_date: string;
      due_date: string;
      status: 'advanced' | 'settled';
      advance_entry_id: string | null;
      settlement_entry_id: string | null;
      settled_at: string | null;
      discount_fee_kobo: string | null;
      late_penalty_kobo: string | null;
      amount_received_kobo: string | null;
      payable_to_client_kobo: string | null;
      client_shortfall_kobo: string | null;
    }> = await this.ds.query(
      `SELECT id, face_value_kobo, advance_kobo, reserve_kobo,
              issue_date::text AS issue_date, due_date::text AS due_date, status,
              advance_entry_id, settlement_entry_id, settled_at::text AS settled_at,
              discount_fee_kobo, late_penalty_kobo, amount_received_kobo,
              payable_to_client_kobo, client_shortfall_kobo
       FROM invoices WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) throw new NotFoundException(`invoice ${id} not found`);
    return {
      id: r.id,
      faceValueKobo: r.face_value_kobo,
      advanceKobo: r.advance_kobo,
      reserveKobo: r.reserve_kobo,
      issueDate: r.issue_date,
      dueDate: r.due_date,
      status: r.status,
      advanceEntryId: r.advance_entry_id,
      settlementEntryId: r.settlement_entry_id,
      settledAt: r.settled_at,
      discountFeeKobo: r.discount_fee_kobo,
      latePenaltyKobo: r.late_penalty_kobo,
      amountReceivedKobo: r.amount_received_kobo,
      payableToClientKobo: r.payable_to_client_kobo,
      clientShortfallKobo: r.client_shortfall_kobo,
    };
  }
}
