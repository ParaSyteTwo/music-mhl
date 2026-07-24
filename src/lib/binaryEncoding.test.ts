import { describe, expect, it } from 'vitest';
import { decodeBase64ArrayBuffer, encodeArrayBufferBase64 } from './binaryEncoding';

describe('decodeBase64ArrayBuffer', () => {
  it('decodes the desktop bridge base64 contract', () => {
    const decoded = new Uint8Array(decodeBase64ArrayBuffer('AAH+/w=='));
    expect([...decoded]).toEqual([0, 1, 254, 255]);
  });
});

it('encodes large audio-sized buffers without quadratic string concatenation', () => {
  const bytes = new Uint8Array(100_000);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
  const encoded = encodeArrayBufferBase64(bytes.buffer);
  expect(new Uint8Array(decodeBase64ArrayBuffer(encoded))).toEqual(bytes);
});
