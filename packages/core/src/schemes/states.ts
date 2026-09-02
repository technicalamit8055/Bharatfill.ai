/**
 * Indian state / union-territory normalisation.
 *
 * Domicile decides eligibility for a large share of state schemes, and the value reaching us is
 * whatever was printed on a certificate or typed by an operator in a hurry: "U.P.", "uttar
 * pradesh", "उत्तर प्रदेश", "Orissa". Comparing those as raw strings silently drops customers
 * out of schemes they qualify for, so every comparison goes through `normalizeIndianState`.
 */

export const INDIAN_STATE_CODES = [
  'AP',
  'AR',
  'AS',
  'BR',
  'CG',
  'GA',
  'GJ',
  'HR',
  'HP',
  'JH',
  'KA',
  'KL',
  'MP',
  'MH',
  'MN',
  'ML',
  'MZ',
  'NL',
  'OD',
  'PB',
  'RJ',
  'SK',
  'TN',
  'TS',
  'TR',
  'UP',
  'UK',
  'WB',
  'AN',
  'CH',
  'DH',
  'DL',
  'JK',
  'LA',
  'LD',
  'PY',
] as const;

export type IndianStateCode = (typeof INDIAN_STATE_CODES)[number];

export type IndianStateDef = {
  code: IndianStateCode;
  name: { en: string; hi: string };
  /** Union territory rather than a full state — a few schemes are worded for one or the other. */
  unionTerritory: boolean;
  /** Lower-cased spellings seen on real documents, including former names and abbreviations. */
  aliases: readonly string[];
};

export const INDIAN_STATES: readonly IndianStateDef[] = [
  {
    code: 'AP',
    name: { en: 'Andhra Pradesh', hi: 'आंध्र प्रदेश' },
    unionTerritory: false,
    aliases: ['andhra', 'andhrapradesh', 'आन्ध्र प्रदेश'],
  },
  {
    code: 'AR',
    name: { en: 'Arunachal Pradesh', hi: 'अरुणाचल प्रदेश' },
    unionTerritory: false,
    aliases: ['arunachal'],
  },
  {
    code: 'AS',
    name: { en: 'Assam', hi: 'असम' },
    unionTerritory: false,
    aliases: ['asom'],
  },
  {
    code: 'BR',
    name: { en: 'Bihar', hi: 'बिहार' },
    unionTerritory: false,
    aliases: ['bih'],
  },
  {
    code: 'CG',
    name: { en: 'Chhattisgarh', hi: 'छत्तीसगढ़' },
    unionTerritory: false,
    aliases: ['ct', 'chattisgarh', 'chhatisgarh'],
  },
  {
    code: 'GA',
    name: { en: 'Goa', hi: 'गोवा' },
    unionTerritory: false,
    aliases: [],
  },
  {
    code: 'GJ',
    name: { en: 'Gujarat', hi: 'गुजरात' },
    unionTerritory: false,
    aliases: ['gujrat'],
  },
  {
    code: 'HR',
    name: { en: 'Haryana', hi: 'हरियाणा' },
    unionTerritory: false,
    aliases: [],
  },
  {
    code: 'HP',
    name: { en: 'Himachal Pradesh', hi: 'हिमाचल प्रदेश' },
    unionTerritory: false,
    aliases: ['himachal'],
  },
  {
    code: 'JH',
    name: { en: 'Jharkhand', hi: 'झारखंड' },
    unionTerritory: false,
    aliases: ['झारखण्ड'],
  },
  {
    code: 'KA',
    name: { en: 'Karnataka', hi: 'कर्नाटक' },
    unionTerritory: false,
    aliases: ['karnatak', 'mysore'],
  },
  {
    code: 'KL',
    name: { en: 'Kerala', hi: 'केरल' },
    unionTerritory: false,
    aliases: ['keralam'],
  },
  {
    code: 'MP',
    name: { en: 'Madhya Pradesh', hi: 'मध्य प्रदेश' },
    unionTerritory: false,
    aliases: ['madhyapradesh'],
  },
  {
    code: 'MH',
    name: { en: 'Maharashtra', hi: 'महाराष्ट्र' },
    unionTerritory: false,
    aliases: ['maharastra'],
  },
  {
    code: 'MN',
    name: { en: 'Manipur', hi: 'मणिपुर' },
    unionTerritory: false,
    aliases: [],
  },
  {
    code: 'ML',
    name: { en: 'Meghalaya', hi: 'मेघालय' },
    unionTerritory: false,
    aliases: [],
  },
  {
    code: 'MZ',
    name: { en: 'Mizoram', hi: 'मिज़ोरम' },
    unionTerritory: false,
    aliases: ['मिजोरम'],
  },
  {
    code: 'NL',
    name: { en: 'Nagaland', hi: 'नागालैंड' },
    unionTerritory: false,
    aliases: [],
  },
  {
    code: 'OD',
    name: { en: 'Odisha', hi: 'ओडिशा' },
    unionTerritory: false,
    aliases: ['or', 'orissa', 'उड़ीसा'],
  },
  {
    code: 'PB',
    name: { en: 'Punjab', hi: 'पंजाब' },
    unionTerritory: false,
    aliases: ['panjab'],
  },
  {
    code: 'RJ',
    name: { en: 'Rajasthan', hi: 'राजस्थान' },
    unionTerritory: false,
    aliases: ['rajastan'],
  },
  {
    code: 'SK',
    name: { en: 'Sikkim', hi: 'सिक्किम' },
    unionTerritory: false,
    aliases: [],
  },
  {
    code: 'TN',
    name: { en: 'Tamil Nadu', hi: 'तमिलनाडु' },
    unionTerritory: false,
    aliases: ['tamilnadu', 'madras', 'तमिल नाडु'],
  },
  {
    code: 'TS',
    name: { en: 'Telangana', hi: 'तेलंगाना' },
    unionTerritory: false,
    aliases: ['tg', 'telengana'],
  },
  {
    code: 'TR',
    name: { en: 'Tripura', hi: 'त्रिपुरा' },
    unionTerritory: false,
    aliases: [],
  },
  {
    code: 'UP',
    name: { en: 'Uttar Pradesh', hi: 'उत्तर प्रदेश' },
    unionTerritory: false,
    aliases: ['uttarpradesh', 'उत्तरप्रदेश'],
  },
  {
    code: 'UK',
    name: { en: 'Uttarakhand', hi: 'उत्तराखंड' },
    unionTerritory: false,
    aliases: ['ua', 'ut', 'uttaranchal', 'उत्तराखण्ड'],
  },
  {
    code: 'WB',
    name: { en: 'West Bengal', hi: 'पश्चिम बंगाल' },
    unionTerritory: false,
    aliases: ['westbengal', 'bengal'],
  },
  {
    code: 'AN',
    name: { en: 'Andaman and Nicobar Islands', hi: 'अंडमान और निकोबार द्वीपसमूह' },
    unionTerritory: true,
    aliases: ['andaman', 'andaman nicobar'],
  },
  {
    code: 'CH',
    name: { en: 'Chandigarh', hi: 'चंडीगढ़' },
    unionTerritory: true,
    aliases: [],
  },
  {
    code: 'DH',
    name: {
      en: 'Dadra and Nagar Haveli and Daman and Diu',
      hi: 'दादरा और नगर हवेली और दमन और दीव',
    },
    unionTerritory: true,
    aliases: ['dn', 'dd', 'daman', 'diu', 'dadra', 'dadra nagar haveli'],
  },
  {
    code: 'DL',
    name: { en: 'Delhi', hi: 'दिल्ली' },
    unionTerritory: true,
    aliases: ['new delhi', 'nct of delhi', 'delhi nct', 'नई दिल्ली'],
  },
  {
    code: 'JK',
    name: { en: 'Jammu and Kashmir', hi: 'जम्मू और कश्मीर' },
    unionTerritory: true,
    aliases: ['jammu kashmir', 'जम्मू कश्मीर'],
  },
  {
    code: 'LA',
    name: { en: 'Ladakh', hi: 'लद्दाख' },
    unionTerritory: true,
    aliases: [],
  },
  {
    code: 'LD',
    name: { en: 'Lakshadweep', hi: 'लक्षद्वीप' },
    unionTerritory: true,
    aliases: ['lakshdweep'],
  },
  {
    code: 'PY',
    name: { en: 'Puducherry', hi: 'पुदुचेरी' },
    unionTerritory: true,
    aliases: ['pondicherry', 'pondy', 'पांडिचेरी'],
  },
];

