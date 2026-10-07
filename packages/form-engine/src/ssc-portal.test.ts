/**
 * The SSC adapter, run through the real mapper on the labels SSC's portal actually shows.
 *
 * The Education Details case is a regression: before adapter 1.2.0 every box on that page was
 * either skipped or mapped to the wrong thing — "Roll Number" to the class-10 roll number while
 * the page asked about class 12, and "State/ UT of Board/ University" to the customer's home
 * state. All values below are fake.
 */

import { describe, expect, it } from 'vitest';
import { BUILT_IN_ADAPTER_BY_SLUG } from './adapter-registry';
import { adapterFieldMatchScore } from './adapters';
import { proposeMappings, type MappingInput } from './mapper';
import type { DetectedField, EducationLevel } from './types';

const adapter = BUILT_IN_ADAPTER_BY_SLUG.get('ssc-portal') ?? null;

let order = 0;

function field(
  signature: string,
  labelText: string,
  overrides: Partial<DetectedField> = {},
): DetectedField {
  return {
    signature,
    tagName: 'input',
    inputType: 'text',
    name: `ctrl_${order}`,
    id: null,
    placeholder: null,
    labelText,
    ariaLabel: null,
    nearbyText: null,
    sectionHeading: null,
    options: null,
    required: true,
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

const select = (signature: string, labelText: string, overrides: Partial<DetectedField> = {}) =>
  field(signature, labelText, { tagName: 'select', inputType: 'select-one', ...overrides });

/** The Education Details page from the bug report, as the detector reads it. */
const EDUCATION_PAGE: DetectedField[] = [
  select('highest', '19. Highest Educational Qualification:', { hasValue: true }),
  select('qualifying', '20. Details of Qualifying Educational Qualification:', {
    hasValue: true,
    sectionHeading: 'Qualifying Educational Qualification',
  }),
  select('status', '20.1. EQ Status:', { hasValue: true }),
  select('year', '20.2. Passing Year:'),
  select('board_state', '20.3. State/ UT of Board/ University:'),
  select('board', '20.4. Name of Board/ University:'),
  field('roll', '20.5. Roll Number:', { placeholder: 'Enter roll no here...' }),
  field(
    'percent',
    "20.6. Percentage: (Note: Candidates who do not have their percentage mentioned on their marksheet due to COVID-19 or any other reasons for the years 2020 and 2021 can enter 'NA' )",
  ),
].map((entry) => ({
  ...entry,
  sectionHeading: entry.sectionHeading ?? 'Qualifying Educational Qualification',
}));

const EDUCATION_VALUES = {
  'customer.education.class10.roll_number': '1100001',
  'customer.education.class10.passing_year': '2023',
  'customer.education.class10.board': 'Demo Secondary Board',
  'customer.education.class10.marks_percentage': '81.2',
  'customer.education.class12.roll_number': '2200002',
  'customer.education.class12.passing_year': '2025',
  'customer.education.class12.board': 'Demo Intermediate Council',
  'customer.education.class12.marks_percentage': '76.4',
  'customer.permanent_address.state': 'Bihar',
};

function propose(
  fields: DetectedField[],
  customerValues: MappingInput['customerValues'],
  educationLevel?: EducationLevel,
) {
  const proposal = proposeMappings({
    detection: {
      page: {
        origin: 'https://ssc.gov.in',
        path: '/candidate-portal/otr',
        title: null,
        blockedFrames: 0,
      },
      fields,
    },
    customerValues,
    adapter,
    ...(educationLevel ? { educationLevel } : {}),
  });
  const bySignature = new Map(proposal.mappings.map((mapping) => [mapping.signature, mapping]));
  return { proposal, get: (signature: string) => bySignature.get(signature) };
}

describe('ssc-portal — Education Details page', () => {
  it('is the adapter the SSC URL selects', () => {
    expect(adapter?.slug).toBe('ssc-portal');
  });

  it("never fills the board's state from the customer's home state", () => {
    const { get } = propose(EDUCATION_PAGE, EDUCATION_VALUES);
    expect(get('board_state')?.customerField).not.toBe('customer.permanent_address.state');
  });

  it("guesses the customer's highest level, and asks for review on every guessed row", () => {
    const { proposal, get } = propose(EDUCATION_PAGE, EDUCATION_VALUES);

    expect(get('roll')?.customerField).toBe('customer.education.class12.roll_number');
    expect(get('year')?.customerField).toBe('customer.education.class12.passing_year');
    expect(get('board')?.customerField).toBe('customer.education.class12.board');
    expect(get('percent')?.customerField).toBe('customer.education.class12.marks_percentage');

    for (const signature of ['roll', 'year', 'board', 'percent']) {
      expect(get(signature)?.skipReason, signature).toBeUndefined();
      expect(get(signature)?.reviewRequired, signature).toBe(true);
      expect(get(signature)?.educationLevel, signature).toEqual({
        level: 'class12',
        source: 'profile',
      });
    }

    expect(proposal.educationLevel).toEqual({
      level: 'class12',
      source: 'profile',
      withData: ['class12', 'class10'],
    });
  });

  it("follows the operator's pick over the profile guess", () => {
    const { proposal, get } = propose(EDUCATION_PAGE, EDUCATION_VALUES, 'class10');

    expect(get('roll')?.customerField).toBe('customer.education.class10.roll_number');
    expect(get('board')?.customerField).toBe('customer.education.class10.board');
    expect(get('roll')?.educationLevel).toEqual({ level: 'class10', source: 'operator' });
    // The level is the operator's own statement now, so it no longer forces review by itself.
    expect(get('roll')?.reviewRequired).toBe(false);
    expect(proposal.educationLevel?.source).toBe('operator');
  });

  it('lets a box that names its own level beat the operator pick', () => {
    const fields = [
      field('matric_roll', 'Matriculation Roll Number', { sectionHeading: 'Basic Details' }),
    ];
    const { proposal, get } = propose(fields, EDUCATION_VALUES, 'class12');

    expect(get('matric_roll')?.customerField).toBe('customer.education.class10.roll_number');
    expect(get('matric_roll')?.educationLevel).toEqual({ level: 'class10', source: 'label' });
    // Nothing on this page depended on the page-wide level, so the picker is not offered.
    expect(proposal.educationLevel).toBeNull();
  });

  it('still recognises the boxes when the profile has no education at all', () => {
    const { proposal, get } = propose(EDUCATION_PAGE, {});

    for (const signature of ['roll', 'year', 'board', 'percent']) {
      expect(get(signature)?.customerField, signature).not.toBeNull();
      expect(get(signature)?.skipReason, signature).toBe('no_value');
    }
    // The picker is still offered, so the operator can say which qualification this is.
    expect(proposal.educationLevel).toEqual({ level: null, source: null, withData: [] });
  });

  it('leaves the portal-choice dropdowns the operator already answered alone', () => {
    const { get } = propose(EDUCATION_PAGE, EDUCATION_VALUES);
    for (const signature of ['highest', 'qualifying', 'status']) {
      expect(get(signature)?.skipReason, signature).toBe('already_filled');
    }
  });
});

describe('ssc-portal — personal and address details', () => {
  const VALUES = {
    'customer.full_name': 'ASHA DEMO',
    'customer.nationality': 'Indian',
    'customer.mobile': '9000000001',
    'customer.mobile_alt': '9000000002',
    'customer.permanent_address.house_number': 'House 1, Demo Lane',
    'customer.permanent_address.state': 'Bihar',
    'customer.permanent_address.pincode': '800001',
    'customer.address.house_number': 'Flat 9, Sample Road',
    'customer.address.state': 'Delhi',
    'customer.address.pincode': '110001',
  };

  it('does not read "Have you ever changed your name?" as the name box', () => {
    const { get } = propose(
      [
        field('changed', 'Have you ever changed your name?', { inputType: 'radio' }),
        field('name', "Candidate's Name (as per Matriculation certificate)"),
      ],
      VALUES,
    );
    expect(get('changed')?.customerField).not.toBe('customer.full_name');
    expect(get('name')?.customerField).toBe('customer.full_name');
  });

  it('never lets the alternate-mobile field claim an OTP input (Rule 3)', () => {
    const alternate = adapter?.fields.find((entry) => entry.key === 'alternate_mobile');
    expect(alternate).toBeDefined();
    for (const label of [
      'Enter OTP sent to alternate mobile number',
      'Alternate Mobile Verification Code',
      'One Time Password sent to your alternate mobile',
    ]) {
      expect(
        adapterFieldMatchScore(alternate as NonNullable<typeof alternate>, {
          signature: 'sig',
          name: null,
          id: null,
          labelText: label,
        }),
        label,
      ).toBeNull();
    }
  });

  it('maps nationality and the alternate mobile without touching the primary one', () => {
    const { get } = propose(
      [
        select('nationality', 'Nationality'),
        field('mobile', 'Mobile Number'),
        field('alt', 'Alternate Mobile Number'),
      ],
      VALUES,
    );
    expect(get('nationality')?.customerField).toBe('customer.nationality');
    expect(get('mobile')?.customerField).toBe('customer.mobile');
    expect(get('alt')?.customerField).toBe('customer.mobile_alt');
  });

  it('maps a generic address block by its section heading', () => {
    const present = { sectionHeading: 'Present Address' };
    const permanent = { sectionHeading: 'Permanent Address' };
    const { get } = propose(
      [
        field('present_line1', 'Address Line 1', present),
        select('present_state', 'State/UT', present),
        field('present_pin', 'PIN Code', present),
        field('permanent_line1', 'Address Line 1', permanent),
        select('permanent_state', 'State/UT', permanent),
        field('permanent_pin', 'PIN Code', permanent),
      ],
      VALUES,
    );
    expect(get('present_line1')?.customerField).toBe('customer.address.house_number');
    expect(get('present_state')?.customerField).toBe('customer.address.state');
    expect(get('present_pin')?.customerField).toBe('customer.address.pincode');
    expect(get('permanent_line1')?.customerField).toBe('customer.permanent_address.house_number');
    expect(get('permanent_state')?.customerField).toBe('customer.permanent_address.state');
    expect(get('permanent_pin')?.customerField).toBe('customer.permanent_address.pincode');
  });

  it("trusts the box's own label over a heading that disagrees", () => {
    const { get } = propose(
      [field('line1', 'Permanent Address Line 1', { sectionHeading: 'Present Address' })],
      VALUES,
    );
    expect(get('line1')?.customerField).toBe('customer.permanent_address.house_number');
  });

  it('never claims the "same as permanent address" checkbox as an address line', () => {
    const { get } = propose(
      [field('same', 'Present address same as permanent address', { inputType: 'checkbox' })],
      VALUES,
    );
    expect(get('same')?.source).not.toBe('adapter');
  });
});
