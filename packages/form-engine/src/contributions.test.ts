import { describe, expect, it } from 'vitest';
import {
  buildMappingContribution,
  bumpPatchVersion,
  contributionGroupKey,
  contributionBoxKey,
  contributionPathPattern,
  contributionToAdapterField,
  defaultTransformFor,
  groupContributions,
  mergeContributionIntoAdapter,
  newContributedAdapter,
  sanitiseContributionAttribute,
  sanitiseContributionText,
  unteachableReason,
  type MappingContribution,
} from './contributions';
import { adapterFieldMatchScore, findAdapterField, type PortalAdapter } from './adapters';
import { portalTargetForOrigin, PORTAL_TARGETS } from './portal-targets';
import { proposeMappings } from './mapper';
import type { DetectedField } from './types';
import sscPortal from './adapters/ssc-portal.json';
import { portalAdapterSchema } from './adapters';

// Synthetic values only — never real citizen data (DEVELOPMENT_RULES §1).
const ORIGIN = 'https://forms.demo.assistigo.test';

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

function contribution(overrides: Partial<MappingContribution> = {}): MappingContribution {
  return {
    pageOrigin: ORIGIN,
    pathPattern: '/apply',
    fieldSignature: 'sig-1',
    tagName: 'input',
    inputType: 'text',
    labelText: 'Name of Guardian',
    ariaLabel: null,
    placeholder: null,
    sectionHeading: null,
    nameAttribute: null,
    idAttribute: null,
    customerField: 'customer.father_name',
    ...overrides,
  };
}

function adapter(overrides: Partial<PortalAdapter> = {}): PortalAdapter {
  return {
    id: 'adapter-1',
    slug: 'demo',
    portalName: 'Demo',
    formName: 'Apply',
    urlPatterns: [`${ORIGIN}/**`],
    version: '1.0.0',
    status: 'testing',
    fields: [],
    documentRequirements: [],
    ...overrides,
  };
}

