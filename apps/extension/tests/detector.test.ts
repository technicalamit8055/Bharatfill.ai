import { beforeEach, describe, expect, it } from 'vitest';
import { detectionPayloadSchema } from '@assistigo/form-engine';
import {
  collectPageContext,
  detectFields,
  fieldSignature,
  isBlockedPage,
  isElementVisible,
  resolveLabel,
} from '../src/content/detector';

function render(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '';
});

describe('detector — field discovery', () => {
  it('finds text, select, radio, checkbox and textarea fields', () => {
    const doc = render(`
      <form>
        <label for="name">Applicant's Name</label>
        <input id="name" name="applicant_name" type="text" />

        <label for="state">State</label>
        <select id="state" name="state"><option value="">Select</option><option value="BR">Bihar</option></select>

        <label for="male">Male</label>
        <input id="male" name="gender" type="radio" value="M" />

        <label for="terms">I agree</label>
        <input id="terms" name="terms" type="checkbox" />

        <label for="addr">Address</label>
        <textarea id="addr" name="address"></textarea>
      </form>
    `);

    const fields = detectFields(doc);
    expect(fields.map((field) => field.inputType)).toEqual([
      'text',
      'select-one',
      'radio',
      'checkbox',
      'textarea',
    ]);
  });

  it('ignores hidden, submit and button inputs', () => {
    const doc = render(`
      <form>
        <input type="hidden" name="csrf" value="secret" />
        <input type="text" name="full_name" />
        <input type="submit" value="Submit" />
        <button type="button">Add row</button>
      </form>
    `);

    const fields = detectFields(doc);
    expect(fields).toHaveLength(1);
    expect(fields[0]?.name).toBe('full_name');
  });

  it('records that a field is filled without recording what is in it', () => {
    const doc = render(`<form><input name="full_name" value="Amit Kumar" /></form>`);
    const [field] = detectFields(doc);

    expect(field?.hasValue).toBe(true);
    // The value must not appear anywhere in the payload.
    expect(JSON.stringify(field)).not.toContain('Amit');
  });

  it('captures select options, which are form structure rather than customer data', () => {
    const doc = render(`
      <form>
        <select name="state"><option value="">Select</option><option value="BR">Bihar</option></select>
      </form>
    `);
    const [field] = detectFields(doc);
    expect(field?.options).toEqual([
      { value: '', label: 'Select' },
      { value: 'BR', label: 'Bihar' },
    ]);
  });

  it('reads required, maxlength and readonly', () => {
    const doc = render(
      `<form><input name="pin" required maxlength="6" readonly disabled /></form>`,
    );
    const [field] = detectFields(doc);
    expect(field).toMatchObject({ required: true, maxLength: 6, readOnly: true, disabled: true });
  });

  it('detects custom ARIA controls, contenteditable elements, and datalists', () => {
    const doc = render(`
      <form>
        <div contenteditable="true" id="bio" aria-label="Bio">Developer</div>
        <div role="checkbox" aria-checked="true" aria-label="Subscribe"></div>
        <div role="combobox" aria-label="Country">
          <ul role="listbox">
            <li role="option" data-value="IN">India</li>
          </ul>
        </div>
        <input list="cities" name="city" type="text" />
        <datalist id="cities">
          <option value="DEL">Delhi</option>
          <option value="PAT">Patna</option>
        </datalist>
        <input type="date" name="dob" />
        <input type="range" name="score" />
      </form>
    `);

    const fields = detectFields(doc);
    expect(fields.map((f) => f.inputType)).toEqual([
      'contenteditable',
      'checkbox',
      'combobox',
      'text',
      'date',
      'range',
    ]);

    const combobox = fields.find((f) => f.inputType === 'combobox');
    expect(combobox?.options).toEqual([{ value: 'IN', label: 'India' }]);

    const cityInput = fields.find((f) => f.name === 'city');
    expect(cityInput?.options).toEqual([
      { value: 'DEL', label: 'Delhi' },
      { value: 'PAT', label: 'Patna' },
    ]);
  });

  it('does not mistake a browser default for something the operator already entered', () => {
    // A slider reports its midpoint and a colour swatch reports #000000 whether or not anyone
    // touched them. Counting those as filled would make both permanently unfillable.
    const doc = render(`
      <form>
        <input type="range" name="untouched_range" />
        <input type="range" name="preset_range" value="30" />
        <input type="color" name="untouched_colour" />
        <input type="color" name="preset_colour" value="#ff0000" />
        <div role="slider" id="custom_slider" aria-label="Level" aria-valuenow="40"></div>
      </form>
    `);

    const byName = new Map(detectFields(doc).map((f) => [f.name ?? f.id, f.hasValue]));
    expect(Object.fromEntries(byName)).toEqual({
      untouched_range: false,
      preset_range: true,
      untouched_colour: false,
      preset_colour: true,
      custom_slider: false,
    });
  });

  it('treats an untouched multi-select as empty', () => {
    const doc = render(`
      <form>
        <select name="empty" multiple><option value="a">A</option><option value="b">B</option></select>
        <select name="chosen" multiple><option value="a" selected>A</option><option value="b">B</option></select>
      </form>
    `);

    const fields = detectFields(doc);
    expect(fields.map((f) => f.inputType)).toEqual(['select-multiple', 'select-multiple']);
    expect(fields.map((f) => f.hasValue)).toEqual([false, true]);
  });

  it('collects the options of a dropdown that keeps them in a popup it points at', () => {
    const doc = render(`
      <form>
        <div role="combobox" id="scheme" aria-label="Scheme" aria-controls="scheme-list"></div>
        <div id="scheme-list">
          <span data-option="A">Scheme A</span>
          <span data-option="B">Scheme B</span>
        </div>
      </form>
    `);

    const combobox = detectFields(doc).find((f) => f.id === 'scheme');
    expect(combobox?.options).toEqual([
      { value: 'A', label: 'Scheme A' },
      { value: 'B', label: 'Scheme B' },
    ]);
  });

  it('lists an option once when the popup it points at is also a descendant', () => {
    const doc = render(`
      <form>
        <div role="combobox" id="state" aria-label="State" aria-controls="state-list">
          <ul id="state-list" role="listbox"><li role="option" data-value="BR">Bihar</li></ul>
        </div>
      </form>
    `);

    const combobox = detectFields(doc).find((f) => f.id === 'state');
    expect(combobox?.options).toEqual([{ value: 'BR', label: 'Bihar' }]);
  });
});

