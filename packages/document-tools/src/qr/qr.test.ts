/**
 * Official QR checks. Every payload here is synthetic: a made-up person, signed with a key
 * generated for the test, so no real Aadhaar data is ever needed. UIDAI's real keys appear only
 * to show they reject what they did not sign.
 */

import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

import { decodeText, decimalToBytes, readAadhaarSecureQr } from './aadhaar-secure-qr';
import {
  checkQrText,
  findLink,
  isOfficialHost,
  namesMatch,
  strongestCheck,
  suggestedDocumentType,
  summariseQrCheck,
} from './check';
import { bytesToHex, sha256, verifyRsaSha256 } from './crypto';
import { findQrCodes, type GrayImage, scanRegions } from './decode-image';
import { checkPageImage } from './index';
import { UIDAI_KEYS, type UidaiKey } from './uidai-keys';

function testKey(): {
  key: UidaiKey;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
} {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    privateKey,
    key: {
      file: 'test.cer',
      commonName: 'Test signer',
      validFrom: '2020-01-01',
      validTo: '2099-01-01',
      certSha256: '00',
      modulusHex: Buffer.from(jwk.n ?? '', 'base64url').toString('hex'),
    },
  };
}

const signer = testKey();

type Fields = {
  version?: string;
  indicator?: string;
  referenceId?: string;
  name?: string;
  mobileLast4?: string;
};

/** A Secure QR in the published layout, for a made-up person. */
function securePayload(
  fields: Fields = {},
  photo = randomBytes(400),
): { text: string; inflated: Buffer } {
  const text = [
    ...(fields.version === undefined ? ['V2'] : fields.version ? [fields.version] : []),
    fields.indicator ?? '2',
    fields.referenceId ?? '123420190320151234567',
    fields.name ?? 'Test Kumar Sample',
    '01-01-1990',
    'M',
    'S/O Example Father',
    'Sample District',
    'Near Test Temple',
    '12',
    'Test Nagar',
    '110001',
    'Sample PO',
    'Delhi',
    'Main Street',
    'Sample Tehsil',
    'Sample Village',
    ...(fields.version === '' ? [] : [fields.mobileLast4 ?? '4321']),
  ];
  // The photo goes in raw: real JPEG 2000 bytes contain 255 too, which must not split fields.
  const photoWithDelimiters = Buffer.concat([photo, Buffer.from([255, 255, 0, 255])]);
  const body = Buffer.concat([
    ...text.map((value) => Buffer.concat([Buffer.from(value, 'latin1'), Buffer.from([255])])),
    photoWithDelimiters,
    randomBytes(32),
  ]);
  const signature = sign('sha256', body, signer.privateKey);
  const inflated = Buffer.concat([body, signature]);
  const gz = gzipSync(inflated);
  return { text: BigInt(`0x${gz.toString('hex')}`).toString(10), inflated };
}

describe('sha256', () => {
  it('matches Node for empty, short and multi-block input', () => {
    for (const size of [0, 3, 55, 56, 64, 1000, 5000]) {
      const data = randomBytes(size);
      expect(bytesToHex(sha256(data))).toBe(createHash('sha256').update(data).digest('hex'));
    }
  });
});

describe('verifyRsaSha256', () => {
  it('accepts a real signature and refuses a changed message or signature', () => {
    const message = randomBytes(300);
    const signature = sign('sha256', message, signer.privateKey);
    expect(verifyRsaSha256(signer.key, message, signature)).toBe(true);

    const changed = Buffer.from(message);
    changed[10] = (changed[10] ?? 0) ^ 1;
    expect(verifyRsaSha256(signer.key, changed, signature)).toBe(false);

    const badSignature = Buffer.from(signature);
    badSignature[5] = (badSignature[5] ?? 0) ^ 1;
    expect(verifyRsaSha256(signer.key, message, badSignature)).toBe(false);
    expect(verifyRsaSha256(signer.key, message, signature.subarray(1))).toBe(false);
  });
});

