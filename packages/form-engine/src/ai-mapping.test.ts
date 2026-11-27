import { describe, expect, it } from 'vitest';
import {
  AI_CONFIDENCE_CAP,
  AI_MAPPING_MAX_FIELDS,
  AI_MAPPING_SYSTEM_PROMPT,
  aiDescriptorCacheKey,
  aiMappingCandidates,
  buildAiMappingRequest,
  buildAiMappingUserPrompt,
  parseAiMappingResponse,
  toAiFieldMappings,
} from './ai-mapping';
import { proposeMappings } from './mapper';
import type { DetectedField, DetectionPayload } from './types';

// Synthetic values only — never real citizen data (DEVELOPMENT_RULES §1).
const ORIGIN = 'https://forms.demo.assistigo.test';
const PAGE = { origin: ORIGIN, path: '/apply/482139/step2', title: null, blockedFrames: 0 };

function field(overrides: Partial<DetectedField> = {}): DetectedField {
  return {
    signature: 'sig-1',
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
    order: 0,
    ...overrides,
  };
}

function detection(fields: DetectedField[]): DetectionPayload {
  return { page: PAGE, fields };
}

// A label the dictionary does not know, so it reaches step 5.
const ODD_BOX = field({ signature: 'odd', labelText: 'Naam-e-Walid (as per records)' });

describe('aiMappingCandidates', () => {
  it('asks only about boxes nothing else mapped', () => {
    const fields = [
      field({ signature: 'known', labelText: 'Date of Birth' }),
      ODD_BOX,
    ];
    const first = proposeMappings({ detection: detection(fields), customerValues: {} });
    const candidates = aiMappingCandidates(fields, first.mappings);
    expect(candidates.map((candidate) => candidate.signature)).toEqual(['odd']);
  });

  it('never asks about a CAPTCHA, OTP, password, file, hidden or disabled box', () => {
    const fields = [
      field({ signature: 'cap', labelText: 'Enter the text shown in the image (captcha)' }),
      field({ signature: 'otp', labelText: 'Enter OTP', maxLength: 6 }),
      field({ signature: 'pw', inputType: 'password', labelText: 'Password' }),
      field({ signature: 'file', inputType: 'file', labelText: 'Upload' }),
      field({ signature: 'hid', inputType: 'hidden', name: 'tokenValue' }),
      field({ signature: 'dis', labelText: 'Naam-e-Walid', disabled: true }),
      field({ signature: 'inv', labelText: 'Naam-e-Walid', visible: false }),
    ];
    const first = proposeMappings({ detection: detection(fields), customerValues: {} });
    expect(aiMappingCandidates(fields, first.mappings)).toEqual([]);
  });

  it('caps the number of boxes per request', () => {
    const fields = Array.from({ length: AI_MAPPING_MAX_FIELDS + 10 }, (_, index) =>
      field({ signature: `s${index}`, labelText: `Zzq unknown box ${index}`, order: index }),
    );
    const first = proposeMappings({ detection: detection(fields), customerValues: {} });
    expect(aiMappingCandidates(fields, first.mappings)).toHaveLength(AI_MAPPING_MAX_FIELDS);
  });
});

