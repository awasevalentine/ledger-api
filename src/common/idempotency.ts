import { createHash } from 'crypto';
import { QueryRunner } from 'typeorm';

export function hashRequest(body: unknown): string {
  const canonical = JSON.stringify(body, Object.keys(body as Record<string, unknown>).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

export async function advisoryLock(qr: QueryRunner, scope: string, key: string): Promise<void> {
  await qr.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${scope}:${key}`]);
}

export interface StoredIdempotentResponse {
  requestHash: string;
  statusCode: number;
  responseBody: Record<string, unknown>;
}

export async function lookupIdempotency(
  qr: QueryRunner,
  scope: string,
  key: string,
): Promise<StoredIdempotentResponse | null> {
  const rows: Array<{ request_hash: string; status_code: number; response_body: Record<string, unknown> }> =
    await qr.query(
      `SELECT request_hash, status_code, response_body
       FROM idempotency_keys WHERE scope = $1 AND key = $2`,
      [scope, key],
    );
  if (rows.length === 0) return null;
  return {
    requestHash: rows[0]!.request_hash,
    statusCode: rows[0]!.status_code,
    responseBody: rows[0]!.response_body,
  };
}

export async function storeIdempotency(
  qr: QueryRunner,
  scope: string,
  key: string,
  requestHash: string,
  statusCode: number,
  responseBody: Record<string, unknown>,
): Promise<void> {
  await qr.query(
    `INSERT INTO idempotency_keys (scope, key, request_hash, response_body, status_code)
     VALUES ($1, $2, $3, $4, $5)`,
    [scope, key, requestHash, responseBody, statusCode],
  );
}