describe('UIDAI keys', () => {
  it('holds 2048-bit keys with fingerprints, newest first', () => {
    expect(UIDAI_KEYS.length).toBeGreaterThanOrEqual(7);
    for (const key of UIDAI_KEYS) {
      expect(key.modulusHex).toMatch(/^[0-9a-f]{512}$/);
      expect(key.certSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    const starts = UIDAI_KEYS.map((key) => key.validFrom);
    expect([...starts].sort().reverse()).toEqual(starts);
  });
});

describe('readAadhaarSecureQr', () => {
  it('reads the fields of a versioned code and verifies its signature', () => {
    const { text } = securePayload();
    const result = readAadhaarSecureQr(text, [signer.key]);
    expect(result?.signedBy?.file).toBe('test.cer');
    expect(result?.data).toMatchObject({
      version: 'V2',
      aadhaarLast4: '1234',
      generatedOn: '2019-03-20',
      name: 'Test Kumar Sample',
      dateOfBirth: '01-01-1990',
      gender: 'M',
      careOf: 'S/O Example Father',
      pincode: '110001',
      state: 'Delhi',
      hasMobile: true,
      hasEmail: false,
      mobileLast4: '4321',
    });
    expect(result?.data.address).toContain('Sample Village');
  });

  it('reads the first, unversioned layout', () => {
    const { text } = securePayload({ version: '', indicator: '3' });
    const result = readAadhaarSecureQr(text, [signer.key]);
    expect(result?.data.version).toBeNull();
    expect(result?.data.hasEmail).toBe(true);
    expect(result?.data.mobileLast4).toBeNull();
    expect(result?.signedBy).not.toBeNull();
  });

  it('does not verify against keys that did not sign it, such as UIDAI’s', () => {
    const { text } = securePayload();
    const result = readAadhaarSecureQr(text);
    expect(result?.data.name).toBe('Test Kumar Sample');
    expect(result?.signedBy).toBeNull();
  });

  it('refuses an edited name even though the layout still reads', () => {
    const { inflated } = securePayload();
    const edited = Buffer.from(
      inflated.toString('latin1').replace('Test Kumar', 'Fake Kumar'),
      'latin1',
    );
    const text = BigInt(`0x${gzipSync(edited).toString('hex')}`).toString(10);
    const result = readAadhaarSecureQr(text, [signer.key]);
    expect(result?.data.name).toBe('Fake Kumar Sample');
    expect(result?.signedBy).toBeNull();
  });

  it('is null for numbers and text that are not a Secure QR', () => {
    expect(readAadhaarSecureQr('12345')).toBeNull();
    expect(readAadhaarSecureQr('9'.repeat(400))).toBeNull();
    expect(readAadhaarSecureQr('https://example.com')).toBeNull();
    const garbage = BigInt(`0x1f8b${randomBytes(300).toString('hex')}`).toString(10);
    expect(readAadhaarSecureQr(garbage)).toBeNull();
  });

  it('is null when required fields are malformed', () => {
    expect(
      readAadhaarSecureQr(securePayload({ referenceId: 'abc' }).text, [signer.key]),
    ).toBeNull();
    expect(readAadhaarSecureQr(securePayload({ indicator: '7' }).text, [signer.key])).toBeNull();
  });
});

describe('decimal and text helpers', () => {
  it('turns a decimal number into big-endian bytes', () => {
    expect(Array.from(decimalToBytes('65535'))).toEqual([255, 255]);
    expect(Array.from(decimalToBytes('256'))).toEqual([1, 0]);
  });

  it('decodes UTF-8 and falls back to Latin-1', () => {
    expect(decodeText(Buffer.from('रमेश', 'utf8'))).toBe('रमेश');
    expect(decodeText(Buffer.from([0x4a, 0xe9, 0x72]))).toBe('Jér');
  });
});

describe('checkQrText', () => {
  it('reports a signed Secure QR as verified, and never keeps the full payload in the summary', () => {
    const { text } = securePayload();
    const check = checkQrText(text, [signer.key]);
    expect(check.result).toBe('aadhaar_verified');
    expect(suggestedDocumentType(check)).toBe('aadhaar_like');
    const summary = summariseQrCheck(check, new Date('2026-11-26T10:00:00Z'));
    expect(summary).toEqual({ result: 'aadhaar_verified', checkedAt: '2026-11-26T10:00:00.000Z' });
    expect(JSON.stringify(summary)).not.toContain('Test');
  });

  it('reports an unknown signer as unconfirmed, not fake', () => {
    expect(checkQrText(securePayload().text).result).toBe('aadhaar_unconfirmed');
  });

  it('reads the old XML QR as unsigned and keeps only the last four digits', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><PrintLetterBarcodeData uid="999988887777" name="Test Person" gender="F" yob="1985" co="D/O Sample" vtc="Sample Town" dist="Sample" state="Delhi" pc="110001"/>';
    const check = checkQrText(xml);
    expect(check.result).toBe('aadhaar_unsigned');
    if (check.result !== 'aadhaar_unsigned') return;
    expect(check.details).toMatchObject({
      name: 'Test Person',
      aadhaarLast4: '7777',
      dateOfBirth: '1985',
    });
    expect(JSON.stringify(check)).not.toContain('99998888');
  });

  it('tells government links from other links', () => {
    const official = checkQrText('https://edistrict.example-state.gov.in/verify?cert=TEST123');
    expect(official).toMatchObject({
      result: 'official_link',
      host: 'edistrict.example-state.gov.in',
    });
    expect(summariseQrCheck(official, new Date(0))).toEqual({
      result: 'official_link',
      checkedAt: '1970-01-01T00:00:00.000Z',
      host: 'edistrict.example-state.gov.in',
    });
    expect(checkQrText('Verify at http://sample.nic.in/c/1').result).toBe('official_link');
    expect(checkQrText('https://gov.in.example.com/verify').result).toBe('other_link');
    expect(checkQrText('https://fakegov.in/verify').result).toBe('other_link');
  });

  it('reads a PAN in text with its middle hidden', () => {
    const check = checkQrText('Name: TEST PERSON\nDOB: 01/01/1990\nPAN: ABCPE1234F');
    expect(check).toMatchObject({
      result: 'pan_text',
      details: { panMasked: 'ABCPE••••F', name: 'TEST PERSON', dateOfBirth: '01/01/1990' },
    });
    expect(JSON.stringify(check)).not.toContain('1234');
    expect(suggestedDocumentType(check)).toBe('pan');
  });

  it('calls anything else unrecognised', () => {
    expect(checkQrText('hello').result).toBe('unrecognised');
    expect(checkQrText('').result).toBe('unrecognised');
  });
});

describe('isOfficialHost and findLink', () => {
  it('accepts only gov.in and nic.in and their sub-domains', () => {
    expect(isOfficialHost('gov.in')).toBe(true);
    expect(isOfficialHost('digilocker.gov.in')).toBe(true);
    expect(isOfficialHost('EDISTRICT.UP.GOV.IN')).toBe(true);
    expect(isOfficialHost('x.nic.in')).toBe(true);
    expect(isOfficialHost('govin.com')).toBe(false);
    expect(isOfficialHost('xn--gv-ufa.gov.in')).toBe(false);
    expect(isOfficialHost('evil.com/.gov.in')).toBe(false);
    expect(isOfficialHost('.gov.in')).toBe(false);
  });

  it('never treats a link with a user name as official', () => {
    const link = findLink('https://digilocker.gov.in@evil.example/verify');
    expect(link?.host).toBe('digilocker.gov.in@evil.example');
    expect(isOfficialHost(link?.host ?? '')).toBe(false);
    expect(checkQrText('https://digilocker.gov.in@evil.example/verify').result).toBe('other_link');
  });

  it('drops ports, a trailing dot and trailing punctuation', () => {
    expect(findLink('(see https://a.gov.in:8443/x).')).toEqual({
      url: 'https://a.gov.in:8443/x',
      host: 'a.gov.in',
    });
    expect(findLink('http://a.gov.in./x')?.host).toBe('a.gov.in');
    expect(findLink('no link here')).toBeNull();
  });
});

describe('strongestCheck and namesMatch', () => {
  it('prefers a verified Secure QR over a link', () => {
    const link = checkQrText('https://example.com');
    const verified = checkQrText(securePayload().text, [signer.key]);
    expect(strongestCheck([link, verified])?.result).toBe('aadhaar_verified');
    expect(strongestCheck([])).toBeNull();
  });

  it('matches names the way a person reads them', () => {
    expect(namesMatch('TEST KUMAR SAMPLE', 'Test Kumar  Sample')).toBe(true);
    expect(namesMatch('TEST KUMAR', 'T. Kumar')).toBe(true);
    expect(namesMatch('TEST KUMAR', 'Other Kumar')).toBe(false);
    expect(namesMatch('TEST KUMAR', undefined)).toBeNull();
  });
});

/** Draws a QR code's modules into a white page at `scale` pixels a module. */
function pageWithQr(
  text: string,
  page: { width: number; height: number },
  at: { x: number; y: number },
  scale: number,
): GrayImage {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const pixels = new Uint8Array(page.width * page.height).fill(255);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!qr.modules.get(row, col)) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        const y = at.y + row * scale + dy;
        pixels.fill(
          0,
          y * page.width + at.x + col * scale,
          y * page.width + at.x + (col + 1) * scale,
        );
      }
    }
  }
  return { width: page.width, height: page.height, pixels };
}