describe('buildAiMappingRequest — what leaves the server', () => {
  it('sends the host and a path with ids masked, never the full URL', () => {
    const request = buildAiMappingRequest([ODD_BOX], PAGE)!;
    expect(request.portal).toBe('forms.demo.assistigo.test');
    expect(request.pathPattern).toBe('/apply/*/step2');
    expect(buildAiMappingUserPrompt(request)).not.toContain('482139');
  });

  it('cleans every text the same way as a contribution', () => {
    const box = field({
      signature: 'pre',
      labelText: 'Mobile',
      nearbyText: 'Registered mobile 98765 43210 for demo.user@example.test',
      sectionHeading: 'Applicant ABCDE1234F',
      name: 'ctrl_12',
    });
    const prompt = buildAiMappingUserPrompt(buildAiMappingRequest([box], PAGE)!);
    expect(prompt).not.toContain('98765');
    expect(prompt).not.toContain('demo.user@example.test');
    expect(prompt).not.toContain('ABCDE1234F');
    expect(prompt).not.toContain('ctrl_12');
    expect(prompt).toContain('Mobile');
  });

  it('sends option labels, never option values', () => {
    const box = field({
      signature: 'sel',
      tagName: 'select',
      inputType: 'select-one',
      labelText: 'Zila',
      options: [
        { value: 'opaque-value-1', label: 'Patna' },
        { value: 'opaque-value-2', label: 'Gaya' },
      ],
    });
    const prompt = buildAiMappingUserPrompt(buildAiMappingRequest([box], PAGE)!);
    expect(prompt).toContain('Patna');
    expect(prompt).not.toContain('opaque-value');
  });

  it('carries no field value, because a detected field has none', () => {
    const request = buildAiMappingRequest([field({ signature: 'x', labelText: 'Zzq', hasValue: true })], PAGE)!;
    expect(Object.keys(request.fields[0]!)).not.toContain('value');
    expect(Object.keys(request.fields[0]!)).not.toContain('hasValue');
  });

  it('skips a box with nothing to read and returns null when none are left', () => {
    expect(buildAiMappingRequest([field({ signature: 'blank' })], PAGE)).toBeNull();
  });

  it('keeps signatures server-side, keyed by ref', () => {
    const request = buildAiMappingRequest([ODD_BOX], PAGE)!;
    expect(request.signatures).toEqual({ f1: 'odd' });
    expect(buildAiMappingUserPrompt(request)).not.toContain('"odd"');
  });
});

describe('aiDescriptorCacheKey', () => {
  it('is the same box on the same portal regardless of its position', () => {
    const a = buildAiMappingRequest([ODD_BOX], PAGE)!.fields[0]!;
    const b = { ...a, ref: 'f9' };
    expect(aiDescriptorCacheKey('forms.demo.assistigo.test', a)).toBe(
      aiDescriptorCacheKey('FORMS.demo.assistigo.test', b),
    );
  });

  it('differs between portals', () => {
    const a = buildAiMappingRequest([ODD_BOX], PAGE)!.fields[0]!;
    expect(aiDescriptorCacheKey('a.test', a)).not.toBe(aiDescriptorCacheKey('b.test', a));
  });
});

describe('the system prompt', () => {
  it('lists registry keys and states the safety rules', () => {
    expect(AI_MAPPING_SYSTEM_PROMPT).toContain('customer.father_name');
    expect(AI_MAPPING_SYSTEM_PROMPT).toMatch(/CAPTCHA, OTP, password/);
  });
});

describe('parseAiMappingResponse', () => {
  const request = { signatures: { f1: 'a', f2: 'b', f3: 'c' } };

  it('reads a fenced JSON reply', () => {
    const answers = parseAiMappingResponse(
      'Here you go:\n```json\n{"mappings":[{"ref":"f1","key":"customer.father_name","confidence":0.92}]}\n```',
      request,
    );
    expect(answers.get('f1')).toEqual({ customerField: 'customer.father_name', confidence: 0.92 });
  });

  it('drops unknown keys and refs that were never asked about', () => {
    const answers = parseAiMappingResponse(
      JSON.stringify({
        mappings: [
          { ref: 'f1', key: 'customer.made_up_field', confidence: 0.9 },
          { ref: 'f9', key: 'customer.full_name', confidence: 0.9 },
          { ref: 'f2', key: 'customer.mobile', confidence: 0.8 },
        ],
      }),
      request,
    );
    expect([...answers.keys()]).toEqual(['f2']);
  });

  it('keeps an explicit null, so the negative can be cached', () => {
    const answers = parseAiMappingResponse(
      '{"mappings":[{"ref":"f3","key":null,"confidence":0.1}]}',
      request,
    );
    expect(answers.get('f3')).toEqual({ customerField: null, confidence: 0.1 });
  });

  it('takes the first answer for a ref and clamps confidence', () => {
    const answers = parseAiMappingResponse(
      '{"mappings":[{"ref":"f1","key":"customer.full_name","confidence":7},{"ref":"f1","key":"customer.mobile","confidence":0.9}]}',
      request,
    );
    expect(answers.get('f1')).toEqual({ customerField: 'customer.full_name', confidence: 1 });
  });

  it('returns nothing for prose or broken JSON', () => {
    expect(parseAiMappingResponse('I cannot help with that.', request).size).toBe(0);
    expect(parseAiMappingResponse('{"mappings":[{"ref":', request).size).toBe(0);
  });
});

