import { describe, expect, it } from 'vitest';
import { checkUploadSize, pickAutoMatch, pickAutoMatches } from './auto-match';
import type {
  DerivativeSuggestion,
  DetectedField,
  DocumentPresetSummary,
  DocumentSuggestion,
} from './types';

// Fake ids and filenames only — no real citizen data (CLAUDE.md).
let next = 0;
function uuid(): string {
  next += 1;
  return `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
}

function file(overrides: Partial<DerivativeSuggestion> = {}): DerivativeSuggestion {
  return {
    id: uuid(),
    filename: 'demo.jpg',
    sizeBytes: 30 * 1024,
    width: null,
    height: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    mimeType: 'image/jpeg',
    matchesPreset: false,
    kind: 'derivative',
    ...overrides,
  };
}

const PHOTO_PRESET: DocumentPresetSummary = {
  code: 'demo_photo',
  label: 'Photograph',
  portal: 'Demo Portal',
  minBytes: 20 * 1024,
  maxBytes: 50 * 1024,
  widthPx: null,
  heightPx: null,
  widthMm: null,
  heightMm: null,
  dpi: null,
  colorMode: null,
  notes: null,
};

function suggestion(overrides: Partial<DocumentSuggestion> = {}): DocumentSuggestion {
  return {
    signature: 'sig-photo',
    category: 'photo',
    documentType: 'photo',
    preset: PHOTO_PRESET,
    suggestions: [],
    ...overrides,
  };
}

function uploadField(
  overrides: Partial<DetectedField> = {},
): Pick<DetectedField, 'signature' | 'inputType' | 'accept' | 'uploadConstraints' | 'visible'> {
  return { signature: 'sig-photo', inputType: 'file', accept: null, visible: true, ...overrides };
}

describe('checkUploadSize', () => {
  it('reports where a file sits against the window', () => {
    expect(checkUploadSize(30, { minBytes: 20, maxBytes: 50 })).toBe('fits');
    expect(checkUploadSize(10, { minBytes: 20, maxBytes: 50 })).toBe('too_small');
    expect(checkUploadSize(60, { minBytes: 20, maxBytes: 50 })).toBe('too_large');
    expect(checkUploadSize(60, { minBytes: null, maxBytes: null })).toBe('unstated');
    expect(checkUploadSize(5, { minBytes: null, maxBytes: 50 })).toBe('fits');
  });
});

describe('pickAutoMatch', () => {
  it('pre-selects the one derivative prepared for this preset', () => {
    const prepared = file({ matchesPreset: true });
    const other = file();
    const pick = pickAutoMatch(suggestion({ suggestions: [prepared, other] }), uploadField());
    expect(pick).toMatchObject({ file: { id: prepared.id }, reason: 'preset', size: 'fits' });
  });

  it('leaves two preset matches for the operator instead of falling through', () => {
    const typed = file({ kind: 'source_document', documentType: 'photo' });
    const pick = pickAutoMatch(
      suggestion({
        suggestions: [file({ matchesPreset: true }), file({ matchesPreset: true }), typed],
      }),
      uploadField(),
    );
    expect(pick).toBeNull();
  });

  it('pre-selects the one original upload of the exact type the box names', () => {
    const caste = file({
      kind: 'source_document',
      documentType: 'caste_certificate',
      mimeType: 'application/pdf',
      filename: 'demo.pdf',
    });
    const unknown = file({
      kind: 'source_document',
      documentType: 'unknown',
      mimeType: 'application/pdf',
      filename: 'demo-2.pdf',
    });
    const pick = pickAutoMatch(
      suggestion({
        signature: 'sig-caste',
        category: 'pdf',
        documentType: 'caste_certificate',
        preset: null,
        suggestions: [unknown, caste],
      }),
      uploadField({ signature: 'sig-caste' }),
    );
    expect(pick).toMatchObject({ file: { id: caste.id }, reason: 'document_type', size: 'unstated' });
  });

  it('never pre-selects on category alone', () => {
    const pick = pickAutoMatch(
      suggestion({ documentType: null, preset: null, suggestions: [file()] }),
      uploadField(),
    );
    expect(pick).toBeNull();
  });

  it('skips a file the box would reject by accept or by size', () => {
    const png = file({ matchesPreset: true, mimeType: 'image/png', filename: 'demo.png' });
    expect(
      pickAutoMatch(suggestion({ suggestions: [png] }), uploadField({ accept: 'image/jpeg' })),
    ).toBeNull();

    const oversized = file({ matchesPreset: true, sizeBytes: 400 * 1024 });
    expect(pickAutoMatch(suggestion({ suggestions: [oversized] }), uploadField())).toBeNull();
  });

  it('holds a file to the size window the page states when there is no preset', () => {
    const typed = file({ kind: 'source_document', documentType: 'photo', sizeBytes: 300 * 1024 });
    const pick = pickAutoMatch(
      suggestion({ preset: null, suggestions: [typed] }),
      uploadField({ uploadConstraints: { minBytes: null, maxBytes: 100 * 1024, formats: [] } }),
    );
    expect(pick).toBeNull();
  });

  it('ignores an invisible or non-file field', () => {
    const s = suggestion({ suggestions: [file({ matchesPreset: true })] });
    expect(pickAutoMatch(s, uploadField({ visible: false }))).toBeNull();
    expect(pickAutoMatch(s, uploadField({ inputType: 'text' }))).toBeNull();
  });
});

describe('pickAutoMatches', () => {
  it('only pre-selects boxes the detection still reports', () => {
    const picks = pickAutoMatches(
      [suggestion({ suggestions: [file({ matchesPreset: true })] })],
      [uploadField({ signature: 'some-other-box' })],
    );
    expect(picks).toEqual([]);
  });

  it('leaves both boxes alone when one file would fill two of them', () => {
    const shared = file({ matchesPreset: true });
    const signatureFile = file({ matchesPreset: true });
    const picks = pickAutoMatches(
      [
        suggestion({ signature: 'a', suggestions: [shared] }),
        suggestion({ signature: 'b', suggestions: [shared] }),
        suggestion({
          signature: 'c',
          category: 'signature',
          documentType: 'signature',
          suggestions: [signatureFile],
        }),
      ],
      [uploadField({ signature: 'a' }), uploadField({ signature: 'b' }), uploadField({ signature: 'c' })],
    );
    expect(picks.map((pick) => pick.signature)).toEqual(['c']);
  });
});
