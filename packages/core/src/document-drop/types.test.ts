/**
 * Tests for the drop-intake schemas and helpers.
 *
 * The webhook schemas are the boundary two third parties push arbitrary JSON across, so what is
 * worth asserting is the pair of properties they have to hold at once: reject a body that is
 * missing what intake reads, and tolerate a body carrying fields it has never seen — a provider
 * shipping a new key must not stop a citizen's documents arriving.
 */

import { describe, expect, it } from 'vitest';
import {
  DROP_SESSION_TTL_MINUTES,
  MAX_DROP_FILES_PER_SESSION,
  convertDropSessionSchema,
  createDropSessionSchema,
  dropStoragePath,
  isClaimableDropStatus,
  isDropChannel,
  simulateDropSchema,
  suggestDocumentTypeFromHint,
  telegramUpdateSchema,
  whatsappWebhookSchema,
} from './types';

const ORG = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const FILE = '33333333-3333-4333-8333-333333333333';

describe('channels and statuses', () => {
  it('narrows a value read back from the database', () => {
    expect(isDropChannel('whatsapp')).toBe(true);
    expect(isDropChannel('signal')).toBe(false);
    expect(isDropChannel(null)).toBe(false);
  });

  it('treats only live sessions as claimable', () => {
    expect(isClaimableDropStatus('active')).toBe(true);
    // "DONE" is the citizen's opinion, not a lock: a ready session still accepts a late file.
    expect(isClaimableDropStatus('ready')).toBe(true);
    expect(isClaimableDropStatus('converted')).toBe(false);
    expect(isClaimableDropStatus('expired')).toBe(false);
    expect(isClaimableDropStatus('abandoned')).toBe(false);
  });

  it('keeps the unclaimed window short', () => {
    // Unclaimed intake holds identity documents outside the customer record (§12.7).
    expect(DROP_SESSION_TTL_MINUTES).toBeLessThanOrEqual(120);
  });
});

describe('dropStoragePath', () => {
  it('scopes the path to the organization and the session', () => {
    expect(
      dropStoragePath({
        organizationId: ORG,
        sessionId: SESSION,
        fileId: FILE,
        filename: 'aadhaar.jpg',
      }),
    ).toBe(`org/${ORG}/drop/${SESSION}/${FILE}-aadhaar.jpg`);
  });

  it('sanitises a filename a sender controls', () => {
    // The filename arrives from a stranger's phone: traversal and control characters must not
    // survive into a storage key.
    const path = dropStoragePath({
      organizationId: ORG,
      sessionId: SESSION,
      fileId: FILE,
      filename: '../../../etc/passwd',
    });
    expect(path).toBe(`org/${ORG}/drop/${SESSION}/${FILE}-passwd`);
    expect(path.startsWith(`org/${ORG}/`)).toBe(true);
  });
});

describe('suggestDocumentTypeFromHint', () => {
  it.each([
    ['Aadhaar card front', 'aadhaar_like'],
    ['मेरा आधार', 'aadhaar_like'],
    ['10th marksheet', 'marksheet_10'],
    ['दसवीं की मार्कशीट', 'marksheet_10'],
    ['12th intermediate', 'marksheet_12'],
    ['graduation degree', 'marksheet_graduation'],
    ['jati praman patra', 'caste_certificate'],
    ['निवास प्रमाण पत्र', 'residence_certificate'],
    ['passport size photo', 'photo'],
    ['my signature', 'signature'],
    ['marksheet', 'marksheet_10'],
  ])('reads %s as %s', (hint, expected) => {
    expect(suggestDocumentTypeFromHint(hint)).toBe(expected);
  });

  it('falls back to unknown rather than guessing', () => {
    expect(suggestDocumentTypeFromHint('yeh dekh lo')).toBe('unknown');
    expect(suggestDocumentTypeFromHint('')).toBe('unknown');
    expect(suggestDocumentTypeFromHint(null)).toBe('unknown');
    expect(suggestDocumentTypeFromHint(undefined)).toBe('unknown');
  });
});

