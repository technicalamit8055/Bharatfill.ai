import { describe, expect, it } from 'vitest';
import {
  adapterDependencyDepth,
  adapterFieldMatchScore,
  adapterFieldMatches,
  findAdapterField,
  adapterMatchesUrl,
  portalAdapterSchema,
  selectAdapter,
  urlPatternToRegExp,
  type AdapterField,
  type AdapterMatchable,
  type PortalAdapter,
} from './adapters';
import biharRtps from './adapters/bihar-rtps.json';
import sscPortal from './adapters/ssc-portal.json';

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

describe('urlPatternToRegExp', () => {
  it('matches a single wildcard within one path segment', () => {
    const re = urlPatternToRegExp('https://demo.test/*/apply');
    expect(re.test('https://demo.test/scholarship/apply')).toBe(true);
    expect(re.test('https://demo.test/a/b/apply')).toBe(false);
  });

  it('matches a double wildcard across segments', () => {
    const re = urlPatternToRegExp('https://demo.test/**');
    expect(re.test('https://demo.test/a/b/c')).toBe(true);
  });

  it('treats dots as literal, so one adapter cannot claim another portal', () => {
    const re = urlPatternToRegExp('https://bihar.example.gov.in/apply');
    expect(re.test('https://bihar.example.gov.in/apply')).toBe(true);
    expect(re.test('https://biharXexample.gov.in/apply')).toBe(false);
  });

  it('is case-insensitive on the host', () => {
    expect(urlPatternToRegExp('https://Demo.test/apply').test('https://demo.test/apply')).toBe(
      true,
    );
  });

  it('handles a URL containing regex metacharacters', () => {
    const re = urlPatternToRegExp('https://demo.test/form(2024)/apply');
    expect(re.test('https://demo.test/form(2024)/apply')).toBe(true);
    expect(re.test('https://demo.test/form2024/apply')).toBe(false);
  });
});

describe('adapterMatchesUrl', () => {
  it('matches on origin plus path', () => {
    const a = adapter({ slug: 'demo', urlPatterns: ['https://demo.assistigo.test/scholarship/*'] });
    expect(adapterMatchesUrl(a, 'https://demo.assistigo.test', '/scholarship/apply')).toBe(true);
    expect(adapterMatchesUrl(a, 'https://demo.assistigo.test', '/recruitment/apply')).toBe(false);
  });

  it('never matches a deprecated adapter', () => {
    const a = adapter({ slug: 'old', status: 'deprecated' });
    expect(adapterMatchesUrl(a, 'https://demo.assistigo.test', '/anything')).toBe(false);
  });
});

describe('selectAdapter', () => {
  it('prefers the more specific pattern', () => {
    const broad = adapter({ slug: 'broad', urlPatterns: ['https://demo.assistigo.test/**'] });
    const specific = adapter({
      slug: 'specific',
      urlPatterns: ['https://demo.assistigo.test/scholarship/apply'],
    });

    const chosen = selectAdapter(
      [broad, specific],
      'https://demo.assistigo.test',
      '/scholarship/apply',
    );
    expect(chosen?.slug).toBe('specific');
  });

  it('prefers an active adapter over one still in testing', () => {
    const testing = adapter({ slug: 'testing', status: 'testing' });
    const active = adapter({ slug: 'active', status: 'active' });

    const chosen = selectAdapter([testing, active], 'https://demo.assistigo.test', '/apply');
    expect(chosen?.slug).toBe('active');
  });

  it('returns null when nothing matches', () => {
    expect(selectAdapter([adapter({ slug: 'a' })], 'https://other.test', '/apply')).toBeNull();
  });
});

describe('adapterFieldMatches', () => {
  const field = {
    signature: 'sig',
    name: 'applicant_name',
    id: 'applicantName',
    labelText: "Applicant's Name",
  };

  it('matches on the adapter key appearing in the field naming', () => {
    expect(
      adapterFieldMatches(
        { key: 'applicant_name', customerField: 'customer.full_name', inputType: 'text' },
        field,
      ),
    ).toBe(true);
  });

  it('falls back to label patterns when the key does not match', () => {
    expect(
      adapterFieldMatches(
        {
          key: 'nomatch',
          customerField: 'customer.full_name',
          inputType: 'text',
          labelPatterns: ["applicant's name"],
        },
        field,
      ),
    ).toBe(true);
  });

  it('does not match an unrelated field', () => {
    expect(
      adapterFieldMatches(
        { key: 'father_name', customerField: 'customer.father_name', inputType: 'text' },
        field,
      ),
    ).toBe(false);
  });
});

