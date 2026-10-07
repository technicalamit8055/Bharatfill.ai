import { describe, expect, it } from 'vitest';
import {
  educationLevelInText,
  educationLevelOfField,
  educationLevelsWithData,
  fallbackEducationLevel,
} from './education-level';

describe('educationLevelInText', () => {
  it.each([
    ['Matriculation Roll Number', 'class10'],
    ['10th Board', 'class10'],
    ['Class X passing year', 'class10'],
    ['High School', 'class10'],
    ['दसवीं रोल नंबर', 'class10'],
    ['Higher Secondary (10+2)', 'class12'],
    ['12th Standard', 'class12'],
    ['Intermediate Board', 'class12'],
    ['Senior Secondary', 'class12'],
    ['बारहवीं बोर्ड', 'class12'],
    ['Graduation Details', 'graduation'],
    ["Bachelor's Degree", 'graduation'],
  ] as const)('reads %s as %s', (text, level) => {
    expect(educationLevelInText(text)).toBe(level);
  });

  it.each([
    // SSC labels a class-12 board box this way, so "University" must not mean graduation.
    '20.4. Name of Board/ University:',
    '20.5. Roll Number:',
    'Qualifying Educational Qualification',
    null,
    '',
  ])('names no level in %s', (text) => {
    expect(educationLevelInText(text)).toBeNull();
  });

  it('refuses to pick between two levels named at once', () => {
    expect(educationLevelInText('Details of 10th / 12th')).toBeNull();
  });
});

describe('educationLevelOfField', () => {
  it("prefers the box's own label to its section heading", () => {
    expect(
      educationLevelOfField({
        labelText: 'Matriculation Roll Number',
        placeholder: null,
        ariaLabel: null,
        sectionHeading: 'Intermediate (12th) Details',
      }),
    ).toBe('class10');
  });

  it('falls back to the section heading when the label is generic', () => {
    expect(
      educationLevelOfField({
        labelText: 'Roll Number',
        placeholder: null,
        ariaLabel: null,
        sectionHeading: 'Matriculation Details',
      }),
    ).toBe('class10');
  });
});

describe('educationLevelsWithData', () => {
  it('lists the levels with any non-empty value, highest first', () => {
    expect(
      educationLevelsWithData({
        'customer.education.class10.roll_number': '123',
        'customer.education.class12.board': 'BSEB',
        'customer.education.graduation.course': '  ',
        'customer.full_name': 'Asha Demo',
      }),
    ).toEqual(['class12', 'class10']);
  });
});

describe('fallbackEducationLevel', () => {
  it("uses the operator's pick when the field can map it", () => {
    expect(fallbackEducationLevel(['class10', 'class12'], 'class10', ['class12'])).toEqual({
      level: 'class10',
      source: 'operator',
    });
  });

  it('otherwise guesses the highest level the profile has data for', () => {
    expect(
      fallbackEducationLevel(['class10', 'class12', 'graduation'], null, ['class12', 'class10']),
    ).toEqual({ level: 'class12', source: 'profile' });
  });

  it('never picks a level the field cannot map', () => {
    expect(fallbackEducationLevel(['class10'], 'graduation', ['graduation'])).toBeNull();
  });
});
