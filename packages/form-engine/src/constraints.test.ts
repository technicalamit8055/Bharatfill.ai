import { describe, expect, it } from 'vitest';
import {
  acceptFromFormats,
  describeUploadConstraints,
  mergeUploadConstraints,
  parseUploadConstraints,
  resolveUploadTarget,
} from './constraints';
import { detectedFieldSchema } from './types';
import { fileMatchesAccept } from './documents';

const KB = 1024;
const MB = 1024 * KB;

function sizes(text: string) {
  const parsed = parseUploadConstraints(text);
  return { min: parsed?.minBytes ?? null, max: parsed?.maxBytes ?? null };
}

describe('parseUploadConstraints — size windows', () => {
  it.each([
    ['Between 50 KB and 200 KB', 50, 200],
    ['50 KB to 200 KB', 50, 200],
    ['Size: 20kb - 50kb', 20, 50],
    ['20–50 KB', 20, 50],
    ['between 10 and 100 kb', 10, 100],
    ['Size (in KB) 10-200', 10, 200],
    ['50 KB से 200 KB के बीच', 50, 200],
    ['Minimum 10 KB, maximum 200 KB', 10, 200],
    ['min 4KB max 30KB', 4, 30],
    ['not less than 10 KB and not more than 40 KB', 10, 40],
  ])('reads %j as a %i–%i KB window', (text, min, max) => {
    expect(sizes(text)).toEqual({ min: min * KB, max: max * KB });
  });

  it.each([
    ['Max 200 KB', 200 * KB],
    ['(max. 2MB)', 2 * MB],
    ['Maximum file size should be 300 KB', 300 * KB],
    ['File size should not exceed 100 kb', 100 * KB],
    ['Upload up to 1.5 MB', 1.5 * MB],
    ['less than 50 KB', 50 * KB],
    ['≤ 500 KB', 500 * KB],
    ['Max Size (KB): 200', 200 * KB],
    ['200 KB or less', 200 * KB],
    ['Files more than 200 KB will be rejected', 200 * KB],
    ['अधिकतम 100 KB', 100 * KB],
    ['१०० केबी तक', 100 * KB],
    ['200 KB से अधिक नहीं', 200 * KB],
    ['फ़ाइल ज़्यादा से ज़्यादा 300 KB', 300 * KB],
  ])('reads %j as a maximum', (text, max) => {
    expect(sizes(text)).toEqual({ min: null, max: Math.round(max) });
  });

  it.each([
    ['at least 10 KB', 10 * KB],
    ['Minimum 20 KB', 20 * KB],
    ['should be more than 5 KB', 5 * KB],
    ['न्यूनतम 10 KB', 10 * KB],
    ['10 KB से कम नहीं', 10 * KB],
  ])('reads %j as a minimum', (text, min) => {
    expect(sizes(text)).toEqual({ min, max: null });
  });

  it('ignores a size that does not say which end of the window it is', () => {
    expect(parseUploadConstraints('File size: 180 KB')).toBeNull();
    expect(parseUploadConstraints('Uploaded 180 KB')).toBeNull();
  });

  it('ignores a size inside a filename', () => {
    expect(parseUploadConstraints('max photo_200kb.jpg')).toBeNull();
    expect(parseUploadConstraints('Max scan200kb')).toBeNull();
  });

  it('trusts neither end when one text describes several boxes', () => {
    const parsed = parseUploadConstraints('Photo: 20 KB to 50 KB, Signature: 10 KB to 20 KB');
    expect(parsed).toBeNull();
  });

  it('treats two readings of one limit as one limit', () => {
    expect(sizes('Max 200 KB (max 0.2 MB)').max).toBe(200 * KB);
  });

  it('drops a minimum at or over the maximum', () => {
    expect(sizes('min 300 KB, max 200 KB')).toEqual({ min: null, max: 200 * KB });
  });

  it('keeps each size to its own clause', () => {
    expect(sizes('Photo max 50 KB. Signature 20 KB')).toEqual({ min: null, max: 50 * KB });
  });

  it('refuses implausible numbers', () => {
    expect(parseUploadConstraints('max 5000 MB')).toBeNull();
  });
});

describe('parseUploadConstraints — formats', () => {
  it.each([
    ['Format: JPEG/PDF', ['jpeg', 'pdf']],
    ['JPG/JPEG only', ['jpeg']],
    ['(.jpg, .png)', ['jpeg', 'png']],
    ['Upload in PDF format', ['pdf']],
    ['File type: jpg,jpeg,pdf', ['jpeg', 'pdf']],
    ['Caste certificate (PDF)', ['pdf']],
    ['केवल PDF', ['pdf']],
    ['image/jpeg, application/pdf', ['jpeg', 'pdf']],
  ])('reads %j', (text, formats) => {
    expect(parseUploadConstraints(text)?.formats).toEqual(formats);
  });

  it('does not read a format from a filename', () => {
    expect(parseUploadConstraints('photo.jpg uploaded')).toBeNull();
    expect(parseUploadConstraints('Format: see notice — aadhaar_front.pdf')).toBeNull();
  });

  it('does not read a lone passing mention as a rule', () => {
    expect(parseUploadConstraints('Upload PDF of the certificate')).toBeNull();
  });

  it('reads size and format together', () => {
    expect(parseUploadConstraints('Photo (JPG, 20 KB – 50 KB)')).toEqual({
      minBytes: 20 * KB,
      maxBytes: 50 * KB,
      formats: ['jpeg'],
    });
  });
});