describe('adapterFieldMatchScore — negative patterns', () => {
  const applicantName = {
    key: 'applicant_name',
    customerField: 'customer.full_name',
    inputType: 'text',
    labelPatterns: ['नाम'],
    negativePatterns: ['पिता', 'माता'],
  };

  it('rejects a field a negative pattern disqualifies, even when a positive one matches', () => {
    expect(
      adapterFieldMatchScore(applicantName, {
        signature: 'sig',
        name: 'attr_1005',
        id: 'attr_1005',
        labelText: 'पिता का नाम / Name of Father',
      }),
    ).toBeNull();
  });

  it('still claims the field the pattern was written for', () => {
    expect(
      adapterFieldMatchScore(applicantName, {
        signature: 'sig',
        name: 'attr_1003',
        id: 'attr_1003',
        labelText: 'आवेदक का नाम / Name of Applicant',
      }),
    ).not.toBeNull();
  });

  it('looks at the placeholder and aria-label too', () => {
    expect(
      adapterFieldMatchScore(
        {
          key: 'dob',
          customerField: 'customer.date_of_birth',
          inputType: 'text',
          labelPatterns: ['date of birth'],
        },
        {
          signature: 'sig',
          name: null,
          id: null,
          labelText: null,
          ariaLabel: 'Date of Birth',
        },
      ),
    ).not.toBeNull();
  });

  it('does not let the key substring-match a label', () => {
    /*
     * The old behaviour matched the adapter key against the label text as a loose substring, so
     * a key of "name" claimed "पिता का नाम". The key is an attribute-space identifier; it now
     * only matches name/id, and only as a whole token.
     */
    expect(
      adapterFieldMatchScore(
        { key: 'name', customerField: 'customer.full_name', inputType: 'text' },
        { signature: 'sig', name: 'attr_1005', id: 'attr_1005', labelText: "Father's Name" },
      ),
    ).toBeNull();
  });

  it('matches a key against name/id across naming conventions', () => {
    for (const attribute of ['applicant_name', 'applicantName', 'applicant-name']) {
      expect(
        adapterFieldMatchScore(
          { key: 'applicant_name', customerField: 'customer.full_name', inputType: 'text' },
          { signature: 'sig', name: attribute, id: null, labelText: null },
        ),
        attribute,
      ).not.toBeNull();
    }
  });
});

describe('findAdapterField — longest match wins', () => {
  const fields = [
    {
      key: 'district',
      customerField: 'customer.address.district',
      inputType: 'select-one',
      labelPatterns: ['जिला'],
    },
    {
      key: 'permanent_district',
      customerField: 'customer.permanent_address.district',
      inputType: 'select-one',
      labelPatterns: ['स्थायी जिला'],
    },
  ];

  it('prefers the more specific pattern regardless of array order', () => {
    const field = {
      signature: 'sig',
      name: 'attr_9',
      id: 'attr_9',
      labelText: 'स्थायी जिला / Permanent District',
    };

    expect(findAdapterField({ fields }, field)?.key).toBe('permanent_district');
    expect(findAdapterField({ fields: [...fields].reverse() }, field)?.key).toBe(
      'permanent_district',
    );
  });

  it('returns null when nothing claims the field', () => {
    expect(
      findAdapterField(
        { fields },
        { signature: 'sig', name: 'captchaCode', id: 'captchaCode', labelText: 'Enter captcha' },
      ),
    ).toBeNull();
  });
});

describe('adapterDependencyDepth', () => {
  it('counts the chain', () => {
    const depths = adapterDependencyDepth({
      fields: [
        {
          key: 'block',
          customerField: 'customer.address.block',
          inputType: 'select-one',
          dependsOn: 'district',
        },
        { key: 'state', customerField: 'customer.address.state', inputType: 'select-one' },
        {
          key: 'district',
          customerField: 'customer.address.district',
          inputType: 'select-one',
          dependsOn: 'state',
        },
      ],
    });

    expect(depths.get('state')).toBe(0);
    expect(depths.get('district')).toBe(1);
    expect(depths.get('block')).toBe(2);
  });

  it('treats a dangling parent as no dependency rather than throwing', () => {
    const depths = adapterDependencyDepth({
      fields: [
        {
          key: 'block',
          customerField: 'customer.address.block',
          inputType: 'select-one',
          dependsOn: 'missing',
        },
      ],
    });
    expect(depths.get('block')).toBe(0);
  });

  it('survives a cycle, because a broken adapter must still fill the rest of the form', () => {
    const depths = adapterDependencyDepth({
      fields: [
        { key: 'a', customerField: 'customer.address.state', inputType: 'text', dependsOn: 'b' },
        { key: 'b', customerField: 'customer.address.district', inputType: 'text', dependsOn: 'a' },
      ],
    });
    expect(depths.get('a')).toBeTypeOf('number');
    expect(depths.get('b')).toBeTypeOf('number');
  });
});