describe('detector — wire contract', () => {
  it('keeps every string within the mapping API limits, however long the page makes it', () => {
    // SSC's registration form wraps a paragraph-length declaration in a <label>; one string over
    // its cap used to make POST /api/forms/map reject the whole page.
    const long = (word: string) => Array.from({ length: 80 }, () => word).join(' ');
    const doc = render(`
      <form>
        <label>
          <input type="checkbox" name="declaration" />
          ${long('I hereby declare that the information given above is true.')}
        </label>
        <label for="email">${long('Email')}</label>
        <input id="email" name="${'n'.repeat(400)}" type="email"
          placeholder="${long('Enter')}" aria-label="${long('Email address')}"
          pattern="${'[a-z]'.repeat(100)}" />
        <input id="${'i'.repeat(400)}" type="file" accept="${long('.pdf,')}" />
        <h2>${long('Section')}</h2>
        <select name="board"><option value="${'v'.repeat(400)}">${long('Board')}</option></select>
      </form>
    `);

    const payload = { page: collectPageContext(doc), fields: detectFields(doc) };
    const parsed = detectionPayloadSchema.safeParse(payload);
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'))).toEqual(
      [],
    );
    expect(payload.fields.find((f) => f.name === 'declaration')?.labelText).toMatch(
      /^I hereby declare/,
    );
  });
});