export const INDIAN_STATE_BY_CODE: ReadonlyMap<IndianStateCode, IndianStateDef> = new Map(
  INDIAN_STATES.map((state) => [state.code, state]),
);

/** Lower-cases and strips punctuation and spacing so "U.P." and "uttar pradesh" both key cleanly. */
function collapse(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Built once at module load rather than scanned per call: the reverse audience matcher runs this
 * over every customer in the centre for every scheme, so a linear scan would be
 * O(customers × schemes × states).
 */
const LOOKUP: ReadonlyMap<string, IndianStateCode> = (() => {
  const map = new Map<string, IndianStateCode>();
  for (const state of INDIAN_STATES) {
    map.set(collapse(state.code), state.code);
    map.set(collapse(state.name.en), state.code);
    map.set(collapse(state.name.hi), state.code);
    for (const alias of state.aliases) map.set(collapse(alias), state.code);
  }
  return map;
})();

export function normalizeIndianState(input: string | null | undefined): IndianStateCode | null {
  if (!input) return null;
  const key = collapse(input);
  if (key === '') return null;
  return LOOKUP.get(key) ?? null;
}

export function stateLabel(code: IndianStateCode): { en: string; hi: string } {
  return INDIAN_STATE_BY_CODE.get(code)?.name ?? { en: code, hi: code };
}

export function isIndianStateCode(value: unknown): value is IndianStateCode {
  return typeof value === 'string' && (INDIAN_STATE_CODES as readonly string[]).includes(value);
}

/**
 * Three-valued on purpose. `null` means "we do not know where this customer lives", which is an
 * unanswered question for the operator, not a rejection — see `evaluateSchemeEligibility`.
 * An empty or absent `allowed` list means the scheme is All-India.
 */
export function stateMatches(
  allowed: readonly IndianStateCode[] | null | undefined,
  customerState: IndianStateCode | null,
): boolean | null {
  if (!allowed || allowed.length === 0) return true;
  if (customerState === null) return null;
  return allowed.includes(customerState);
}