describe('sanitiseContributionText', () => {
  it('keeps an ordinary portal label', () => {
    expect(sanitiseContributionText('  पिता का नाम *  ')).toBe('पिता का नाम *');
  });

  it('masks long digit runs such as a phone number or an ID', () => {
    expect(sanitiseContributionText('Mobile (registered 98765 43210)')).toBe('Mobile (registered #)');
    expect(sanitiseContributionText('Year of passing (e.g. 2015)')).toBe('Year of passing (e.g. #)');
  });

  it('keeps short numbers that are part of the label', () => {
    expect(sanitiseContributionText('Class 10 Roll Number')).toBe('Class 10 Roll Number');
  });

  it('drops text with an email address entirely', () => {
    expect(sanitiseContributionText('Email (demo.user@example.test)')).toBeNull();
  });

  it('drops text with a PAN-shaped token entirely', () => {
    expect(sanitiseContributionText('PAN ABCDE1234F')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(sanitiseContributionText('   ')).toBeNull();
    expect(sanitiseContributionText(null)).toBeNull();
  });

  it('caps length', () => {
    expect(sanitiseContributionText('a'.repeat(500))?.length).toBe(200);
  });
});

describe('sanitiseContributionAttribute', () => {
  it('keeps a developer-named control', () => {
    expect(sanitiseContributionAttribute('txtFatherName')).toBe('txtFatherName');
    expect(sanitiseContributionAttribute('ctl00$ContentPlaceHolder1$txtName')).toBe(
      'ctl00$ContentPlaceHolder1$txtName',
    );
  });

  it('rejects framework-generated names', () => {
    expect(sanitiseContributionAttribute('ctrl_12')).toBeNull();
    expect(sanitiseContributionAttribute('mat-input-3')).toBeNull();
    expect(sanitiseContributionAttribute('field7')).toBeNull();
  });

  it('rejects anything carrying a long number', () => {
    expect(sanitiseContributionAttribute('row_4821397_name')).toBeNull();
  });

  it('rejects odd characters and short names', () => {
    expect(sanitiseContributionAttribute('a b')).toBeNull();
    expect(sanitiseContributionAttribute('nm')).toBeNull();
  });
});

describe('unteachableReason — safety regression', () => {
  it('never lets a CAPTCHA, OTP or payment box be taught', () => {
    expect(unteachableReason(field({ labelText: 'Enter Captcha' }))).toBe('safety_captcha');
    expect(unteachableReason(field({ labelText: 'Enter OTP', maxLength: 6 }))).toBe('safety_otp');
    expect(unteachableReason(field({ name: 'otpMobile', labelText: 'Mobile' }))).toBe('safety_otp');
    expect(unteachableReason(field({ labelText: 'Card Number', name: 'cardNumber' }))).toBe(
      'safety_payment',
    );
  });

  it('never lets a submit control be taught', () => {
    expect(unteachableReason(field({ inputType: 'submit', name: 'btnSubmit' }))).toBe(
      'safety_submit',
    );
  });

  it('refuses boxes that hold no customer text', () => {
    expect(unteachableReason(field({ inputType: 'file', labelText: 'Photo' }))).toBe(
      'unsupported_type',
    );
    expect(unteachableReason(field({ inputType: 'password', labelText: 'Password' }))).toBe(
      'unsupported_type',
    );
  });

  it('allows an ordinary box', () => {
    expect(unteachableReason(field({ labelText: 'Name of Guardian' }))).toBeNull();
  });
});

describe('contributionPathPattern', () => {
  it('replaces id-like segments and drops a query string', () => {
    expect(contributionPathPattern('/application/48213977/edit?step=2')).toBe(
      '/application/*/edit',
    );
    expect(contributionPathPattern('/apply')).toBe('/apply');
  });
});

describe('buildMappingContribution', () => {
  it('carries the portal side only, never a value', () => {
    const built = buildMappingContribution(
      field({ labelText: "Guardian's Name", name: 'txtGuardian', nearbyText: 'Applicant: Demo' }),
      { origin: ORIGIN, path: '/apply/123456' },
      'customer.father_name',
    );
    expect(built).not.toBeNull();
    expect(built?.pathPattern).toBe('/apply/*');
    expect(built?.nameAttribute).toBe('txtGuardian');
    // nearbyText is never part of a contribution.
    expect(JSON.stringify(built)).not.toContain('Applicant: Demo');
  });

  it('returns null when nothing identifies the box once unsafe text is gone', () => {
    expect(
      buildMappingContribution(
        field({ labelText: 'demo.user@example.test', name: 'ctrl_3' }),
        { origin: ORIGIN, path: '/' },
        'customer.email',
      ),
    ).toBeNull();
  });
});

describe('grouping', () => {
  it('groups the same box and field from different centres', () => {
    const a = contribution({ fieldSignature: 'a', labelText: "Guardian's Name *" });
    const b = contribution({ fieldSignature: 'b', labelText: 'Guardians Name' });
    expect(contributionGroupKey(a)).toBe(contributionGroupKey(b));
  });

  it('separates two answers for one box, but keeps the box key the same', () => {
    const a = contribution({ customerField: 'customer.father_name' });
    const b = contribution({ customerField: 'customer.mother_name' });
    expect(contributionGroupKey(a)).not.toBe(contributionGroupKey(b));
    expect(contributionBoxKey(a)).toBe(contributionBoxKey(b));
  });
});

describe('defaultTransformFor', () => {
  it('uses the dictionary transform, except on a native date box', () => {
    expect(defaultTransformFor('customer.date_of_birth', 'text')).toBe('date.ddmmyyyy');
    expect(defaultTransformFor('customer.date_of_birth', 'date')).toBeUndefined();
  });
});

describe('bumpPatchVersion', () => {
  it('bumps the patch number', () => {
    expect(bumpPatchVersion('1.2.0')).toBe('1.2.1');
    expect(bumpPatchVersion('0.1.9')).toBe('0.1.10');
    expect(bumpPatchVersion('weird')).toBe('1.0.1');
  });
});

describe('contributionToAdapterField', () => {
  it('builds an exact, always-reviewed field with a key that cannot token-match', () => {
    const built = contributionToAdapterField(contribution(), new Set());
    expect(built).toMatchObject({
      customerField: 'customer.father_name',
      labelMatch: 'exact',
      reviewRequired: true,
      origin: 'contribution',
    });
    expect(built?.key.startsWith('crowd_')).toBe(true);
  });

  it('does not offer a masked text as a pattern', () => {
    const built = contributionToAdapterField(
      contribution({ labelText: 'Mobile (registered #)', nameAttribute: 'txtMobile' }),
      new Set(),
    );
    expect(built?.labelPatterns).toEqual(['txtMobile']);
  });

  it('keeps a Hindi-only label readable in the key', () => {
    const built = contributionToAdapterField(contribution({ labelText: 'पिता का नाम' }), new Set());
    expect(built?.key).toBe('crowd_पिता_का_नाम');
  });

  it('keeps keys unique within the adapter', () => {
    const first = contributionToAdapterField(contribution(), new Set());
    const second = contributionToAdapterField(contribution(), new Set([first?.key ?? '']));
    expect(second?.key).not.toBe(first?.key);
  });
});

describe('exact label matching', () => {
  const contributed = contributionToAdapterField(
    contribution({ labelText: 'Name', customerField: 'customer.full_name' }),
    new Set(),
  )!;

  it('matches the box whose own label is exactly the pattern', () => {
    expect(
      adapterFieldMatchScore(contributed, {
        signature: 's',
        name: null,
        id: null,
        labelText: 'Name *',
      }),
    ).not.toBeNull();
  });

  it("does not claim a nested label such as Father's Name", () => {
    expect(
      adapterFieldMatchScore(contributed, {
        signature: 's',
        name: null,
        id: null,
        labelText: "Father's Name",
      }),
    ).toBeNull();
  });

  it('outranks a contains match but not a key match', () => {
    const containsField = {
      key: 'nm',
      customerField: 'customer.full_name',
      labelPatterns: ['name'],
      inputType: 'text',
    };
    const box = { signature: 's', name: null, id: null, labelText: 'Name' };
    expect(adapterFieldMatchScore(contributed, box)!).toBeGreaterThan(
      adapterFieldMatchScore(containsField, box)!,
    );
    expect(adapterFieldMatchScore(contributed, box)!).toBeLessThan(800);
  });
});

describe('mergeContributionIntoAdapter', () => {
  it('adds the field and bumps the version', () => {
    const merged = mergeContributionIntoAdapter(adapter(), contribution());
    expect(merged?.adapter.version).toBe('1.0.1');
    expect(merged?.adapter.fields).toHaveLength(1);
    expect(merged?.replaced).toBe(false);
    // Still a valid adapter after the merge.
    expect(portalAdapterSchema.safeParse(merged?.adapter).success).toBe(true);
  });

  it('replaces an earlier contributed field for the same box', () => {
    const once = mergeContributionIntoAdapter(adapter(), contribution())!;
    const twice = mergeContributionIntoAdapter(
      once.adapter,
      contribution({ customerField: 'customer.mother_name' }),
    )!;
    expect(twice.replaced).toBe(true);
    expect(twice.adapter.fields).toHaveLength(1);
    expect(twice.adapter.fields[0]?.customerField).toBe('customer.mother_name');
  });

  it('never shadows a hand-written field that already claims the box', () => {
    const handWritten = adapter({
      fields: [
        {
          key: 'guardian',
          customerField: 'customer.father_name',
          labelPatterns: ['guardian'],
          inputType: 'text',
        },
      ],
    });
    expect(mergeContributionIntoAdapter(handWritten, contribution())).toBeNull();
  });

  it('leaves the SSC built-in intact apart from the added field', () => {
    const ssc = portalAdapterSchema.parse(sscPortal);
    const merged = mergeContributionIntoAdapter(
      ssc,
      contribution({ pageOrigin: 'https://ssc.gov.in', labelText: 'Demo Unmapped Box Label' }),
    );
    expect(merged?.adapter.fields.length).toBe(ssc.fields.length + 1);
    expect(merged?.adapter.slug).toBe(ssc.slug);
  });
});

describe('groupContributions', () => {
  const row = (id: string, org: string, at: string, overrides: Partial<MappingContribution> = {}) => ({
    id,
    organizationId: org,
    createdAt: at,
    contribution: contribution({ fieldSignature: id, ...overrides }),
  });

  it('counts distinct centres, not rows, and lists the most-agreed group first', () => {
    const groups = groupContributions([
      row('a', 'org-1', '2026-11-01'),
      row('b', 'org-1', '2026-11-02'),
      row('c', 'org-2', '2026-11-03'),
      row('d', 'org-3', '2026-11-04', { customerField: 'customer.mother_name' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ centres: 2, firstSeen: '2026-11-01', lastSeen: '2026-11-03' });
    expect(groups[0]?.ids).toEqual(['c', 'b', 'a']);
  });

  it('flags a box that centres disagree on, from both sides', () => {
    const groups = groupContributions([
      row('a', 'org-1', '2026-11-01'),
      row('b', 'org-2', '2026-11-02', { customerField: 'customer.mother_name' }),
    ]);
    expect(groups.every((group) => group.conflicts.length === 1)).toBe(true);
    const father = groups.find((group) => group.latest.customerField === 'customer.father_name');
    expect(father?.conflicts[0]).toEqual({ customerField: 'customer.mother_name', centres: 1 });
  });
});

describe('newContributedAdapter', () => {
  it('starts a valid testing adapter for the whole origin', () => {
    const created = newContributedAdapter({
      origin: ORIGIN,
      portalName: 'Demo portal',
      formName: 'All forms',
    });
    expect(created.status).toBe('testing');
    expect(created.urlPatterns).toEqual([`${ORIGIN}/**`]);
    expect(created.slug).toMatch(/^crowd-/);
    expect(portalAdapterSchema.safeParse(created).success).toBe(true);
  });
});

describe('a taught mapping, end to end', () => {
  it('fills via the org override on the next mapping, then via the adapter once approved', () => {
    const box = field({ signature: 'guardian-box', labelText: 'Name of Guardian' });
    const detection = { page: { origin: ORIGIN, path: '/apply', title: null, blockedFrames: 0 }, fields: [box] };
    const values = { 'customer.father_name': 'Demo Father' };

    // Unknown to the dictionary before anyone teaches it... or at worst not the father field.
    const before = proposeMappings({ detection, customerValues: values });
    expect(before.mappings[0]?.source === 'org_custom').toBe(false);

    const withOverride = proposeMappings({
      detection,
      customerValues: values,
      orgMappings: [
        { pageOrigin: ORIGIN, fieldSignature: 'guardian-box', customerField: 'customer.father_name' },
      ],
    });
    expect(withOverride.mappings[0]).toMatchObject({
      customerField: 'customer.father_name',
      source: 'org_custom',
    });

    const approved = mergeContributionIntoAdapter(
      newContributedAdapter({ origin: ORIGIN, portalName: 'Demo', formName: 'All' }),
      buildMappingContribution(box, detection.page, 'customer.father_name')!,
    )!.adapter;
    const viaAdapter = proposeMappings({ detection, customerValues: values, adapter: approved });
    expect(viaAdapter.mappings[0]).toMatchObject({
      customerField: 'customer.father_name',
      source: 'adapter',
      reviewRequired: true,
    });
    expect(findAdapterField(approved, box)?.origin).toBe('contribution');
  });
});

describe('portal targets', () => {
  it('resolves an origin to its target', () => {
    expect(portalTargetForOrigin('https://neet.ntaonline.in')?.code).toBe('nta');
    expect(portalTargetForOrigin('https://serviceonline.bihar.gov.in/')?.code).toBe('bihar-rtps');
    expect(portalTargetForOrigin('https://ssc.gov.in')?.code).toBe('ssc');
  });

  it('does not match a look-alike host', () => {
    expect(portalTargetForOrigin('https://ntaonline.in.example.test')).toBeNull();
    expect(portalTargetForOrigin('https://fake-scholarships.gov.in')).toBeNull();
  });

  it('has unique codes and only names built-ins that exist', () => {
    const codes = PORTAL_TARGETS.map((target) => target.code);
    expect(new Set(codes).size).toBe(codes.length);
    const slugs = PORTAL_TARGETS.flatMap((target) => target.builtInSlugs ?? []);
    expect(slugs).toEqual(expect.arrayContaining(['ssc-portal', 'bihar-rtps-serviceonline']));
  });
});