describe('detector — label resolution', () => {
  it('prefers an explicit label[for]', () => {
    const doc = render(`<label for="a">Father's Name</label><input id="a" name="x" />`);
    expect(resolveLabel(doc.querySelector('input')!)).toBe("Father's Name");
  });

  it('falls back to a wrapping label', () => {
    const doc = render(`<label>Mobile Number <input name="m" /></label>`);
    expect(resolveLabel(doc.querySelector('input')!)).toBe('Mobile Number');
  });

  it('uses aria-labelledby', () => {
    const doc = render(
      `<span id="lbl">Date of Birth</span><input name="d" aria-labelledby="lbl" />`,
    );
    expect(resolveLabel(doc.querySelector('input')!)).toBe('Date of Birth');
  });

  it('reads the previous table cell, as older government portals lay forms out', () => {
    const doc = render(`
      <table><tr><td>PIN Code</td><td><input name="pin" /></td></tr></table>
    `);
    expect(resolveLabel(doc.querySelector('input')!)).toBe('PIN Code');
  });

  it('falls back to the nearest preceding text', () => {
    const doc = render(`<div><span>Annual Income</span><input name="inc" /></div>`);
    expect(resolveLabel(doc.querySelector('input')!)).toBe('Annual Income');
  });

  it('handles Hindi labels', () => {
    const doc = render(`<label for="a">पिता का नाम</label><input id="a" name="f" />`);
    expect(resolveLabel(doc.querySelector('input')!)).toBe('पिता का नाम');
  });

  it('discards a punctuation-only table cell instead of reporting it as the label', () => {
    // A ServicePlus template row whose label cell is empty renders as "." or ".." once
    // whitespace is trimmed — not something an operator can use to tell one upload box from
    // another, and the root cause of a phantom document-attachment card per field.
    const doc = render(`
      <table><tr><td>.</td><td><input name="rep_upload" type="file" /></td></tr></table>
    `);
    expect(resolveLabel(doc.querySelector('input')!)).toBeNull();
  });

  it('falls through past a punctuation-only sibling to find a real label', () => {
    const doc = render(`<div><span>Photograph</span><span>..</span><input name="p" /></div>`);
    expect(resolveLabel(doc.querySelector('input')!)).toBe('Photograph');
  });
});

describe('detector — table row context', () => {
  it('reads the label run of an upload row, not just the cell before the field', () => {
    // The cell right before the box says "Mandatory"; on its own that was the whole label.
    const doc = render(`
      <table><tr>
        <td>3.</td><td>Caste Certificate</td><td>Mandatory</td>
        <td><input type="file" name="doc3" /></td>
      </tr></table>
    `);
    expect(resolveLabel(doc.querySelector('input')!)).toBe('Caste Certificate Mandatory');
  });

  it('stops at the cell of the previous field, so two fields in a row keep their own labels', () => {
    const doc = render(`
      <table><tr>
        <td>Name</td><td><input name="n" /></td>
        <td>Father's Name</td><td><input name="f" /></td>
      </tr></table>
    `);
    const [first, second] = Array.from(doc.querySelectorAll('input'));
    expect(resolveLabel(first!)).toBe('Name');
    expect(resolveLabel(second!)).toBe("Father's Name");
  });

  it('does not let a hidden input in a label cell end the run', () => {
    const doc = render(`
      <table><tr>
        <td>Income Certificate<input type="hidden" name="doc_id" value="7" /></td>
        <td><input type="file" name="u" /></td>
      </tr></table>
    `);
    expect(resolveLabel(doc.querySelector('input[type="file"]')!)).toBe('Income Certificate');
  });

  it('puts the row label in front of the cell text in nearbyText', () => {
    const doc = render(`
      <table><tr>
        <td>1</td><td>Domicile Certificate</td>
        <td><label for="u">Choose file</label><input type="file" id="u" name="u" /></td>
      </tr></table>
    `);
    const [field] = detectFields(doc);
    expect(field?.labelText).toBe('Choose file');
    expect(field?.nearbyText).toBe('Domicile Certificate Choose file');
  });

  it('never reads the cells after the field, where a portal shows the uploaded filename', () => {
    const doc = render(`
      <table><tr>
        <td>Aadhaar Card</td>
        <td><input type="file" name="u" /></td>
        <td>aadhaar_front_scan.jpg uploaded</td>
      </tr></table>
    `);
    const [field] = detectFields(doc);
    expect(field?.labelText).toBe('Aadhaar Card');
    expect(field?.nearbyText).toBe('Aadhaar Card');
    expect(JSON.stringify(field)).not.toContain('aadhaar_front_scan');
  });
});