describe('mergeUploadConstraints', () => {
  it('takes each end and the formats from the strongest source that states them', () => {
    expect(
      mergeUploadConstraints([
        { minBytes: null, maxBytes: 50 * KB, formats: ['jpeg'] },
        null,
        { minBytes: 20 * KB, maxBytes: 200 * KB, formats: ['pdf'] },
      ]),
    ).toEqual({ minBytes: 20 * KB, maxBytes: 50 * KB, formats: ['jpeg'] });
  });

  it('returns null when nothing said anything', () => {
    expect(mergeUploadConstraints([null, undefined])).toBeNull();
  });
});

describe('resolveUploadTarget', () => {
  const page = { minBytes: 50 * KB, maxBytes: 200 * KB, formats: ['pdf' as const] };

  it('prefers a preset window', () => {
    expect(
      resolveUploadTarget(
        { accept: null, uploadConstraints: page },
        { minBytes: 10 * KB, maxBytes: 100 * KB },
      ),
    ).toMatchObject({ minBytes: 10 * KB, maxBytes: 100 * KB, sizeSource: 'preset' });
  });

  it('falls back to the page when no preset states a size', () => {
    for (const preset of [null, { minBytes: null, maxBytes: null }]) {
      expect(resolveUploadTarget({ accept: null, uploadConstraints: page }, preset)).toEqual({
        accept: '.pdf,application/pdf',
        minBytes: 50 * KB,
        maxBytes: 200 * KB,
        sizeSource: 'page',
      });
    }
  });

  it('lets the box’s own accept attribute beat page-stated formats', () => {
    expect(
      resolveUploadTarget({ accept: 'image/*', uploadConstraints: page }, null).accept,
    ).toBe('image/*');
  });

  it('says nothing when nothing stated anything', () => {
    expect(resolveUploadTarget({ accept: null }, null)).toEqual({
      accept: null,
      minBytes: null,
      maxBytes: null,
      sizeSource: null,
    });
  });
});

describe('acceptFromFormats', () => {
  it('builds an accept string fileMatchesAccept honours', () => {
    const accept = acceptFromFormats(['jpeg']);
    expect(fileMatchesAccept(accept, { filename: 'a.jpg', mimeType: 'image/jpeg' })).toBe(true);
    expect(fileMatchesAccept(accept, { filename: 'a.png', mimeType: 'image/png' })).toBe(false);
    expect(acceptFromFormats([])).toBeNull();
  });
});

describe('describeUploadConstraints', () => {
  it.each([
    [{ minBytes: 50 * KB, maxBytes: 200 * KB, formats: ['jpeg', 'pdf'] }, '50–200 KB · JPEG or PDF'],
    [{ minBytes: null, maxBytes: 2 * MB, formats: [] }, 'up to 2 MB'],
    [{ minBytes: 10 * KB, maxBytes: null, formats: ['jpeg', 'png', 'pdf'] }, 'at least 10 KB · JPEG, PNG or PDF'],
    [{ minBytes: 500 * KB, maxBytes: 1.5 * MB, formats: [] }, '500 KB–1.5 MB'],
  ] as const)('describes %j', (constraints, text) => {
    expect(describeUploadConstraints({ ...constraints, formats: [...constraints.formats] })).toBe(text);
  });
});

describe('detectedFieldSchema — uploadConstraints', () => {
  const base = {
    signature: 'x',
    tagName: 'input',
    inputType: 'file',
    name: null,
    id: null,
    placeholder: null,
    labelText: null,
    ariaLabel: null,
    nearbyText: null,
    sectionHeading: null,
    options: null,
    required: false,
    maxLength: null,
    pattern: null,
    accept: null,
    hasValue: false,
    visible: true,
    disabled: false,
    readOnly: false,
    order: 0,
  };

  it('accepts a payload from an older build that does not send it', () => {
    expect(detectedFieldSchema.safeParse(base).success).toBe(true);
  });

  it('accepts numbers and known formats only', () => {
    expect(
      detectedFieldSchema.safeParse({
        ...base,
        uploadConstraints: { minBytes: 10, maxBytes: 20, formats: ['pdf'] },
      }).success,
    ).toBe(true);
    expect(
      detectedFieldSchema.safeParse({
        ...base,
        uploadConstraints: { minBytes: null, maxBytes: null, formats: ['Max 200 KB'] },
      }).success,
    ).toBe(false);
  });
});
