import { describe, expect, it } from 'vitest';
import { activityDetail } from './activity';

const LABELS: Record<string, string> = { 'customer.category': 'Category' };
const labelFor = (fieldKey: string) => LABELS[fieldKey] ?? null;

describe('activityDetail', () => {
  it('describes a manual create', () => {
    expect(activityDetail('customer.created', { forced: false, sections: 3 }, labelFor)).toEqual({
      key: 'customers.activity.created',
    });
  });

  it('says when a customer was created from a document', () => {
    expect(activityDetail('customer.created', { source: 'document_drop' }, labelFor)).toEqual({
      key: 'customers.activity.createdFromDocument',
    });
    expect(activityDetail('customer.created', { hasDocumentSource: true }, labelFor)).toEqual({
      key: 'customers.activity.createdFromDocument',
    });
  });

  it('counts the fields an update touched, from either write path', () => {
    expect(
      activityDetail(
        'customer.updated',
        { acceptedKeys: ['customer.father_name', 'customer.mother_name'], rejectedKeys: [] },
        labelFor,
      ),
    ).toEqual({ key: 'customers.activity.updatedFields', values: { count: 2 } });

    expect(activityDetail('customer.updated', { fields: ['notes'] }, labelFor)).toEqual({
      key: 'customers.activity.updatedField',
      values: { count: 1 },
    });
  });

  it('falls back to a generic line when an update recorded no fields', () => {
    expect(activityDetail('customer.updated', { acceptedKeys: [] }, labelFor)).toEqual({
      key: 'customers.activity.updated',
    });
    expect(activityDetail('customer.updated', null, labelFor)).toEqual({
      key: 'customers.activity.updated',
    });
  });

  it('names a revealed field by its label, never its key', () => {
    expect(
      activityDetail('customer.sensitive_revealed', { fieldKey: 'customer.category' }, labelFor),
    ).toEqual({ key: 'customers.activity.revealedField', values: { field: 'Category' } });
  });

  it('does not echo an unknown field key', () => {
    const detail = activityDetail(
      'customer.sensitive_revealed',
      { fieldKey: 'customer.not_a_field' },
      labelFor,
    );
    expect(detail).toEqual({ key: 'customers.activity.revealed' });
    expect(JSON.stringify(detail)).not.toContain('not_a_field');
  });

  it('never carries a value that happens to sit in the metadata', () => {
    const detail = activityDetail(
      'customer.updated',
      { acceptedKeys: ['customer.mobile'], value: '9900012345' },
      labelFor,
    );
    expect(JSON.stringify(detail)).not.toContain('9900012345');
  });

  it('has nothing to add for other actions', () => {
    expect(activityDetail('customer.roaming_access_granted', {}, labelFor)).toBeNull();
  });
});