describe('detector — hidden file inputs behind a visible trigger', () => {
  it('keeps a display:none file input that a visible label opens', () => {
    const doc = render(`
      <input type="file" id="photo" name="photo" style="display:none" />
      <label for="photo" class="btn">Upload Photograph</label>
    `);
    const [field] = detectFields(doc);
    expect(field?.inputType).toBe('file');
    expect(field?.visible).toBe(true);
    expect(field?.labelText).toBe('Upload Photograph');
  });

  it('keeps a `hidden` file input with a Browse button beside it', () => {
    const doc = render(`
      <table><tr>
        <td>Income Certificate</td>
        <td><div><input type="file" name="inc" hidden /><button type="button">Browse</button></div></td>
      </tr></table>
    `);
    const [field] = detectFields(doc);
    expect(field?.visible).toBe(true);
    expect(field?.nearbyText).toContain('Income Certificate');
  });

  it('recognises a Hindi upload button', () => {
    const doc = render(`
      <div><input type="file" name="s" style="display:none" /><a href="#">अपलोड करें</a></div>
    `);
    expect(detectFields(doc)[0]?.visible).toBe(true);
  });

  it('still drops a hidden file input whose trigger is hidden too', () => {
    // RTPS Bihar's collapsed representative-authorization row: the label is inside the same
    // collapsed container, so it cannot vouch for the input.
    const doc = render(`
      <div style="display:none">
        <input type="file" id="rep" name="rep" />
        <label for="rep">Upload authorization</label>
        <button type="button">Browse</button>
      </div>
    `);
    expect(detectFields(doc)[0]?.visible).toBe(false);
  });

  it('still drops a hidden file input with no trigger at all', () => {
    const doc = render(`<div><input type="file" name="internal" style="display:none" /></div>`);
    expect(detectFields(doc)[0]?.visible).toBe(false);
  });

  it("does not let one box's Browse button vouch for a hidden neighbour", () => {
    const doc = render(`
      <div>
        <input type="file" name="a" style="display:none" />
        <input type="file" name="b" />
        <button type="button">Browse</button>
      </div>
    `);
    const fields = detectFields(doc);
    expect(fields.find((f) => f.name === 'a')?.visible).toBe(false);
    expect(fields.find((f) => f.name === 'b')?.visible).toBe(true);
  });

  it('ignores a button that does not open a picker', () => {
    const doc = render(`
      <div><input type="file" name="x" style="display:none" /><button type="button">Remove</button></div>
    `);
    expect(detectFields(doc)[0]?.visible).toBe(false);
  });

  it('leaves the visibility of other hidden fields alone', () => {
    const doc = render(`
      <label for="t">Upload</label><input id="t" name="t" style="display:none" />
    `);
    expect(detectFields(doc)[0]?.visible).toBe(false);
  });
});