describe('scanRegions', () => {
  it('is a single pass for small images', () => {
    expect(scanRegions(800, 600)).toEqual([{ x: 0, y: 0, width: 800, height: 600, step: 1 }]);
  });

  it('covers a large page with full-resolution tiles that overlap', () => {
    const regions = scanRegions(2480, 3508);
    expect(regions[0]?.step).toBeGreaterThan(1);
    const tiles = regions.slice(1);
    expect(tiles.every((tile) => tile.step === 1)).toBe(true);
    expect(Math.max(...tiles.map((tile) => tile.x + tile.width))).toBe(2480);
    expect(Math.max(...tiles.map((tile) => tile.y + tile.height))).toBe(3508);
    expect(Math.min(...tiles.map((tile) => tile.y))).toBe(0);
    // Bottom row first: codes sit at the foot of letters and certificates.
    expect(tiles[0]?.y).toBe(3508 - 1400);
  });
});

describe('findQrCodes and checkPageImage', () => {
  it('finds a small, dense Secure QR on a full A4 page and verifies it', async () => {
    const { text } = securePayload();
    const image = pageWithQr(text, { width: 2480, height: 3508 }, { x: 1700, y: 2800 }, 4);
    const codes = await findQrCodes(image, { maxCodes: 1 });
    expect(codes).toEqual([text]);
    const check = await checkPageImage(image);
    // UIDAI's keys did not sign the test code: found and read, but not confirmed.
    expect(check?.result).toBe('aadhaar_unconfirmed');
  }, 60_000);

  it('finds a large certificate link in the overview pass', async () => {
    const image = pageWithQr(
      'https://edistrict.example.gov.in/v/TEST1',
      { width: 1600, height: 2200 },
      { x: 600, y: 900 },
      10,
    );
    const check = await checkPageImage(image);
    expect(check).toMatchObject({ result: 'official_link', host: 'edistrict.example.gov.in' });
  }, 60_000);

  it('returns nothing for a blank page, and stops when cancelled', async () => {
    const blank = { width: 500, height: 500, pixels: new Uint8Array(500 * 500).fill(255) };
    expect(await checkPageImage(blank)).toBeNull();
    const image = pageWithQr(
      'https://a.gov.in/x',
      { width: 600, height: 600 },
      { x: 100, y: 100 },
      8,
    );
    expect(await findQrCodes(image, { cancelled: () => true })).toEqual([]);
    expect(await findQrCodes({ width: 10, height: 10, pixels: new Uint8Array(5) })).toEqual([]);
  });
});