describe('toAiFieldMappings', () => {
  it('drops nulls and unsure answers, and caps the rest below the high band', () => {
    const answers = new Map([
      ['f1', { customerField: 'customer.father_name', confidence: 0.99 }],
      ['f2', { customerField: 'customer.mobile', confidence: 0.3 }],
      ['f3', { customerField: null, confidence: 0.9 }],
    ]);
    expect(toAiFieldMappings(answers, { f1: 'a', f2: 'b', f3: 'c' })).toEqual([
      { fieldSignature: 'a', customerField: 'customer.father_name', confidence: AI_CONFIDENCE_CAP },
    ]);
  });
});

describe('mapper step 5', () => {
  const values = { 'customer.father_name': 'Demo Father', 'customer.full_name': 'Demo Applicant' };

  it('fills a leftover box from the AI pick, always under review', () => {
    const proposal = proposeMappings({
      detection: detection([ODD_BOX]),
      customerValues: values,
      aiMappings: [{ fieldSignature: 'odd', customerField: 'customer.father_name', confidence: 0.99 }],
    });
    expect(proposal.mappings[0]).toMatchObject({
      customerField: 'customer.father_name',
      source: 'ai',
      reviewRequired: true,
    });
    expect(proposal.mappings[0]!.confidence).toBeLessThanOrEqual(AI_CONFIDENCE_CAP);
  });

  it('never outranks an earlier step', () => {
    const known = field({ signature: 'known', labelText: "Father's Name" });
    const proposal = proposeMappings({
      detection: detection([known]),
      customerValues: values,
      aiMappings: [{ fieldSignature: 'known', customerField: 'customer.full_name', confidence: 0.85 }],
    });
    expect(proposal.mappings[0]).toMatchObject({
      customerField: 'customer.father_name',
      source: 'dictionary',
    });
  });

  it('never fills a CAPTCHA or OTP box, whatever the model said', () => {
    const fields = [
      field({ signature: 'cap', labelText: 'Captcha' }),
      field({ signature: 'otp', labelText: 'Enter OTP', maxLength: 6 }),
    ];
    const proposal = proposeMappings({
      detection: detection(fields),
      customerValues: values,
      aiMappings: [
        { fieldSignature: 'cap', customerField: 'customer.full_name', confidence: 0.85 },
        { fieldSignature: 'otp', customerField: 'customer.full_name', confidence: 0.85 },
      ],
    });
    for (const mapping of proposal.mappings) {
      expect(mapping.safetyClass).not.toBe('normal');
      expect(mapping.customerField).toBeNull();
    }
  });

  it('carries the dictionary transform for the chosen key', () => {
    const dob = field({ signature: 'dob', labelText: 'Paidaish ki tareekh' });
    const proposal = proposeMappings({
      detection: detection([dob]),
      customerValues: { 'customer.date_of_birth': '1998-07-14' },
      aiMappings: [{ fieldSignature: 'dob', customerField: 'customer.date_of_birth', confidence: 0.8 }],
    });
    expect(proposal.mappings[0]).toMatchObject({ source: 'ai', transform: 'date.ddmmyyyy' });
  });
});