describe('detector — visibility', () => {
  it('marks display:none and visibility:hidden fields invisible', () => {
    const doc = render(`
      <input id="a" name="a" style="display:none" />
      <input id="b" name="b" style="visibility:hidden" />
      <input id="c" name="c" />
    `);
    expect(isElementVisible(doc.getElementById('a')!)).toBe(false);
    expect(isElementVisible(doc.getElementById('b')!)).toBe(false);
    expect(isElementVisible(doc.getElementById('c')!)).toBe(true);
  });

  it('follows display:none up the ancestor chain', () => {
    const doc = render(`<div style="display:none"><input id="a" name="a" /></div>`);
    expect(isElementVisible(doc.getElementById('a')!)).toBe(false);
  });

  it('respects aria-hidden', () => {
    const doc = render(`<input id="a" name="a" aria-hidden="true" />`);
    expect(isElementVisible(doc.getElementById('a')!)).toBe(false);
  });

  it('trusts style walking alone under jsdom, since jsdom never lays anything out', () => {
    const doc = render(`<input id="a" name="a" />`);
    const element = doc.getElementById('a')!;
    // jsdom's own getClientRects() is always empty regardless of visibility — confirming this
    // suite actually runs under the environment the layout check has to skip.
    expect(element.getClientRects().length).toBe(0);
    expect(isElementVisible(element)).toBe(true);
  });

  it('falls back to a layout check outside jsdom, catching what style walking misses', () => {
    // A portal that collapses a row via layout rather than declaring display/visibility
    // directly — e.g. an ancestor several levels above this walk's depth limit — is exactly
    // what surfaced RTPS Bihar's hidden representative-authorization and internal-uploader
    // widgets as phantom document-attachment cards.
    const doc = render(`<input id="a" name="a" />`);
    const element = doc.getElementById('a')!;

    const originalUserAgent = window.navigator.userAgent;
    const originalGetClientRects = element.getClientRects;
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      configurable: true,
    });
    element.getClientRects = () => [] as unknown as DOMRectList;

    try {
      expect(isElementVisible(element)).toBe(false);
    } finally {
      element.getClientRects = originalGetClientRects;
      Object.defineProperty(window.navigator, 'userAgent', {
        value: originalUserAgent,
        configurable: true,
      });
    }
  });
});

describe('detector — signatures', () => {
  it('is stable across re-detections of the same form', () => {
    const html = `<form><input name="full_name" /><input name="mobile" /></form>`;
    const first = detectFields(render(html)).map((field) => field.signature);
    const second = detectFields(render(html)).map((field) => field.signature);
    expect(first).toEqual(second);
  });

  it('distinguishes two fields that differ only by name', () => {
    const doc = render(`<form><input name="a" /><input name="b" /></form>`);
    const [one, two] = detectFields(doc);
    expect(one?.signature).not.toBe(two?.signature);
  });

  it('survives a field moving position when it has a name', () => {
    const before = render(`<form><input name="full_name" /></form>`);
    const beforeSignature = detectFields(before)[0]?.signature;

    const after = render(`<form><input name="extra" /><input name="full_name" /></form>`);
    const afterSignature = detectFields(after).find((f) => f.name === 'full_name')?.signature;

    expect(afterSignature).toBe(beforeSignature);
  });

  it('falls back to position for a field with no name or id', () => {
    const element = document.createElement('input');
    expect(fieldSignature(element, 0, 3)).toBe(fieldSignature(element, 0, 3));
    expect(fieldSignature(element, 0, 3)).not.toBe(fieldSignature(element, 0, 4));
  });
});

describe('detector — page context', () => {
  it('captures origin, path and title but never the query string', () => {
    document.title = 'Scholarship application';
    const context = collectPageContext(document);

    expect(context.title).toBe('Scholarship application');
    expect(context.origin).toBe(window.location.origin);
    expect(context.path).toBe(window.location.pathname);
    expect(JSON.stringify(context)).not.toContain('?');
  });
});

describe('detector — blocked pages', () => {
  it.each([
    { protocol: 'chrome:', hostname: 'extensions' },
    { protocol: 'chrome-extension:', hostname: 'abcdef' },
    { protocol: 'about:', hostname: '' },
    { protocol: 'file:', hostname: '' },
    { protocol: 'https:', hostname: 'chromewebstore.google.com' },
  ])('refuses to run on %o', (location) => {
    expect(isBlockedPage(location)).toBe(true);
  });

  it('runs on an ordinary portal page', () => {
    expect(isBlockedPage({ protocol: 'https:', hostname: 'demo.assistigo.test' })).toBe(false);
  });
});

