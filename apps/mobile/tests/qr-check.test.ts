/**
 * DigiLocker / e-Aadhaar import and QR verification on the phone: the e-Aadhaar password rule,
 * how a check reads on screen, when Save checks by itself, and what the vault keeps. Names and
 * numbers here are made up.
 */

import { checkQrText, summariseQrCheck } from '@assistigo/document-tools/qr';
import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import {
  cleanNameLetters,
  eAadhaarPasswords,
  isBirthYear,
  looksLikeEAadhaarFile,
  nameLettersFor,
} from '../lib/scan/e-aadhaar';
import {
  liveQrCheckView,
  maskedAadhaar,
  qrCheckCopyKeys,
  shouldAutoCheckQr,
  storedQrCheckView,
} from '../lib/scan/qr-check-view';
import {
  EMPTY_VAULT_INDEX,
  findDocument,
  parseVaultIndex,
  serialiseVaultIndex,
  type VaultDocument,
  withDocument,
  withQrCheck,
} from '../lib/vault/vault-index';

const NOW = new Date('2026-11-26T10:00:00Z');

function lookup(messages: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (typeof node !== 'object' || node === null) return undefined;
    return (node as Record<string, unknown>)[part];
  }, messages);
}

describe('e-Aadhaar password', () => {
  it('spots UIDAI and DigiLocker file names without needing the number', () => {
    expect(looksLikeEAadhaarFile('EAadhaar_0000XXXX1234_26112026.pdf')).toBe(true);
    expect(looksLikeEAadhaarFile('e-aadhar.pdf')).toBe(true);
    expect(looksLikeEAadhaarFile('in.gov.uidai-ADHAR-123.pdf')).toBe(true);
    expect(looksLikeEAadhaarFile('bank-statement.pdf')).toBe(false);
    expect(looksLikeEAadhaarFile(null)).toBe(false);
  });

  it('takes the first four letters of the name in capitals', () => {
    expect(nameLettersFor('Suresh Kumar')).toBe('SURE');
    expect(nameLettersFor('Ria')).toBe('RIA');
    expect(nameLettersFor('P. Kumar')).toBe('P.KU');
    expect(nameLettersFor('रमेश')).toBe('');
    expect(nameLettersFor(null)).toBe('');
    expect(cleanNameLetters('ab1cde')).toBe('ABCD');
  });

  it('builds the password from the letters and a plausible year', () => {
    expect(eAadhaarPasswords('SURE', '1990', 'Suresh Kumar', NOW)).toEqual(['SURE1990']);
    expect(eAadhaarPasswords('ria', '2001', null, NOW)).toEqual(['RIA2001']);
    expect(eAadhaarPasswords('SURE', '199', null, NOW)).toEqual([]);
    expect(eAadhaarPasswords('SURE', '2099', null, NOW)).toEqual([]);
    expect(eAadhaarPasswords('', '1990', null, NOW)).toEqual([]);
  });

  it('tries both readings of a name with an initial, no more', () => {
    expect(eAadhaarPasswords('P.KU', '1985', 'P. Kumar', NOW)).toEqual(['P.KU1985', 'PKUM1985']);
  });

  it('accepts years from 1900 to this year', () => {
    expect(isBirthYear('1900', NOW)).toBe(true);
    expect(isBirthYear('2026', NOW)).toBe(true);
    expect(isBirthYear('1899', NOW)).toBe(false);
    expect(isBirthYear('19a0', NOW)).toBe(false);
  });
});

