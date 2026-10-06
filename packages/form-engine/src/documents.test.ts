import { describe, expect, it } from 'vitest';
import {
  documentCategoryForType,
  fileMatchesAccept,
  inferFileFieldCategory,
  inferFileFieldSlot,
  matchDocumentRequirements,
} from './documents';
import type { PortalAdapter } from './adapters';
import type { DetectedField } from './types';

let order = 0;

function field(overrides: Partial<DetectedField> & { signature: string }): DetectedField {
  return {
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
    frame: 0,
    order: order++,
    ...overrides,
  };
}

function adapter(overrides: Partial<PortalAdapter> & { slug: string }): PortalAdapter {
  return {
    id: `id-${overrides.slug}`,
    portalName: 'Demo Portal',
    formName: 'Application',
    urlPatterns: ['https://demo.assistigo.test/**'],
    version: '1.0.0',
    status: 'active',
    fields: [],
    documentRequirements: [],
    ...overrides,
  };
}

describe('inferFileFieldCategory', () => {
  it('reads the label first', () => {
    const f = field({ signature: 's1', labelText: 'Upload your Photograph' });
    expect(inferFileFieldCategory(f)).toBe('photo');
  });

  it('recognizes a Hindi signature label', () => {
    const f = field({ signature: 's2', labelText: 'हस्ताक्षर अपलोड करें' });
    expect(inferFileFieldCategory(f)).toBe('signature');
  });

  it('prefers "signature" over "photo" when a section heading mentions both', () => {
    const f = field({
      signature: 's3',
      labelText: 'Signature',
      sectionHeading: 'Photo & Signature Upload',
    });
    expect(inferFileFieldCategory(f)).toBe('signature');
  });

  it('falls back to the accept attribute when there is no textual signal', () => {
    const f = field({ signature: 's4', accept: 'application/pdf' });
    expect(inferFileFieldCategory(f)).toBe('pdf');
  });

  it('prefers label text over a generic image accept attribute', () => {
    const f = field({ signature: 's5', labelText: 'Signature scan', accept: 'image/*' });
    expect(inferFileFieldCategory(f)).toBe('signature');
  });

  it('returns null for an unrecognizable file field rather than guessing "pdf"', () => {
    // No label text, accept attribute, or adapter requirement to go on — the shape of a portal's
    // hidden/internal file input, which should not surface a phantom document-attachment card.
    const f = field({ signature: 's6', labelText: 'Supporting document' });
    expect(inferFileFieldCategory(f)).toBeNull();
  });

  it('returns null for a non-file field even with a matching label', () => {
    const f = field({ signature: 's7', inputType: 'text', labelText: 'Photo' });
    expect(inferFileFieldCategory(f)).toBeNull();
  });

  it.each([
    'Aadhaar Card',
    'PAN Card',
    'Upload ID Proof',
    'Voter ID',
    'Marksheet',
    'Class 10 Certificate',
    'Address Proof',
    'Income Certificate',
    'Caste Certificate',
    'Domicile Certificate',
    'Ration Card',
  ])('recognizes "%s" as a pdf/document upload', (labelText) => {
    const f = field({ signature: `s-${labelText}`, labelText });
    expect(inferFileFieldCategory(f)).toBe('pdf');
  });
});