describe('ssc-portal adapter', () => {
  const parsed = portalAdapterSchema.parse(sscPortal);

  it('validates against portalAdapterSchema', () => {
    expect(() => portalAdapterSchema.parse(sscPortal)).not.toThrow();
    expect(parsed.slug).toBe('ssc-portal');
  });

  it('matches the SSC application URL', () => {
    expect(adapterMatchesUrl(parsed, 'https://ssc.gov.in', '/portal/apply')).toBe(true);
  });

  it('matches an SSC subdomain, which is where the OTR form actually lives', () => {
    expect(adapterMatchesUrl(parsed, 'https://uatssc.ssc.gov.in', '/registration')).toBe(true);
  });

  it('does not claim a portal that merely ends in a similar host', () => {
    // The `.` in the pattern is literal, so a look-alike host must not match.
    expect(adapterMatchesUrl(parsed, 'https://sscXgov.in', '/portal/apply')).toBe(false);
    expect(adapterMatchesUrl(parsed, 'https://notssc.gov.in', '/portal/apply')).toBe(false);
  });

  it("does not let the father's-name field claim the mother's or the candidate's", () => {
    const fatherName = parsed.fields.find((field) => field.key === 'father_name');
    expect(fatherName).toBeDefined();

    for (const label of ["Mother's Name", "Candidate's Name", 'माता का नाम']) {
      expect(
        adapterFieldMatchScore(fatherName as NonNullable<typeof fatherName>, {
          signature: 'sig',
          name: 'ctrl_12',
          id: 'ctrl_12',
          labelText: label,
        }),
        label,
      ).toBeNull();
    }

    expect(
      adapterFieldMatchScore(fatherName as NonNullable<typeof fatherName>, {
        signature: 'sig',
        name: 'ctrl_12',
        id: 'ctrl_12',
        labelText: "Father's Name",
      }),
    ).not.toBeNull();
  });

  it('orders the permanent address chain state → district', () => {
    const depths = adapterDependencyDepth(parsed);
    expect(depths.get('permanent_state')).toBe(0);
    expect(depths.get('permanent_district')).toBe(1);
  });

  it('requires the photo and signature uploads by their real preset codes', () => {
    expect(parsed.documentRequirements.map((requirement) => requirement.presetCode).sort()).toEqual([
      'ssc.photo',
      'ssc.signature',
    ]);
  });

  it('never maps a full Aadhaar number, only the last four digits', () => {
    for (const field of parsed.fields) {
      expect(field.customerField).not.toBe('customer.aadhaar');
    }
    expect(parsed.fields.some((field) => field.customerField === 'customer.aadhaar_last4')).toBe(
      true,
    );
  });

  it('forces review on every high-risk field it maps', () => {
    // date_of_birth, category and aadhaar_last4 are high_risk in the registry (§14.6); an
    // adapter proposes at near-certainty, so each must still stop for a human.
    for (const key of ['date_of_birth', 'category', 'aadhaar_last4']) {
      expect(parsed.fields.find((field) => field.key === key)?.reviewRequired, key).toBe(true);
    }
  });
});

/**
 * Rule 3 (docs/DEVELOPMENT_RULES.md §1; master spec §14.5, §19.7): Assistigo never retrieves or
 * auto-enters an OTP.
 *
 * The specific hazard these tests guard is that an OTP box on an Indian portal almost always
 * says "mobile" or "email" somewhere in its markup — "Enter OTP sent to mobile number",
 * `name="otpMobile"`, `id="mobile_otp"`. Every one of those strings is a positive signal for the
 * contact field, so without a disqualifier the adapter would type the customer's real 10-digit
 * number into the OTP input: a validation error at best, a locked account at worst, and a
 * straight breach of the rule either way.
 *
 * This is tier one of two. `classifyField` in safety.ts is tier two, and safety.test.ts covers
 * it; a field has to clear both before anything is typed into it.
 */
