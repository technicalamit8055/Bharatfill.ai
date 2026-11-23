/**
 * Document sync decisions (docs/VAULT_BRIDGE_DESIGN.md §3.2): the planner and the vault index's
 * sync bookkeeping. Pure; titles are placeholders, not anyone's documents.
 */

import { describe, expect, it } from 'vitest';

import { cloudTitle, planSync, syncFileKind } from '../lib/cloud/sync-plan';
import {
  EMPTY_VAULT_INDEX,
  parseVaultIndex,
  phoneOnlyForNewDocument,
  serialiseVaultIndex,
  type VaultDocument,
  type VaultIndex,
  withCloudDeleteDone,
  withCloudForgotten,
  withCloudSynced,
  withDetails,
  withDocument,
  withoutDocument,
  withPhoneOnly,
  withUploadFinished,
} from '../lib/vault/vault-index';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const CLOUD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLOUD_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const untitled = (source: 'scanner' | 'gallery') =>
  source === 'scanner' ? 'Scanned document' : 'Imported document';

function doc(id: string, extra: Partial<VaultDocument> = {}): VaultDocument {
  return {
    id,
    createdAt: '2026-11-17T10:00:00.000Z',
    source: 'scanner',
    pages: [{ mimeType: 'image/jpeg' }],
    ...extra,
  };
}

function indexOf(...documents: VaultDocument[]): VaultIndex {
  return documents.reduce(withDocument, EMPTY_VAULT_INDEX);
}

const plan = (index: VaultIndex, cloudEnabled = true) =>
  planSync(index, { cloudEnabled, untitled });

describe('planSync', () => {
  it('uploads a document with no cloud copy, titled as the vault shows it', () => {
    expect(plan(indexOf(doc(A)))).toEqual([
      {
        kind: 'upload',
        documentId: A,
        title: 'Scanned document',
        documentType: 'generic',
        category: 'other',
      },
    ]);
  });

  it('uploads a document with the folder it is filed in', () => {
    expect(plan(indexOf(doc(A, { documentType: 'pan', category: 'identity' })))[0]).toMatchObject({
      kind: 'upload',
      category: 'identity',
    });
  });

  it('uploads nothing that is phone-only, or when cloud backup is off', () => {
    expect(plan(indexOf(doc(A, { phoneOnly: true })))).toEqual([]);
    expect(plan(indexOf(doc(A)), false)).toEqual([]);
  });

  it('leaves an unchanged synced document alone', () => {
    const synced = doc(A, {
      title: 'Marksheet',
      documentType: 'marksheet_10',
      category: 'academic',
      cloud: {
        id: CLOUD_A,
        title: 'Marksheet',
        documentType: 'marksheet_10',
        category: 'academic',
      },
    });
    expect(plan(indexOf(synced))).toEqual([]);
  });

  it('sends a move to another folder', () => {
    const moved = doc(A, {
      title: 'Aadhaar',
      documentType: 'aadhaar_like',
      category: 'certificate',
      cloud: { id: CLOUD_A, title: 'Aadhaar', documentType: 'aadhaar_like', category: 'identity' },
    });
    expect(plan(indexOf(moved))).toEqual([
      {
        kind: 'update',
        documentId: A,
        cloudId: CLOUD_A,
        title: 'Aadhaar',
        documentType: 'aadhaar_like',
        category: 'certificate',
      },
    ]);
  });

  it('sends the folder once for a copy synced before folders synced', () => {
    const older = doc(A, {
      title: 'PAN',
      documentType: 'pan',
      category: 'identity',
      cloud: { id: CLOUD_A, title: 'PAN', documentType: 'pan' },
    });
    const [action] = plan(indexOf(older));
    expect(action).toMatchObject({ kind: 'update', category: 'identity' });

    const recorded = withCloudSynced(indexOf(older), A, {
      id: CLOUD_A,
      title: 'PAN',
      documentType: 'pan',
      category: 'identity',
    });
    expect(plan(recorded)).toEqual([]);
  });

  it('sends a rename or a retype', () => {
    const renamed = doc(A, {
      title: 'Class 10 marksheet',
      documentType: 'marksheet_10',
      category: 'academic',
      cloud: {
        id: CLOUD_A,
        title: 'Marksheet',
        documentType: 'marksheet_10',
        category: 'academic',
      },
    });
    expect(plan(indexOf(renamed))).toEqual([
      {
        kind: 'update',
        documentId: A,
        cloudId: CLOUD_A,
        title: 'Class 10 marksheet',
        documentType: 'marksheet_10',
        category: 'academic',
      },
    ]);
  });

  it('runs queued deletes first, even with cloud backup off', () => {
    const index = withoutDocument(
      indexOf(doc(A, { cloud: { id: CLOUD_A, title: 'X', documentType: 'generic' } }), doc(B)),
      A,
    );
    expect(plan(index, false)).toEqual([{ kind: 'delete', cloudId: CLOUD_A }]);
    expect(plan(index, true)[0]).toEqual({ kind: 'delete', cloudId: CLOUD_A });
  });

  it('never deletes a cloud copy just because this phone lacks the document', () => {
    // A restored phone: empty local vault, nothing queued. Nothing may be deleted.
    expect(plan(EMPTY_VAULT_INDEX)).toEqual([]);
  });
});