describe('detector — upload constraints stated on the page', () => {
  const KB = 1024;

  function fileField(doc: Document) {
    const field = detectFields(doc).find((candidate) => candidate.inputType === 'file');
    if (!field) throw new Error('no file field detected');
    return field;
  }

  it('reads a hint span beside the box', () => {
    const doc = render(`
      <form>
        <div class="upload">
          <label for="photo">Photograph</label>
          <input id="photo" name="photo" type="file" />
          <span class="hint">Between 20 KB and 50 KB. Format: JPEG</span>
        </div>
      </form>
    `);
    expect(fileField(doc).uploadConstraints).toEqual({
      minBytes: 20 * KB,
      maxBytes: 50 * KB,
      formats: ['jpeg'],
    });
  });

  it('reads an aria-describedby hint that lives outside the wrapper', () => {
    const doc = render(`
      <form>
        <div><label for="cert">Caste certificate</label><input id="cert" type="file" aria-describedby="cert-help" /></div>
        <p id="cert-help">PDF only, max 200 KB</p>
      </form>
    `);
    expect(fileField(doc).uploadConstraints).toEqual({
      minBytes: null,
      maxBytes: 200 * KB,
      formats: ['pdf'],
    });
  });

  it('reads table cells under their column headers, including cells after the box', () => {
    const doc = render(`
      <form><table>
        <thead><tr><th>S.No</th><th>Document</th><th>Upload</th><th>Max Size (KB)</th><th>File Type</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>Income certificate</td><td><input type="file" name="income" /></td><td>200</td><td>PDF</td></tr>
        </tbody>
      </table></form>
    `);
    expect(fileField(doc).uploadConstraints).toEqual({
      minBytes: null,
      maxBytes: 200 * KB,
      formats: ['pdf'],
    });
  });

  it('keeps each row to its own box', () => {
    const doc = render(`
      <form><table>
        <tr><td>Photo</td><td><input type="file" name="photo" /></td><td>20 KB to 50 KB, JPG only</td></tr>
        <tr><td>Signature</td><td><input type="file" name="sign" /></td><td>10 KB to 20 KB, JPG only</td></tr>
      </table></form>
    `);
    const [photo, sign] = detectFields(doc);
    expect(photo?.uploadConstraints?.maxBytes).toBe(50 * KB);
    expect(sign?.uploadConstraints?.maxBytes).toBe(20 * KB);
  });

  it('does not borrow a neighbouring box’s hint from a shared wrapper', () => {
    const doc = render(`
      <form>
        <div>
          <div><label for="a">Photo</label><input id="a" type="file" /></div>
          <div><label for="b">Signature</label><input id="b" type="file" /><span>max 20 KB</span></div>
        </div>
      </form>
    `);
    const [photo, sign] = detectFields(doc);
    expect(photo?.uploadConstraints ?? null).toBeNull();
    expect(sign?.uploadConstraints?.maxBytes).toBe(20 * KB);
  });

  it('never turns the uploaded filename beside the box into a rule, and never sends the text', () => {
    const doc = render(`
      <form><table>
        <tr><td>Photo</td><td><input type="file" name="photo" /></td><td>photo_180kb.jpg uploaded · 180 KB</td></tr>
      </table></form>
    `);
    const field = fileField(doc);
    expect(field.uploadConstraints).toBeNull();
    expect(JSON.stringify(field)).not.toContain('photo_180kb');
  });

  it('is null for every field that is not a file input', () => {
    const doc = render(`
      <form><label for="n">Name (max 50 KB)</label><input id="n" type="text" /></form>
    `);
    expect(detectFields(doc)[0]?.uploadConstraints).toBeNull();
  });

  it('produces a payload the mapping API accepts', () => {
    const doc = render(`
      <form><label for="p">Photo (JPG, max 50 KB)</label><input id="p" type="file" /></form>
    `);
    const result = detectionPayloadSchema.safeParse({
      page: collectPageContext(doc),
      fields: detectFields(doc),
    });
    expect(result.success).toBe(true);
  });
});