describe('adapters — contact fields never claim an OTP input (Rule 3)', () => {
  const adapters = [
    { slug: 'ssc-portal', parsed: portalAdapterSchema.parse(sscPortal) },
    { slug: 'bihar-rtps', parsed: portalAdapterSchema.parse(biharRtps) },
  ] as const;

  /** Each case names one attribute, because a portal may poison only one of them. */
  const mobileOtpFields: ReadonlyArray<Partial<AdapterMatchable> & { readonly why: string }> = [
    { why: 'English label', labelText: 'Enter OTP sent to mobile number' },
    { why: 'Hindi label', labelText: 'मोबाइल पर भेजा गया ओटीपी' },
    { why: 'camelCase name', name: 'otpMobile' },
    { why: 'snake_case id', id: 'mobile_otp' },
    { why: 'placeholder', placeholder: 'Enter 6-digit Mobile OTP' },
    { why: 'aria-label', ariaLabel: 'Mobile Verification Code' },
    { why: 'spelled-out label', labelText: 'One Time Password sent to your mobile' },
    { why: 'hyphenated name', name: 'otp-mobile' },
    { why: 'Hindi verification label', labelText: 'मोबाइल सत्यापन कोड' },
    { why: 'alternate number', labelText: 'Alternate Mobile Number' },
  ];

  const emailOtpFields: ReadonlyArray<Partial<AdapterMatchable> & { readonly why: string }> = [
    { why: 'English label', labelText: 'Enter OTP sent to email address' },
    { why: 'Hindi label', labelText: 'ईमेल पर भेजा गया ओटीपी' },
    { why: 'camelCase name', name: 'otpEmail' },
    { why: 'snake_case id', id: 'email_otp' },
    { why: 'placeholder', placeholder: 'Enter 6-digit Email OTP' },
    { why: 'aria-label', ariaLabel: 'Email Verification Code' },
    { why: 'spelled-out label', labelText: 'One Time Password sent to your email' },
    { why: 'alternate address', labelText: 'Alternate Email Address' },
  ];

  /**
   * Only the attribute under test is populated. Filling the rest with the same hostile string
   * would let a test pass on the wrong signal and hide a gap in one attribute's coverage.
   */
  function matchable(overrides: Partial<AdapterMatchable>): AdapterMatchable {
    return {
      signature: 'input#ctrl_99',
      name: null,
      id: null,
      labelText: null,
      ...overrides,
    };
  }

  for (const { slug, parsed } of adapters) {
    describe(slug, () => {
      for (const [key, hostile] of [
        ['mobile', mobileOtpFields],
        ['email', emailOtpFields],
      ] as const) {
        const adapterField = parsed.fields.find((field) => field.key === key);

        it(`defines a ${key} field with negative patterns`, () => {
          expect(adapterField, `${slug} must map ${key}`).toBeDefined();
          // A missing negativePatterns array is the failure mode this whole suite exists for:
          // it reads as "nothing disqualifies this field", not as "not configured yet".
          expect(adapterField?.negativePatterns ?? [], `${slug}.${key}`).toEqual(
            expect.arrayContaining(['otp', 'ओटीपी', 'one time password', 'verification', 'verify']),
          );
        });

        for (const { why, ...attributes } of hostile) {
          it(`never claims the ${key} OTP input — ${why}`, () => {
            expect(adapterField).toBeDefined();
            expect(
              adapterFieldMatchScore(
                adapterField as NonNullable<typeof adapterField>,
                matchable(attributes),
              ),
              `${slug}.${key} claimed an OTP field via ${why}`,
            ).toBeNull();
            expect(
              adapterFieldMatches(
                adapterField as NonNullable<typeof adapterField>,
                matchable(attributes),
              ),
            ).toBe(false);
          });
        }
      }

      it('still claims the genuine mobile and email fields', () => {
        // The disqualifiers must not be so broad that the adapter stops filling real contact
        // fields — an over-eager negative pattern is a silent regression, not a safe default.
        const mobile = parsed.fields.find((field) => field.key === 'mobile');
        const email = parsed.fields.find((field) => field.key === 'email');

        expect(
          adapterFieldMatchScore(
            mobile as NonNullable<typeof mobile>,
            matchable({ name: 'mobileNumber', labelText: 'Mobile Number' }),
          ),
        ).not.toBeNull();

        expect(
          adapterFieldMatchScore(
            email as NonNullable<typeof email>,
            matchable({ name: 'emailId', labelText: 'Email' }),
          ),
        ).not.toBeNull();
      });
    });
  }

  it('disqualifies before the selector shortcut, which outranks every other signal', () => {
    // adapterFieldMatchScore returns 1000 on a selector hit. That branch must sit *after* the
    // negative loop, or an adapter whose selector happens to match the OTP box would fill it
    // at maximum confidence — the exact case the two-tier defence is built to stop.
    const withSelector = {
      key: 'mobile',
      customerField: 'customer.mobile',
      selector: '#ctrl_99',
      negativePatterns: ['otp'],
      inputType: 'text',
    } satisfies AdapterField;

    expect(
      adapterFieldMatchScore(withSelector, {
        signature: 'input#ctrl_99',
        name: 'otpMobile',
        id: null,
        labelText: null,
      }),
    ).toBeNull();
  });

  it('disqualifies before the adapter-key shortcut', () => {
    // Same argument one tier down: the key "mobile" matches `name="mobile_otp"` as a whole
    // token and would score 800 if the negatives did not run first.
    const byKey = {
      key: 'mobile',
      customerField: 'customer.mobile',
      negativePatterns: ['otp'],
      inputType: 'text',
    } satisfies AdapterField;

    expect(
      adapterFieldMatchScore(byKey, {
        signature: 'sig',
        name: 'mobile_otp',
        id: 'mobile_otp',
        labelText: null,
      }),
    ).toBeNull();
  });
});
