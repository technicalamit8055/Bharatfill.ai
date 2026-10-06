import { describe, expect, it } from 'vitest';
import sscPortal from './adapters/ssc-portal.json';
import { portalAdapterSchema } from './adapters';
import { buildFillInstructions, proposeMappings, resolveFillValue } from './mapper';
import { expectedScript, scriptOf } from './script';
import type { DetectedField } from './types';

let order = 0;

function field(overrides: Partial<DetectedField> & { signature: string }): DetectedField {
  return {
    tagName: 'input',
    inputType: 'text',
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

function page(fields: DetectedField[], origin = 'https://demo.assistigo.test') {
  return {
    page: { origin, path: '/register', title: 'Registration', blockedFrames: 0 },
    fields,
  };
}

// Fake people only — never a real citizen's name.
const BILINGUAL = {
  'customer.full_name': 'Demo Kumar Verma',
  'customer.full_name_hi': 'डेमो कुमार वर्मा',
  'customer.father_name': 'परीक्षण प्रसाद',
  'customer.mother_name': 'Sample Devi',
};

describe('scriptOf', () => {
  it('tells Devanagari from Latin, and says nothing about digits', () => {
    expect(scriptOf('परीक्षण प्रसाद')).toBe('devanagari');
    expect(scriptOf('Sample Devi')).toBe('latin');
    expect(scriptOf('Sample परीक्षण')).toBe('devanagari');
    expect(scriptOf('110001')).toBeNull();
    expect(scriptOf('')).toBeNull();
  });
});

describe('expectedScript', () => {
  it('reads an explicit instruction in the label or the help text', () => {
    const english = field({ signature: 'a', labelText: "Father's Name (in English)" });
    expect(expectedScript(english, 'परीक्षण')).toEqual({ script: 'latin', strength: 'explicit' });

    const capitals = field({ signature: 'b', nearbyText: 'Write in CAPITAL LETTERS only' });
    expect(expectedScript(capitals, 'परीक्षण')?.strength).toBe('explicit');

    const hindi = field({ signature: 'c', labelText: 'Name in Hindi' });
    expect(expectedScript(hindi, 'Demo')).toEqual({ script: 'devanagari', strength: 'explicit' });
  });

  it('treats a label offering both scripts as saying nothing', () => {
    const either = field({ signature: 'a', labelText: 'Name (in English / in Hindi)' });
    expect(expectedScript(either, 'परीक्षण')).toBeNull();
  });

  it("reads a pattern that turns Hindi away as the page's own rule", () => {
    const patterned = field({ signature: 'a', labelText: 'Name', pattern: '[A-Za-z .]+' });
    expect(expectedScript(patterned, 'परीक्षण')).toEqual({ script: 'latin', strength: 'explicit' });
  });

  it('only infers English from a box labelled in English alone', () => {
    const englishLabel = field({ signature: 'a', labelText: "Father's Name" });
    expect(expectedScript(englishLabel, 'परीक्षण')).toEqual({
      script: 'latin',
      strength: 'inferred',
    });

    const bilingualLabel = field({ signature: 'b', labelText: "पिता का नाम / Father's Name" });
    expect(expectedScript(bilingualLabel, 'परीक्षण')).toBeNull();
  });

  it('lets an adapter declaration win over everything on the page', () => {
    const plain = field({ signature: 'a', labelText: 'पिता का नाम' });
    expect(expectedScript(plain, 'परीक्षण', 'latin')).toEqual({
      script: 'latin',
      strength: 'explicit',
    });
  });
});

describe('mapper — script guard', () => {
  it('blocks a Hindi value from a box that explicitly takes English', () => {
    const box = field({ signature: 'father', labelText: "Father's Name (in English)" });
    const [mapping] = proposeMappings({
      detection: page([box]),
      customerValues: BILINGUAL,
    }).mappings;

    expect(mapping).toMatchObject({
      customerField: 'customer.father_name',
      skipReason: 'script_mismatch',
      expectedScript: 'latin',
      reviewRequired: true,
    });
    // The Hindi spelling is never what the review table offers to type.
    expect(resolveFillValue(mapping!, BILINGUAL)).toBeNull();
  });

  it('fills a blocked box only with what the operator typed, in the right script', () => {
    const box = field({ signature: 'father', labelText: "Father's Name (in English)" });
    const { mappings } = proposeMappings({ detection: page([box]), customerValues: BILINGUAL });
    const approved = new Set(['father']);

    expect(buildFillInstructions(mappings, BILINGUAL, approved, [box])).toEqual([]);
    expect(
      buildFillInstructions(mappings, BILINGUAL, approved, [box], {
        edits: { father: 'परीक्षण प्रसाद' },
      }),
    ).toEqual([]);
    expect(
      buildFillInstructions(mappings, BILINGUAL, approved, [box], {
        edits: { father: 'Parikshan Prasad' },
      }),
    ).toEqual([{ signature: 'father', value: 'Parikshan Prasad', inputType: 'text' }]);
  });

  it('uses the other rendering of the name when the profile has it', () => {
    const box = field({ signature: 'name', labelText: 'Name in English', name: 'applicant_name' });
    const values = { ...BILINGUAL, 'customer.full_name': 'Demo Kumar Verma' };
    const hindiAdapter = portalAdapterSchema.parse({
      ...sscPortal,
      urlPatterns: ['https://demo.assistigo.test/**'],
      fields: [
        {
          key: 'name',
          customerField: 'customer.full_name_hi',
          labelPatterns: ['name in english'],
          inputType: 'text',
        },
      ],
    });

    const [mapping] = proposeMappings({
      detection: page([box]),
      customerValues: values,
      adapter: hindiAdapter,
    }).mappings;

    expect(mapping?.customerField).toBe('customer.full_name');
    expect(mapping?.skipReason).toBeUndefined();
  });

  it('only asks for review when the English-only hint is inferred', () => {
    const box = field({ signature: 'father', labelText: "Father's Name" });
    const [mapping] = proposeMappings({
      detection: page([box]),
      customerValues: BILINGUAL,
    }).mappings;

    expect(mapping?.skipReason).toBeUndefined();
    expect(mapping?.reviewRequired).toBe(true);
  });

  it('leaves a Hindi value alone on a Hindi-labelled portal', () => {
    const box = field({ signature: 'father', labelText: 'पिता का नाम' });
    const [mapping] = proposeMappings({
      detection: page([box]),
      customerValues: { 'customer.father_name': 'परीक्षण प्रसाद' },
    }).mappings;

    expect(mapping?.skipReason).toBeUndefined();
    expect(mapping?.customerField).toBe('customer.father_name');
  });
});

describe('ssc-portal — names are English only', () => {
  const adapter = portalAdapterSchema.parse(sscPortal);
  const fields = [
    field({ signature: 'cand', labelText: '2. Candidate Name (As per Matriculation Certificate)' }),
    field({
      signature: 'cand-verify',
      labelText: 'a. Verify Candidate Name (As per Matriculation Certificate)',
    }),
    field({ signature: 'father', labelText: "6. Father's Name" }),
    field({ signature: 'mother', labelText: "7. Mother's Name" }),
  ];
  const { mappings } = proposeMappings({
    detection: page(fields, 'https://ssc.gov.in'),
    customerValues: BILINGUAL,
    adapter,
  });
  const bySignature = new Map(mappings.map((mapping) => [mapping.signature, mapping]));

  it('maps the matriculation-certificate name to the English name, not the Hindi one', () => {
    expect(bySignature.get('cand')?.customerField).toBe('customer.full_name');
    expect(bySignature.get('cand-verify')?.customerField).toBe('customer.full_name');
    expect(resolveFillValue(bySignature.get('cand')!, BILINGUAL)).toBe('Demo Kumar Verma');
  });

  it("refuses to type a Hindi father's name and fills an English mother's name", () => {
    expect(bySignature.get('father')).toMatchObject({
      skipReason: 'script_mismatch',
      expectedScript: 'latin',
    });
    expect(bySignature.get('mother')?.skipReason).toBeUndefined();
  });
});

describe('parent names stored in both scripts', () => {
  const BOTH = {
    'customer.full_name': 'Demo Kumar Verma',
    'customer.father_name': 'Parikshan Prasad',
    'customer.father_name_hi': 'परीक्षण प्रसाद',
    'customer.mother_name': 'Sample Devi',
    'customer.mother_name_hi': 'नमूना देवी',
  };

  it('fills SSC from the English spelling with no typing', () => {
    const adapter = portalAdapterSchema.parse(sscPortal);
    const box = field({ signature: 'father', labelText: "6. Father's Name" });
    const { mappings } = proposeMappings({
      detection: page([box], 'https://ssc.gov.in'),
      customerValues: BOTH,
      adapter,
    });

    expect(mappings[0]).toMatchObject({ customerField: 'customer.father_name' });
    expect(mappings[0]?.skipReason).toBeUndefined();
    expect(resolveFillValue(mappings[0]!, BOTH)).toBe('Parikshan Prasad');
  });

  it('fills a "in Hindi" box from the Hindi spelling', () => {
    const fatherHi = field({ signature: 'f-hi', labelText: "Father's Name in Hindi" });
    const motherHi = field({ signature: 'm-hi', labelText: 'माता का नाम (हिंदी)' });
    const { mappings } = proposeMappings({
      detection: page([fatherHi, motherHi]),
      customerValues: BOTH,
    });

    expect(mappings.map((mapping) => mapping.customerField)).toEqual([
      'customer.father_name_hi',
      'customer.mother_name_hi',
    ]);
    expect(mappings.every((mapping) => mapping.skipReason === undefined)).toBe(true);
  });

  it('swaps to the other spelling when the box wants the other script', () => {
    const englishOnly = field({ signature: 'f', labelText: "Father's Name (in English)" });
    const values = {
      'customer.father_name_hi': 'परीक्षण प्रसाद',
      'customer.father_name': 'P Prasad',
    };
    const [mapping] = proposeMappings({
      detection: page([englishOnly]),
      customerValues: values,
    }).mappings;

    expect(mapping?.customerField).toBe('customer.father_name');
    expect(resolveFillValue(mapping!, values)).toBe('P Prasad');
  });

  it('falls back to the one spelling there is, for a profile saved before the split', () => {
    const hindiBox = field({ signature: 'f-hi', labelText: "Father's Name in Hindi" });
    const legacy = { 'customer.father_name': 'परीक्षण प्रसाद' };
    const [mapping] = proposeMappings({
      detection: page([hindiBox]),
      customerValues: legacy,
    }).mappings;

    expect(mapping?.customerField).toBe('customer.father_name');
    expect(resolveFillValue(mapping!, legacy)).toBe('परीक्षण प्रसाद');
  });

  it('still asks for the English spelling when only a Hindi one is saved', () => {
    const adapter = portalAdapterSchema.parse(sscPortal);
    const box = field({ signature: 'father', labelText: "6. Father's Name" });
    const [mapping] = proposeMappings({
      detection: page([box], 'https://ssc.gov.in'),
      customerValues: { 'customer.father_name_hi': 'परीक्षण प्रसाद' },
      adapter,
    }).mappings;

    expect(mapping).toMatchObject({ skipReason: 'script_mismatch', expectedScript: 'latin' });
  });
});