describe('inferFileFieldSlot — specific document types', () => {
  it.each([
    ['Aadhaar Card', 'aadhaar_like'],
    ['आधार कार्ड अपलोड करें', 'aadhaar_like'],
    ['PAN Card', 'pan'],
    ['Voter ID (EPIC)', 'voter_id'],
    ['Class 10 Marksheet', 'marksheet_10'],
    ['Matriculation certificate', 'marksheet_10'],
    ['10th Pass Certificate', 'marksheet_10'],
    ['Class XII Marksheet', 'marksheet_12'],
    ['Intermediate marksheet', 'marksheet_12'],
    ['Senior Secondary certificate', 'marksheet_12'],
    ['Graduation degree', 'marksheet_graduation'],
    ['Caste Certificate', 'caste_certificate'],
    ['जाति प्रमाण पत्र', 'caste_certificate'],
    ['Income Certificate', 'income_certificate'],
    ['आय प्रमाण पत्र', 'income_certificate'],
    ['Domicile Certificate', 'residence_certificate'],
    ['निवास प्रमाण पत्र', 'residence_certificate'],
    ['Fee receipt', 'receipt'],
    ['Photograph', 'photo'],
    ['Signature', 'signature'],
  ] as const)('reads "%s" as %s', (labelText, documentType) => {
    const slot = inferFileFieldSlot(field({ signature: `t-${labelText}`, labelText }));
    expect(slot?.documentType).toBe(documentType);
  });

  it('keeps a document slot that names no single type as a plain pdf slot', () => {
    // An address proof can be an Aadhaar, a voter ID or a residence certificate.
    for (const labelText of ['Address Proof', 'Marksheet', 'Ration Card', 'Upload ID Proof']) {
      expect(inferFileFieldSlot(field({ signature: `g-${labelText}`, labelText }))).toEqual({
        category: 'pdf',
        documentType: null,
      });
    }
  });

  it('does not read "photo" as an adjective as a photograph slot', () => {
    expect(inferFileFieldSlot(field({ signature: 'p1', labelText: 'Photo ID proof' }))).toEqual({
      category: 'pdf',
      documentType: null,
    });
    expect(
      inferFileFieldSlot(field({ signature: 'p2', labelText: 'Photo copy of 10th marksheet' })),
    ).toEqual({ category: 'pdf', documentType: 'marksheet_10' });
  });

  it('lets the label beat a heading that names a different slot', () => {
    // Run together, "Photo & Signature" in the heading used to make this a signature box.
    const slot = inferFileFieldSlot(
      field({ signature: 'h1', labelText: 'Photograph', sectionHeading: 'Photo & Signature' }),
    );
    expect(slot).toEqual({ category: 'photo', documentType: 'photo' });
  });

  it('takes the specific type from table-row text when the label is only generic', () => {
    const slot = inferFileFieldSlot(
      field({ signature: 'r1', labelText: 'Certificate', nearbyText: 'Income Certificate Choose file' }),
    );
    expect(slot).toEqual({ category: 'pdf', documentType: 'income_certificate' });
  });

  it('never takes the specific type from the section heading', () => {
    // RTPS Bihar: every upload box sits under the form's own title.
    const slot = inferFileFieldSlot(
      field({
        signature: 'r2',
        labelText: 'Supporting document upload',
        sectionHeading: 'Income Certificate Application',
      }),
    );
    expect(slot).toEqual({ category: 'pdf', documentType: null });
  });

  it('reads the identifiers portals generate', () => {
    expect(inferFileFieldSlot(field({ signature: 'n1', name: 'casteCertFile' }))?.documentType).toBe(
      'caste_certificate',
    );
    expect(inferFileFieldSlot(field({ signature: 'n2', id: 'upload_photo' }))?.documentType).toBe(
      'photo',
    );
  });

  it('never names a type from the accept attribute alone', () => {
    expect(inferFileFieldSlot(field({ signature: 'a1', accept: 'image/*' }))).toEqual({
      category: 'photo',
      documentType: null,
    });
  });

  it('maps every type onto the category its tool handles', () => {
    expect(documentCategoryForType('photo')).toBe('photo');
    expect(documentCategoryForType('signature')).toBe('signature');
    expect(documentCategoryForType('caste_certificate')).toBe('pdf');
    expect(documentCategoryForType('aadhaar_like')).toBe('pdf');
  });
});

describe('matchDocumentRequirements', () => {
  it('tells two pdf requirements apart by type, with no shared words', () => {
    const a = adapter({
      slug: 'rtps',
      documentRequirements: [
        { key: 'caste', label: 'Caste certificate', required: true },
        { key: 'income', label: 'Income certificate', required: true },
      ],
    });
    const matches = matchDocumentRequirements(
      [field({ signature: 'f1', labelText: 'आय प्रमाण पत्र' })],
      a,
    );
    expect(matches).toEqual([
      {
        signature: 'f1',
        category: 'pdf',
        documentType: 'income_certificate',
        requirement: a.documentRequirements[1],
      },
    ]);
  });

  it('picks the sole requirement in a matching category', () => {
    const a = adapter({
      slug: 'ssc',
      portalName: 'SSC',
      documentRequirements: [
        { key: 'photo', label: 'Photograph', presetCode: 'ssc.photo', required: true },
      ],
    });
    const fields = [field({ signature: 'f1', labelText: 'Upload Photo' })];

    const matches = matchDocumentRequirements(fields, a);
    expect(matches).toEqual([
      {
        signature: 'f1',
        category: 'photo',
        documentType: 'photo',
        requirement: { key: 'photo', label: 'Photograph', presetCode: 'ssc.photo', required: true },
      },
    ]);
  });

  it('disambiguates two requirements of different categories by label overlap', () => {
    const a = adapter({
      slug: 'nta',
      portalName: 'NTA',
      documentRequirements: [
        { key: 'photo', label: 'Passport photo', presetCode: 'nta.photo', required: true },
        { key: 'sign', label: 'Signature', presetCode: 'nta.signature', required: true },
      ],
    });
    const fields = [
      field({ signature: 'f1', labelText: 'Candidate signature' }),
      field({ signature: 'f2', labelText: 'Recent passport size photo' }),
    ];

    const matches = matchDocumentRequirements(fields, a);
    expect(matches.find((m) => m.signature === 'f1')?.requirement?.key).toBe('sign');
    expect(matches.find((m) => m.signature === 'f2')?.requirement?.key).toBe('photo');
  });

  it('leaves requirement null when the adapter has none, but still reports the category', () => {
    const matches = matchDocumentRequirements(
      [field({ signature: 'f1', labelText: 'Signature' })],
      null,
    );
    expect(matches).toEqual([
      { signature: 'f1', category: 'signature', documentType: 'signature', requirement: null },
    ]);
  });

  it('skips fields with no inferable category rather than guessing "pdf"', () => {
    const matches = matchDocumentRequirements(
      [field({ signature: 'f1', labelText: 'Supporting document' })],
      undefined,
    );
    expect(matches).toEqual([]);
  });

  it('skips non-file fields entirely', () => {
    const matches = matchDocumentRequirements(
      [field({ signature: 'f1', inputType: 'text', labelText: 'Full name' })],
      undefined,
    );
    expect(matches).toEqual([]);
  });

  it('skips a file field that is not visible on the page', () => {
    // RTPS Bihar's hidden representative-authorization and internal-uploader widgets: a real
    // category match (labelText: 'Photo'), but not visible, so it must not surface a card.
    const matches = matchDocumentRequirements(
      [field({ signature: 'f1', labelText: 'Photo', visible: false })],
      undefined,
    );
    expect(matches).toEqual([]);
  });
});

