import { describe, expect, it } from 'vitest';
import { whatsappLink } from './view';

describe('whatsappLink', () => {
  it('builds a wa.me link with the country code and an encoded message', () => {
    const link = whatsappLink('9900012345', 'SSC GD का फॉर्म भर दें?');
    expect(link).toBe(
      `https://wa.me/919900012345?text=${encodeURIComponent('SSC GD का फॉर्म भर दें?')}`,
    );
  });

  it('accepts the formats an operator might have typed', () => {
    const expected = whatsappLink('9900012345', 'hi');
    expect(whatsappLink('+91 99000 12345', 'hi')).toBe(expected);
    expect(whatsappLink('919900012345', 'hi')).toBe(expected);
    expect(whatsappLink('99000-12345', 'hi')).toBe(expected);
  });

  /**
   * The refusal matters more than the happy path: a guessed-at number would open a chat with a
   * stranger and put a customer's name and scheme in it.
   */
  it('refuses anything that is not a valid Indian mobile', () => {
    expect(whatsappLink('12345', 'hi')).toBeNull();
    expect(whatsappLink('5900012345', 'hi')).toBeNull(); // Indian mobiles start 6–9.
    expect(whatsappLink('99000123456', 'hi')).toBeNull(); // Eleven digits.
    expect(whatsappLink('', 'hi')).toBeNull();
  });

  it('escapes a message that would otherwise break the query string', () => {
    const link = whatsappLink('9900012345', 'fee ₹100 & form?');
    expect(link).toContain('%26');
    expect(link).not.toContain(' &');
  });
});
