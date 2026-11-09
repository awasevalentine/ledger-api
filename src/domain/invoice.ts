import { Kobo, dec, roundHalfUpToKobo } from '../money/money';
import { daysBetween, parseDate } from '../money/date';

export const ADVANCE_RATE_BPS = 8000;
export const INVOICE_ANNUAL_RATE_BPS = 3600;
export const PENALTY_DAILY_BPS = 20;

export interface InvoiceQuoteInput {
  faceValueKobo: Kobo;
  issueDate: string;
  dueDate: string;
  settlementDate?: string;
}

export interface InvoiceQuote {
  faceValueKobo: Kobo;
  advanceKobo: Kobo;
  reserveKobo: Kobo;
  tenorDays: number;
  discountFeeKobo: Kobo;
  daysOverdue: number;
  latePenaltyKobo: Kobo;
  payableToClientKobo: Kobo;
  clientShortfallKobo: Kobo;
}

export function quoteInvoice(input: InvoiceQuoteInput): InvoiceQuote {
  const { faceValueKobo, issueDate, dueDate, settlementDate } = input;

  const issue = parseDate(issueDate);
  const due = parseDate(dueDate);
  const tenorDays = daysBetween(issue, due);
  if (tenorDays <= 0) throw new Error('due date must be after issue date');

  const advance = roundHalfUpToKobo(dec(faceValueKobo.toString()).mul(ADVANCE_RATE_BPS).div(10_000));
  const reserve = faceValueKobo - advance;

  const discountFee = roundHalfUpToKobo(
    dec(advance.toString()).mul(INVOICE_ANNUAL_RATE_BPS).div(10_000).mul(tenorDays).div(365),
  );

  let daysOverdue = 0;
  if (settlementDate) {
    const settlement = parseDate(settlementDate);
    const diff = daysBetween(due, settlement);
    if (diff > 0) daysOverdue = diff;
  }

  const penalty = daysOverdue === 0
    ? 0n
    : roundHalfUpToKobo(dec(advance.toString()).mul(PENALTY_DAILY_BPS).div(10_000).mul(daysOverdue));

  const charges = discountFee + penalty;
  const payableToClient = reserve >= charges ? reserve - charges : 0n;
  const clientShortfall = reserve >= charges ? 0n : charges - reserve;

  return {
    faceValueKobo,
    advanceKobo: advance,
    reserveKobo: reserve,
    tenorDays,
    discountFeeKobo: discountFee,
    daysOverdue,
    latePenaltyKobo: penalty,
    payableToClientKobo: payableToClient,
    clientShortfallKobo: clientShortfall,
  };
}