describe('vault index sync bookkeeping', () => {
  it('queues the cloud copy when a synced document is deleted, once', () => {
    const synced = indexOf(doc(A, { cloud: { id: CLOUD_A, title: 'X', documentType: 'generic' } }));
    const gone = withoutDocument(withoutDocument(synced, A), A);
    expect(gone.cloudDeletes).toEqual([CLOUD_A]);
    expect(withCloudDeleteDone(gone, CLOUD_A).cloudDeletes).toEqual([]);
  });

  it('deleting a never-synced document queues nothing', () => {
    expect(withoutDocument(indexOf(doc(A)), A).cloudDeletes).toBeUndefined();
  });

  it('phone-only on a synced document forgets the copy and queues its deletion', () => {
    const synced = indexOf(doc(A, { cloud: { id: CLOUD_A, title: 'X', documentType: 'generic' } }));
    const local = withPhoneOnly(synced, A, true);
    expect(local.documents[0]?.cloud).toBeUndefined();
    expect(local.documents[0]?.phoneOnly).toBe(true);
    expect(local.cloudDeletes).toEqual([CLOUD_A]);

    // …and turning it back off makes it upload again.
    const back = withPhoneOnly(local, A, false);
    expect(plan(back).map((action) => action.kind)).toEqual(['delete', 'upload']);
  });

  it('an upload finishing for a document deleted meanwhile queues the new copy for deletion', () => {
    const cloud = { id: CLOUD_B, title: 'X', documentType: 'generic' as const };
    expect(withUploadFinished(EMPTY_VAULT_INDEX, A, cloud).cloudDeletes).toEqual([CLOUD_B]);
    const phoneOnly = indexOf(doc(A, { phoneOnly: true }));
    expect(withUploadFinished(phoneOnly, A, cloud).cloudDeletes).toEqual([CLOUD_B]);
    expect(withUploadFinished(indexOf(doc(A)), A, cloud).documents[0]?.cloud).toEqual(cloud);
  });

  it('forgetting a cloud copy makes the document upload again', () => {
    const synced = withCloudSynced(indexOf(doc(A)), A, {
      id: CLOUD_A,
      title: 'Scanned document',
      documentType: 'generic',
      category: 'other',
    });
    expect(plan(synced)).toEqual([]);
    expect(plan(withCloudForgotten(synced, A))[0]?.kind).toBe('upload');
  });

  it('keeps sync state through a rename and a save/load round trip', () => {
    const synced = withCloudSynced(indexOf(doc(A, { title: 'Old' })), A, {
      id: CLOUD_A,
      title: 'Old',
      documentType: 'generic',
    });
    const renamed = withDetails(synced, A, { title: 'New' });
    const reloaded = parseVaultIndex(serialiseVaultIndex(renamed));
    expect(reloaded?.documents[0]?.cloud?.id).toBe(CLOUD_A);
    expect(plan(reloaded!)[0]).toMatchObject({ kind: 'update', title: 'New' });
  });

  it('still reads an index written before sync existed', () => {
    const old = JSON.stringify({ version: 1, documents: [doc(A)] });
    expect(parseVaultIndex(old)?.documents).toHaveLength(1);
  });
});

describe('what a document syncs as', () => {
  it('a lone JPEG, PNG or WebP page as itself; anything else as one PDF', () => {
    expect(syncFileKind(doc(A))).toBe('image');
    expect(syncFileKind(doc(A, { pages: [{ mimeType: 'image/heic' }] }))).toBe('pdf');
    expect(
      syncFileKind(doc(A, { pages: [{ mimeType: 'image/jpeg' }, { mimeType: 'image/jpeg' }] })),
    ).toBe('pdf');
  });

  it('caps a title at the server limit', () => {
    expect(cloudTitle(doc(A, { title: 'x'.repeat(80) }), untitled)).toHaveLength(80);
  });
});

describe('everyday scans stay on the phone (design §15)', () => {
  /** A document as `saveDocument` writes it: the details plus the sharing answer. */
  function saved(id: string, details: Partial<VaultDocument>): VaultDocument {
    return doc(id, { ...details, phoneOnly: phoneOnlyForNewDocument(details) });
  }

  it('uploads a form document straight away, never an Other one or one with no type', () => {
    const index = indexOf(
      saved(A, { documentType: 'aadhaar_like', category: 'identity' }),
      saved(B, { documentType: 'generic' }),
      saved('33333333-3333-4333-8333-333333333333', {}),
    );
    expect(plan(index)).toEqual([expect.objectContaining({ kind: 'upload', documentId: A })]);
  });

  it('uploads what the citizen chose to share, and never what they chose to keep', () => {
    const index = indexOf(
      saved(A, { documentType: 'generic', phoneOnly: false, phoneOnlyChosen: true }),
      saved(B, {
        documentType: 'pan',
        category: 'identity',
        phoneOnly: true,
        phoneOnlyChosen: true,
      }),
    );
    expect(plan(index)).toEqual([expect.objectContaining({ kind: 'upload', documentId: A })]);
  });

  it('still syncs a document saved before the default existed', () => {
    expect(plan(indexOf(doc(A, { documentType: 'generic' })))[0]).toMatchObject({
      kind: 'upload',
    });
  });

  it('shares an Other document once it is filed in a vault folder', () => {
    const moved = withDetails(indexOf(saved(A, { documentType: 'generic' })), A, {
      category: 'certificate',
    });
    expect(moved.documents[0]?.phoneOnly).toBe(false);
    expect(plan(moved)[0]).toMatchObject({ kind: 'upload', category: 'certificate' });
  });

  it('never shares on a move what the citizen chose to keep on the phone', () => {
    const kept = withPhoneOnly(indexOf(saved(A, { documentType: 'generic' })), A, true);
    const moved = withDetails(kept, A, { category: 'identity' });
    expect(moved.documents[0]?.phoneOnly).toBe(true);
    expect(plan(moved)).toEqual([]);
  });

  it('never stops sharing because of a move', () => {
    const shared = indexOf(saved(A, { documentType: 'generic', category: 'identity' }));
    const moved = withDetails(shared, A, { category: null });
    expect(moved.documents[0]?.phoneOnly).toBe(false);
  });
});
