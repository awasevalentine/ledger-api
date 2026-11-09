declare global {
  interface BigInt {
    toJSON(): string;
  }
}

if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  (BigInt.prototype as any).toJSON = function (this: bigint): string {
    return this.toString();
  };
}

export {};
