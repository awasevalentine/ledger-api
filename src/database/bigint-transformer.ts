import { ValueTransformer } from 'typeorm';

export const bigintTransformer: ValueTransformer = {
  to: (value: bigint | number | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    return value.toString();
  },
  from: (value: string | null | undefined): bigint | null => {
    if (value === null || value === undefined) return null;
    return BigInt(value);
  },
};