describe('fileMatchesAccept', () => {
  const photo = { filename: 'photo_ssc.jpg', mimeType: 'image/jpeg' };
  const pdf = { filename: 'domicile.pdf', mimeType: 'application/pdf' };

  it('accepts anything when the attribute is absent, empty or a wildcard', () => {
    expect(fileMatchesAccept(null, photo)).toBe(true);
    expect(fileMatchesAccept(undefined, photo)).toBe(true);
    expect(fileMatchesAccept('', photo)).toBe(true);
    expect(fileMatchesAccept('  ', photo)).toBe(true);
    expect(fileMatchesAccept('*', pdf)).toBe(true);
    expect(fileMatchesAccept('*/*', pdf)).toBe(true);
  });

  it('matches a MIME group wildcard', () => {
    expect(fileMatchesAccept('image/*', photo)).toBe(true);
    expect(fileMatchesAccept('image/*', pdf)).toBe(false);
  });

  it('matches an exact MIME type', () => {
    expect(fileMatchesAccept('image/jpeg', photo)).toBe(true);
    expect(fileMatchesAccept('image/png', photo)).toBe(false);
    expect(fileMatchesAccept('application/pdf', pdf)).toBe(true);
  });

  it('matches a file extension, case-insensitively', () => {
    expect(fileMatchesAccept('.jpg,.jpeg', photo)).toBe(true);
    expect(fileMatchesAccept('.JPG', photo)).toBe(true);
    expect(fileMatchesAccept('.png', photo)).toBe(false);
    expect(fileMatchesAccept('.pdf', pdf)).toBe(true);
  });

  it('accepts when any one token in a list matches', () => {
    expect(fileMatchesAccept('.pdf, image/jpeg', photo)).toBe(true);
    expect(fileMatchesAccept('image/png, .gif, application/pdf', pdf)).toBe(true);
    expect(fileMatchesAccept('image/png, .gif', photo)).toBe(false);
  });

  it('tolerates the whitespace and casing portals actually write', () => {
    expect(fileMatchesAccept('  IMAGE/JPEG  ,  .PDF ', photo)).toBe(true);
  });

  /*
   * A portal that writes `accept="jpg"` — no dot, not a MIME type — means JPEGs. Treating that
   * as a rejection would block an attachment the box would in fact have taken, so a malformed
   * token is ignored; if every token is malformed the attribute is treated as saying nothing.
   */
  it('ignores malformed tokens rather than reading them as a rejection', () => {
    expect(fileMatchesAccept('jpg', photo)).toBe(true);
    expect(fileMatchesAccept('jpg, png', pdf)).toBe(true);
    expect(fileMatchesAccept('jpg, .pdf', pdf)).toBe(true);
    // One usable token that does not match still rejects.
    expect(fileMatchesAccept('jpg, .pdf', photo)).toBe(false);
  });

  it('rejects a file with no MIME type against a type-based accept', () => {
    expect(fileMatchesAccept('image/*', { filename: 'scan', mimeType: '' })).toBe(false);
    expect(fileMatchesAccept('image/jpeg', { filename: 'scan', mimeType: '' })).toBe(false);
    // The extension is still enough to place it.
    expect(fileMatchesAccept('.jpg', { filename: 'scan.jpg', mimeType: '' })).toBe(true);
  });
});
