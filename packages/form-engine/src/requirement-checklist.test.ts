import { describe, expect, it } from 'vitest';
import { SCHEME_DOCUMENT_KEYS } from '@assistigo/core';
import { BUILT_IN_ADAPTER_BY_SLUG } from './adapter-registry';
import { documentTypesNamedIn } from './documents';
import {
  buildDocumentChecklist,
  requirementsFromAdapter,
  requirementsFromScheme,
  summariseChecklist,
  type ChecklistDerivative,
  type ChecklistDocument,
  type ChecklistRequirement,
} from './requirement-checklist';

const SSC = BUILT_IN_ADAPTER_BY_SLUG.get('ssc-portal');
const RTPS = BUILT_IN_ADAPTER_BY_SLUG.get('bihar-rtps-serviceonline');

function doc(overrides: Partial<ChecklistDocument> & { id: string }): ChecklistDocument {
  return {
    documentType: 'generic',
    status: 'extracted',
    createdAt: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

function derivative(overrides: Partial<ChecklistDerivative> & { id: string }): ChecklistDerivative {
  return {
    sourceDocumentId: null,
    toolType: 'photo',
    presetCode: null,
    createdAt: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

function requirement(overrides: Partial<ChecklistRequirement> = {}): ChecklistRequirement {
  return {
    key: 'photo',
    label: { en: 'Photograph' },
    required: true,
    presetCode: null,
    acceptedTypes: ['photo'],
    ...overrides,
  };
}

describe('documentTypesNamedIn', () => {
  it('returns every alternative a requirement offers, not just the first', () => {
    expect(documentTypesNamedIn('Address proof (Aadhaar / voter ID / electricity bill)')).toEqual([
      'voter_id',
      'aadhaar_like',
    ]);
  });

  it('names nothing for a requirement no document type describes', () => {
    expect(documentTypesNamedIn('Self declaration (स्वघोषणा)')).toEqual([]);
  });
});

describe('requirementsFromAdapter', () => {
  it('reads the real SSC adapter: a photo and a signature, each with its preset', () => {
    expect(SSC).toBeDefined();
    const requirements = requirementsFromAdapter(SSC?.documentRequirements ?? []);
    expect(requirements.map((item) => [item.key, item.presetCode, item.acceptedTypes])).toEqual([
      ['photo', 'ssc.photo', ['photo']],
      ['signature', 'ssc.signature', ['signature']],
    ]);
  });

  it('reads the real RTPS adapter, leaving the self declaration to the operator', () => {
    expect(RTPS).toBeDefined();
    const requirements = requirementsFromAdapter(RTPS?.documentRequirements ?? []);
    const byKey = new Map(requirements.map((item) => [item.key, item]));
    expect(byKey.get('photo')?.acceptedTypes).toEqual(['photo']);
    expect(byKey.get('address_proof')?.acceptedTypes).toEqual(['voter_id', 'aadhaar_like']);
    expect(byKey.get('self_declaration')?.acceptedTypes).toEqual([]);
    expect(byKey.get('self_declaration')?.required).toBe(false);
  });
});

describe('requirementsFromScheme', () => {
  it('has a label for every scheme document key', () => {
    const requirements = requirementsFromScheme(SCHEME_DOCUMENT_KEYS);
    expect(requirements).toHaveLength(SCHEME_DOCUMENT_KEYS.length);
    for (const item of requirements) expect(item.label.en.length).toBeGreaterThan(0);
  });

  it('maps a domicile certificate onto the residence certificate upload type', () => {
    expect(requirementsFromScheme(['domicile_certificate'])[0]?.acceptedTypes).toEqual([
      'residence_certificate',
    ]);
  });
});

describe('buildDocumentChecklist', () => {
  it('marks a document of an accepted type as ready, whatever its reading state', () => {
    const [item] = buildDocumentChecklist({
      requirements: [requirement({ key: 'address', acceptedTypes: ['voter_id', 'aadhaar_like'] })],
      documents: [doc({ id: 'd1', documentType: 'aadhaar_like', status: 'failed' })],
      derivatives: [],
    });
    expect(item).toMatchObject({ state: 'ready', documentId: 'd1' });
  });

  it('suggests the first accepted type for a missing upload', () => {
    const [item] = buildDocumentChecklist({
      requirements: [requirement({ key: 'address', acceptedTypes: ['voter_id', 'aadhaar_like'] })],
      documents: [],
      derivatives: [],
    });
    expect(item).toMatchObject({ state: 'missing', uploadType: 'voter_id' });
  });

  it('does not count a photo the classifier guessed — only one a person chose', () => {
    // A phone photo of a marksheet comes back typed `photo` with a reading status.
    const guessed = doc({ id: 'guessed', documentType: 'photo', status: 'review_required' });
    const chosen = doc({ id: 'chosen', documentType: 'photo', status: 'stored' });

    expect(
      buildDocumentChecklist({
        requirements: [requirement()],
        documents: [guessed],
        derivatives: [],
      })[0]?.state,
    ).toBe('missing');
    expect(
      buildDocumentChecklist({
        requirements: [requirement()],
        documents: [guessed, chosen],
        derivatives: [],
      })[0],
    ).toMatchObject({ state: 'ready', documentId: 'chosen' });
  });

  it('needs a file prepared for that exact preset before a preset requirement is ready', () => {
    const photo = doc({ id: 'p1', documentType: 'photo', status: 'stored' });
    const withPreset = requirement({ presetCode: 'ssc.photo' });

    expect(
      buildDocumentChecklist({
        requirements: [withPreset],
        documents: [photo],
        derivatives: [],
      })[0],
    ).toMatchObject({ state: 'needs_preparing', documentId: 'p1' });

    // Prepared for a different portal: still not right for SSC.
    expect(
      buildDocumentChecklist({
        requirements: [withPreset],
        documents: [photo],
        derivatives: [derivative({ id: 'x', presetCode: 'nta.photo', sourceDocumentId: 'p1' })],
      })[0]?.state,
    ).toBe('needs_preparing');

    expect(
      buildDocumentChecklist({
        requirements: [withPreset],
        documents: [photo],
        derivatives: [derivative({ id: 'r', presetCode: 'ssc.photo', sourceDocumentId: 'p1' })],
      })[0],
    ).toMatchObject({ state: 'ready', derivativeId: 'r', documentId: 'p1' });
  });

  it('counts a prepared photo for a requirement that names no preset', () => {
    const [item] = buildDocumentChecklist({
      requirements: [requirement()],
      documents: [],
      derivatives: [derivative({ id: 'r', presetCode: 'generic.passport_photo' })],
    });
    expect(item).toMatchObject({ state: 'ready', derivativeId: 'r' });
  });

  it('picks the newest matching document', () => {
    const [item] = buildDocumentChecklist({
      requirements: [requirement({ key: 'pan', acceptedTypes: ['pan'] })],
      documents: [
        doc({ id: 'old', documentType: 'pan', createdAt: '2025-01-01T00:00:00Z' }),
        doc({ id: 'new', documentType: 'pan', createdAt: '2026-06-01T00:00:00Z' }),
      ],
      derivatives: [],
    });
    expect(item?.documentId).toBe('new');
  });

  it('asks the operator to check a requirement no type can confirm', () => {
    const [item] = buildDocumentChecklist({
      requirements: [requirement({ key: 'self_declaration', acceptedTypes: [] })],
      documents: [doc({ id: 'g', documentType: 'generic' })],
      derivatives: [],
    });
    expect(item?.state).toBe('check_manually');
  });

  it('keeps the order the form lists its documents in', () => {
    const items = buildDocumentChecklist({
      requirements: [
        requirement({ key: 'signature', acceptedTypes: ['signature'] }),
        requirement({ key: 'photo' }),
      ],
      documents: [],
      derivatives: [],
    });
    expect(items.map((item) => item.requirement.key)).toEqual(['signature', 'photo']);
  });
});

describe('summariseChecklist', () => {
  it('counts only required items as outstanding', () => {
    const items = buildDocumentChecklist({
      requirements: [
        requirement({ key: 'pan', acceptedTypes: ['pan'] }),
        requirement({ key: 'extra', acceptedTypes: [], required: false }),
        requirement({ key: 'photo' }),
      ],
      documents: [doc({ id: 'p', documentType: 'pan' })],
      derivatives: [],
    });
    expect(summariseChecklist(items)).toEqual({ total: 3, ready: 1, outstanding: 1 });
  });
});
