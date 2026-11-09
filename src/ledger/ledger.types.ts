import { AccountCode } from '../database/entities/account.entity';
import { Direction } from '../database/entities/journal-line.entity';
import { Kobo } from '../money/money';

export interface PostLine {
  accountCode: AccountCode;
  direction: Direction;
  amountKobo: Kobo;
}

export interface PostEntryInput {
  entryDate: string;
  memo?: string;
  referenceType?: string;
  referenceId?: string | null;
  reversesEntryId?: string | null;
  lines: PostLine[];
}

export interface PostedEntry {
  id: string;
  entryDate: string;
  memo: string | null;
  referenceType: string | null;
  referenceId: string | null;
  reversesEntryId: string | null;
  postedInPeriod: string;
}

export interface TrialBalanceRow {
  accountCode: AccountCode;
  accountName: string;
  accountType: string;
  normalSide: Direction;
  debitsKobo: string;
  creditsKobo: string;
  netKobo: string;
}