describe('operator schemas', () => {
  it('defaults a new session to whatsapp', () => {
    expect(createDropSessionSchema.parse({})).toEqual({ channel: 'whatsapp' });
    expect(createDropSessionSchema.parse({ channel: 'telegram' }).channel).toBe('telegram');
    expect(createDropSessionSchema.safeParse({ channel: 'sms' }).success).toBe(false);
  });

  it('accepts either an existing customer or a typed name on conversion', () => {
    expect(convertDropSessionSchema.parse({ customerId: SESSION }).customerId).toBe(SESSION);
    expect(convertDropSessionSchema.parse({ fullName: '  Test Person  ' }).fullName).toBe(
      'Test Person',
    );
    expect(convertDropSessionSchema.parse({})).toEqual({});
    expect(convertDropSessionSchema.safeParse({ customerId: 'not-a-uuid' }).success).toBe(false);
    expect(convertDropSessionSchema.safeParse({ fullName: 'A' }).success).toBe(false);
  });

  it('restricts the simulator to named fixtures and a bounded count', () => {
    expect(simulateDropSchema.parse({ fixtures: ['aadhaar', 'photo'] }).fixtures).toEqual([
      'aadhaar',
      'photo',
    ]);
    // Arbitrary bytes here would be a second, unvalidated intake path.
    expect(simulateDropSchema.safeParse({ fixtures: ['whatever'] }).success).toBe(false);
    expect(simulateDropSchema.safeParse({ fixtures: [] }).success).toBe(false);
    expect(
      simulateDropSchema.safeParse({
        fixtures: Array.from({ length: MAX_DROP_FILES_PER_SESSION + 1 }, () => 'photo'),
      }).success,
    ).toBe(false);
  });

  it('rejects a simulated sender that is not a bare number', () => {
    const tooShort = simulateDropSchema.safeParse({ fixtures: ['photo'], senderId: '9199' });
    expect(tooShort.success).toBe(false);
    expect(
      simulateDropSchema.safeParse({ fixtures: ['photo'], senderId: '+91 90000 00000' }).success,
    ).toBe(false);
    expect(
      simulateDropSchema.parse({ fixtures: ['photo'], senderId: '9000000000' }).senderId,
    ).toBe('9000000000');
    // Absent is fine: a simulated drop without a sender still exercises the queue.
    expect(simulateDropSchema.parse({ fixtures: ['photo'] }).senderId).toBeUndefined();
  });
});

describe('whatsappWebhookSchema', () => {
  const body = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              contacts: [{ profile: { name: 'Test Person' }, wa_id: '919000000000' }],
              messages: [
                {
                  id: 'wamid.1',
                  from: '919000000000',
                  timestamp: '1700000000',
                  type: 'image',
                  image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'Aadhaar' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it('parses a real-shaped delivery, keeping the fields intake reads', () => {
    const parsed = whatsappWebhookSchema.parse(body);
    const message = parsed.entry[0]?.changes?.[0]?.value.messages?.[0];
    expect(message?.from).toBe('919000000000');
    expect(message?.image?.id).toBe('media-1');
    expect(message?.image?.caption).toBe('Aadhaar');
  });

  it('tolerates unknown fields Meta adds later', () => {
    const withExtras = structuredClone(body) as Record<string, unknown> & {
      entry: { changes: { value: Record<string, unknown> }[] }[];
    };
    const value = withExtras.entry[0]?.changes?.[0]?.value;
    if (value) {
      value.statuses = [{ id: 'wamid.1', status: 'delivered' }];
      value.some_new_key = { nested: true };
    }
    expect(whatsappWebhookSchema.safeParse(withExtras).success).toBe(true);
  });

  it('defaults a delivery with no entries rather than failing', () => {
    // Meta sends these; a 500 back at them earns a retry storm, not useful information.
    expect(whatsappWebhookSchema.parse({ object: 'whatsapp_business_account' }).entry).toEqual([]);
  });

  it('rejects a message missing the fields intake needs', () => {
    expect(
      whatsappWebhookSchema.safeParse({
        entry: [{ changes: [{ value: { messages: [{ type: 'text' }] } }] }],
      }).success,
    ).toBe(false);
  });
});

describe('telegramUpdateSchema', () => {
  it('parses a photo message, largest rendition last', () => {
    const parsed = telegramUpdateSchema.parse({
      update_id: 42,
      message: {
        message_id: 7,
        date: 1700000000,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, first_name: 'Test', is_bot: false },
        caption: '10th marksheet',
        photo: [
          { file_id: 'small', file_size: 1024, width: 90, height: 120 },
          { file_id: 'large', file_size: 204800, width: 900, height: 1200 },
        ],
      },
    });

    expect(parsed.message?.photo?.at(-1)?.file_id).toBe('large');
    expect(parsed.message?.chat.id).toBe(12345);
  });

  it('accepts a string chat id, which the API uses for channels', () => {
    const parsed = telegramUpdateSchema.parse({
      update_id: 1,
      message: { message_id: 1, chat: { id: '@centre' }, text: '/start DROP-7429' },
    });
    expect(parsed.message?.chat.id).toBe('@centre');
  });

  it('rejects an update with no update_id', () => {
    expect(telegramUpdateSchema.safeParse({ message: { message_id: 1 } }).success).toBe(false);
  });

  it('accepts an update carrying nothing intake handles', () => {
    // An edited message or a poll answer: parsed fine, then ignored by the handler.
    expect(telegramUpdateSchema.safeParse({ update_id: 9, edited_message: {} }).success).toBe(true);
  });
});