describe('QR check views', () => {
  it('shows a government link with its host and the link to open', () => {
    const view = liveQrCheckView(checkQrText('https://edistrict.sample.gov.in/v?c=TEST1'));
    expect(view).toMatchObject({
      tone: 'info',
      titleKey: 'qrCheck.title.official_link',
      values: { host: 'edistrict.sample.gov.in' },
      url: 'https://edistrict.sample.gov.in/v?c=TEST1',
      rows: [],
    });
  });

  it('warns about other links and lists an old Aadhaar QR’s details masked', () => {
    expect(liveQrCheckView(checkQrText('https://example.com/x')).tone).toBe('warning');
    const view = liveQrCheckView(
      checkQrText('<PrintLetterBarcodeData uid="999988887777" name="Test Person" yob="1985"/>'),
    );
    expect(view.tone).toBe('neutral');
    expect(view.rows).toContainEqual({
      labelKey: 'qrCheck.fields.aadhaar',
      value: maskedAadhaar('7777'),
    });
    expect(JSON.stringify(view)).not.toContain('99998888');
  });

  it('points a PAN without a readable code to the department’s reader', () => {
    expect(liveQrCheckView(checkQrText('opaque'), 'pan').bodyKey).toBe(
      'qrCheck.body.unrecognisedPan',
    );
    expect(storedQrCheckView({ result: 'unrecognised' }, 'pan').bodyKey).toBe(
      'qrCheck.body.unrecognisedPan',
    );
  });

  it('shows a stored check without any details', () => {
    const view = storedQrCheckView({ result: 'aadhaar_verified' });
    expect(view).toMatchObject({ tone: 'success', rows: [], url: null });
  });

  it('has every copy key in English and Hindi', () => {
    const keys = [
      ...qrCheckCopyKeys(),
      'qrCheck.title.idle',
      'qrCheck.title.none',
      'qrCheck.body.idle',
      'qrCheck.body.none',
      'qrCheck.checking',
      'qrCheck.check',
      'qrCheck.checkAgain',
      'qrCheck.checkedOn',
      'qrCheck.showDetails',
      'qrCheck.hideDetails',
      'qrCheck.detailsNote',
      'qrCheck.openLink',
      'qrCheck.openFailedTitle',
      'qrCheck.openFailed',
      'qrCheck.otherLinkTitle',
      'qrCheck.otherLinkBody',
      'qrCheck.openAnyway',
      'importFiles.official.label',
      'importFiles.official.caption',
      'importFiles.official.open',
      'importFiles.official.openHint',
      'importFiles.password.aadhaarTitle',
      'importFiles.password.aadhaarBody',
      'importFiles.password.lettersLabel',
      'importFiles.password.lettersHint',
      'importFiles.password.yearLabel',
      'importFiles.password.aadhaarWrong',
      'importFiles.password.aadhaarExample',
      'importFiles.password.usePassword',
      'importFiles.password.useAadhaar',
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(hi, key), `hi ${key}`).toBe('string');
    }
  });

  it('never calls an unconfirmed code fake', () => {
    for (const messages of [en.qrCheck, hi.qrCheck]) {
      const text = `${messages.title.aadhaar_unconfirmed} ${messages.body.aadhaar_unconfirmed}`;
      expect(text.toLowerCase()).not.toMatch(/fake|forged|नकली|जाली/);
    }
  });
});

describe('shouldAutoCheckQr', () => {
  it('checks PDFs, ID cards and documents that carry an official QR', () => {
    expect(
      shouldAutoCheckQr({ pageSources: ['pdf'], preset: 'document', documentType: null }),
    ).toBe(true);
    expect(
      shouldAutoCheckQr({ pageSources: ['camera'], preset: 'id_card', documentType: null }),
    ).toBe(true);
    expect(
      shouldAutoCheckQr({
        pageSources: ['camera'],
        preset: 'document',
        documentType: 'income_certificate',
      }),
    ).toBe(true);
  });

  it('leaves other scans to the "Check QR code" button', () => {
    expect(
      shouldAutoCheckQr({ pageSources: ['camera'], preset: 'document', documentType: null }),
    ).toBe(false);
    expect(
      shouldAutoCheckQr({ pageSources: ['gallery'], preset: 'photo', documentType: 'photo' }),
    ).toBe(false);
  });
});

describe('the vault keeps only the summary', () => {
  const DOCUMENT: VaultDocument = {
    id: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-11-01T10:00:00.000Z',
    source: 'gallery',
    pages: [{ mimeType: 'image/jpeg' }],
  };

  it('stores, round-trips and clears a check', () => {
    const summary = summariseQrCheck(checkQrText('https://a.sample.gov.in/v?c=SECRET9'), NOW);
    const index = withQrCheck(withDocument(EMPTY_VAULT_INDEX, DOCUMENT), DOCUMENT.id, summary);
    const reread = parseVaultIndex(serialiseVaultIndex(index));
    expect(findDocument(reread ?? EMPTY_VAULT_INDEX, DOCUMENT.id)?.qrCheck).toEqual({
      result: 'official_link',
      checkedAt: NOW.toISOString(),
      host: 'a.sample.gov.in',
    });
    // The link's query (a certificate number) is never kept.
    expect(serialiseVaultIndex(index)).not.toContain('SECRET9');
    const cleared = withQrCheck(index, DOCUMENT.id, null);
    expect(findDocument(cleared, DOCUMENT.id)?.qrCheck).toBeUndefined();
  });

  it('refuses a stored check that is not one of the known results', () => {
    const index = withDocument(EMPTY_VAULT_INDEX, DOCUMENT);
    const json = serialiseVaultIndex(index).replace(
      '"pages":[{"mimeType":"image/jpeg"}]',
      '"pages":[{"mimeType":"image/jpeg"}],"qrCheck":{"result":"genuine","checkedAt":"2026-11-26T10:00:00.000Z"}',
    );
    expect(parseVaultIndex(json)).toBeNull();
  });
});
