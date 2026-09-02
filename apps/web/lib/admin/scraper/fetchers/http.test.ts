import { describe, expect, it } from 'vitest';
import { htmlToText, isAllowedSourceUrl, robotsAllows } from './http';

/**
 * The gates that stand between a database row and an arbitrary outbound request.
 *
 * `isAllowedSourceUrl` is the one that matters most: without it, `source_url` is a
 * server-side request forgery primitive that anybody with write access to the sources table
 * could aim anywhere. Tested directly rather than through a run, so the boundary is pinned.
 */
describe('isAllowedSourceUrl', () => {
  it('accepts public government domains', () => {
    expect(isAllowedSourceUrl('https://ssc.gov.in/notice-board')).toBe(true);
    expect(isAllowedSourceUrl('https://www.nsp.gov.in/schemes')).toBe(true);
    expect(isAllowedSourceUrl('https://bihar.nic.in/notices')).toBe(true);
  });

  it('matches a bare allowlisted suffix as well as a subdomain', () => {
    expect(isAllowedSourceUrl('https://gov.in/')).toBe(true);
    expect(isAllowedSourceUrl('https://deep.sub.domain.gov.in/x')).toBe(true);
  });

  it('refuses a lookalike domain that merely ends in the same letters', () => {
    // `notgov.in` ends with "gov.in" as a string but is a different registrable domain, so the
    // check has to be on a label boundary rather than a bare suffix match.
    expect(isAllowedSourceUrl('https://notgov.in/')).toBe(false);
    expect(isAllowedSourceUrl('https://evilgov.in/notice')).toBe(false);
  });

  it('refuses anything not on the allowlist', () => {
    expect(isAllowedSourceUrl('https://example.com/notice')).toBe(false);
  });

  it('accepts a host named explicitly in SCRAPER_ALLOWED_HOSTS', () => {
    expect(isAllowedSourceUrl('https://portal.example.com/x', ['portal.example.com'])).toBe(true);
    expect(isAllowedSourceUrl('https://other.example.com/x', ['portal.example.com'])).toBe(false);
  });

  it('refuses plaintext http', () => {
    expect(isAllowedSourceUrl('http://ssc.gov.in/notice')).toBe(false);
  });

  it('refuses a URL carrying credentials', () => {
    expect(isAllowedSourceUrl('https://user:pass@ssc.gov.in/notice')).toBe(false);
  });

  it('refuses loopback and internal hosts', () => {
    for (const url of [
      'https://localhost/x',
      'https://api.localhost/x',
      'https://metadata.internal/x',
      'https://printer.local/x',
    ]) {
      expect(isAllowedSourceUrl(url, ['localhost', 'metadata.internal'])).toBe(false);
    }
  });

  it('refuses a bare IP address, allowlisted or not', () => {
    // No government portal is on a raw address; a row that names one is a pivot attempt.
    expect(isAllowedSourceUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedSourceUrl('https://127.0.0.1/x', ['127.0.0.1'])).toBe(false);
    expect(isAllowedSourceUrl('https://10.0.0.5/x')).toBe(false);
  });

  it('refuses a malformed URL', () => {
    expect(isAllowedSourceUrl('not a url')).toBe(false);
    expect(isAllowedSourceUrl('')).toBe(false);
  });

  it('refuses non-http schemes', () => {
    expect(isAllowedSourceUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedSourceUrl('ftp://ssc.gov.in/x')).toBe(false);
  });
});

describe('robotsAllows', () => {
  it('allows everything when robots.txt is empty', () => {
    expect(robotsAllows('', '/notice-board')).toBe(true);
  });

  it('honours a wildcard disallow', () => {
    const robots = 'User-agent: *\nDisallow: /private';
    expect(robotsAllows(robots, '/private/list')).toBe(false);
    expect(robotsAllows(robots, '/notice-board')).toBe(true);
  });

  it('treats an empty Disallow as "nothing is disallowed"', () => {
    expect(robotsAllows('User-agent: *\nDisallow:', '/anything')).toBe(true);
  });

  it('lets the longest matching rule win', () => {
    const robots = 'User-agent: *\nDisallow: /\nAllow: /notifications/';
    expect(robotsAllows(robots, '/notifications/ssc')).toBe(true);
    expect(robotsAllows(robots, '/admin')).toBe(false);
  });

  it('ignores rules addressed to another crawler', () => {
    const robots = 'User-agent: GoogleBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private';
    expect(robotsAllows(robots, '/notice-board')).toBe(true);
    expect(robotsAllows(robots, '/private')).toBe(false);
  });

  it('honours a rule naming our own agent', () => {
    const robots = 'User-agent: AssistigoSchemeBot\nDisallow: /notice-board';
    expect(robotsAllows(robots, '/notice-board')).toBe(false);
  });

  it('applies a group shared by consecutive user-agent lines', () => {
    const robots = 'User-agent: SomeBot\nUser-agent: *\nDisallow: /private';
    expect(robotsAllows(robots, '/private')).toBe(false);
  });

  it('ignores comments and blank lines', () => {
    const robots = '# our rules\n\nUser-agent: *   # everyone\nDisallow: /private # secret\n';
    expect(robotsAllows(robots, '/private')).toBe(false);
    expect(robotsAllows(robots, '/public')).toBe(true);
  });
});

describe('htmlToText', () => {
  it('strips tags and collapses whitespace', () => {
    expect(htmlToText('<p>Last date:   <b>31/03/2026</b></p>')).toBe('Last date: 31/03/2026');
  });

  it('drops script and style bodies', () => {
    // Otherwise a tracking script's numbers become candidate dates.
    const html = '<script>var d="01/01/2020";</script><style>.a{top:0}</style><p>Closes 31/03/2026</p>';
    const text = htmlToText(html);
    expect(text).toContain('31/03/2026');
    expect(text).not.toContain('01/01/2020');
  });

  it('drops comments', () => {
    expect(htmlToText('<!-- 01/01/2020 --><p>Closes 31/03/2026</p>')).not.toContain('01/01/2020');
  });

  it('turns block ends into line breaks so labels stay near their dates', () => {
    const text = htmlToText('<tr><td>Last date</td><td>31/03/2026</td></tr>');
    expect(text).toContain('Last date');
    expect(text).toContain('31/03/2026');
  });

  it('decodes the entities that appear in government pages', () => {
    expect(htmlToText('<p>A&nbsp;&amp;&nbsp;B &lt;x&gt; &#8377;100</p>')).toBe('A & B <x> ₹100');
  });
});
