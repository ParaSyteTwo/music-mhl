import { describe, expect, it } from 'vitest';
import { decodeBase64ArrayBuffer } from './binaryEncoding';

describe('decodeBase64ArrayBuffer', () => {
  it('decodes the desktop bridge base64 contract', () => {
    const decoded = new Uint8Array(decodeBase64ArrayBuffer('AAH+/w=='));
    expect([...decoded]).toEqual([0, 1, 254, 255]);
  });
});
