/**
 * The cryptography a Secure QR check needs, in plain TypeScript so the phone (Hermes) and the
 * operator's browser run the same code with no native module: SHA-256, and verifying an RSA
 * PKCS#1 v1.5 signature with a public key.
 *
 * Only public data passes through here — a QR's signed bytes and UIDAI's public keys — so there
 * is no secret to keep out of timing; nothing is logged.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** SHA-256 of `data`, as 32 bytes. */
export function sha256(data: Uint8Array): Uint8Array {
  const bitLength = data.length * 8;
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  // Messages here are a few kilobytes: the high 32 bits of the length are always zero.
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15] ?? 0;
      const b = w[i - 2] ?? 0;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = h[0] ?? 0;
    let b = h[1] ?? 0;
    let c = h[2] ?? 0;
    let d = h[3] ?? 0;
    let e = h[4] ?? 0;
    let f = h[5] ?? 0;
    let g = h[6] ?? 0;
    let hh = h[7] ?? 0;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + choose + (K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = ((h[0] ?? 0) + a) >>> 0;
    h[1] = ((h[1] ?? 0) + b) >>> 0;
    h[2] = ((h[2] ?? 0) + c) >>> 0;
    h[3] = ((h[3] ?? 0) + d) >>> 0;
    h[4] = ((h[4] ?? 0) + e) >>> 0;
    h[5] = ((h[5] ?? 0) + f) >>> 0;
    h[6] = ((h[6] ?? 0) + g) >>> 0;
    h[7] = ((h[7] ?? 0) + hh) >>> 0;
  }

  const digest = new Uint8Array(32);
  const out = new DataView(digest.buffer);
  for (let i = 0; i < 8; i += 1) out.setUint32(i * 4, h[i] ?? 0);
  return digest;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return bytes.length === 0 ? 0n : BigInt(`0x${bytesToHex(bytes)}`);
}

/** `value` as exactly `length` big-endian bytes; null when it does not fit. */
function bigIntToBytes(value: bigint, length: number): Uint8Array | null {
  const hex = value.toString(16);
  if (hex.length > length * 2) return null;
  return hexToBytes(hex.padStart(length * 2, '0'));
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

/** DER of `DigestInfo { sha256, NULL }` up to the digest (RFC 8017 §9.2, note 1). */
const SHA256_DIGEST_INFO = hexToBytes('3031300d060960864801650304020105000420');

export type RsaPublicKey = {
  readonly modulusHex: string;
  /** 65537 unless stated. */
  readonly exponent?: bigint;
};

/**
 * Whether `signature` is a valid RSASSA-PKCS1-v1_5 signature with SHA-256 ("SHA256withRSA") over
 * `message` for `key`. The whole encoded block is compared, so a forged padding is refused.
 */
export function verifyRsaSha256(
  key: RsaPublicKey,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  const modulus = BigInt(`0x${key.modulusHex}`);
  const length = Math.ceil(key.modulusHex.replace(/^0+/, '').length / 2);
  if (signature.length !== length) return false;
  const s = bytesToBigInt(signature);
  if (s >= modulus) return false;

  const encoded = bigIntToBytes(modPow(s, key.exponent ?? 65537n, modulus), length);
  if (!encoded) return false;

  const digest = sha256(message);
  const tLength = SHA256_DIGEST_INFO.length + digest.length;
  const padLength = length - tLength - 3;
  if (padLength < 8) return false;

  const expected = new Uint8Array(length);
  expected[0] = 0x00;
  expected[1] = 0x01;
  expected.fill(0xff, 2, 2 + padLength);
  expected[2 + padLength] = 0x00;
  expected.set(SHA256_DIGEST_INFO, 3 + padLength);
  expected.set(digest, 3 + padLength + SHA256_DIGEST_INFO.length);

  let difference = 0;
  for (let i = 0; i < length; i += 1) difference |= (encoded[i] ?? 0) ^ (expected[i] ?? 0);
  return difference === 0;
}
