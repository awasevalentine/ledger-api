import Decimal from 'decimal.js';
import { Kobo, dec, roundHalfUpToKobo } from '../money/money';
import { addMonths, formatDate, parseDate } from '../money/date';

export interface AmortizationRow {
  sequence: number;
  dueDate: string;
  openingBalanceKobo: Kobo;
  interestKobo: Kobo;
  principalKobo: Kobo;
  paymentKobo: Kobo;
  closingBalanceKobo: Kobo;
}

export interface AmortizationInput {
  principalKobo: Kobo;
  annualRateBps: number;
  termMonths: number;
  disbursementDate: string;
}

export interface AmortizationResult {
  instalmentKobo: Kobo;
  totalInterestKobo: Kobo;
  schedule: AmortizationRow[];
}

export function computeInstalment(principalKobo: Kobo, annualRateBps: number, termMonths: number): Kobo {
  const i = dec(annualRateBps).div(10_000).div(12);
  const p = dec(principalKobo.toString());
  if (i.isZero()) {
    return roundHalfUpToKobo(p.div(termMonths));
  }
  const onePlusI = i.plus(1);
  const factor = dec(1).minus(onePlusI.pow(-termMonths));
  return roundHalfUpToKobo(p.mul(i).div(factor));
}

export function buildSchedule(input: AmortizationInput): AmortizationResult {
  const { principalKobo, annualRateBps, termMonths, disbursementDate } = input;
  const i = dec(annualRateBps).div(10_000).div(12);
  const instalment = computeInstalment(principalKobo, annualRateBps, termMonths);

  const start = parseDate(disbursementDate);
  const rows: AmortizationRow[] = [];
  let balance: Kobo = principalKobo;
  let totalInterest = 0n;

  for (let n = 1; n <= termMonths; n++) {
    const dueDate = formatDate(addMonths(start, n));
    const opening = balance;

    let interest: Kobo;
    let principal: Kobo;
    let payment: Kobo;

    if (n < termMonths) {
      interest = roundHalfUpToKobo(dec(opening.toString()).mul(i));
      principal = instalment - interest;
      payment = instalment;
      balance = opening - principal;
    } else {
      interest = roundHalfUpToKobo(dec(opening.toString()).mul(i));
      principal = opening;
      payment = principal + interest;
      balance = 0n;
    }

    totalInterest += interest;

    rows.push({
      sequence: n,
      dueDate,
      openingBalanceKobo: opening,
      interestKobo: interest,
      principalKobo: principal,
      paymentKobo: payment,
      closingBalanceKobo: balance,
    });
  }

  return { instalmentKobo: instalment, totalInterestKobo: totalInterest, schedule: rows };
}
