/**
 * Portal requirement presets.
 * Master spec §13.2 — "Requirement presets: preset name, accepted file types, min/max file size,
 * dimensions, DPI, colour mode, notes."
 *
 * Why these live in code rather than in `document_requirement_presets`:
 *
 *   - They are facts about third-party portals, identical for every tenant, so a per-tenant row
 *     would be duplicated a thousand times over.
 *   - They ship with the build, so a fresh deployment with an unseeded database still knows the
 *     top portals — the same reasoning as `BUILT_IN_ADAPTERS` in the form engine.
 *   - The table stays for what it is actually for: an organization's *own* presets.
 *
 * A derivative therefore records `preset_id = null` and carries the resolved rule in
 * `metadata.preset`, which is what spec §13.3 asks a derivative to store.
 *
 * Every number here is a starting point, never a gate. The editor lets the operator change all
 * of them, because a portal notice is the authority and it changes between cycles.
 */

import type { PresetCategory, RequirementPreset } from './types';

const KB = 1024;

/**
 * SSC's One Time Registration spec is shared by CGL, CHSL, MTS, GD Constable and the rest, so
 * one preset pair covers the whole family rather than one per exam.
 */
const SSC: RequirementPreset[] = [
  {
    code: 'ssc.photo',
    portal: 'SSC',
    portalHi: 'एसएससी',
    label: 'Photograph (CGL / CHSL / MTS / GD)',
    labelHi: 'फोटो (सीजीएल / सीएचएसएल / एमटीएस / जीडी)',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 20 * KB,
    maxBytes: 50 * KB,
    widthMm: 35,
    heightMm: 45,
    dpi: 200,
    colorMode: 'colour',
    requiresNameDateStamp: true,
    notes:
      'Taken within the last three months, plain light background, no cap or dark glasses. SSC rejects a photo without the name and the date of capture printed on it.',
    notesHi:
      'पिछले तीन महीने में लिया गया, हल्का सादा बैकग्राउंड, टोपी या काला चश्मा नहीं। फोटो पर नाम और तारीख छपी होनी चाहिए।',
    source: 'SSC One Time Registration instructions',
    confidence: 'published',
  },
  {
    code: 'ssc.signature',
    portal: 'SSC',
    portalHi: 'एसएससी',
    label: 'Signature',
    labelHi: 'हस्ताक्षर',
    category: 'signature',
    outputMime: 'image/jpeg',
    minBytes: 10 * KB,
    maxBytes: 20 * KB,
    // SSC's upload box: "about 6.0 cm (width) X 2.0 cm (height) at a resolution of 300 DPI",
    // and it rejects any other size ("DIMENSION IS NOT CORRECT"). 709 × 236 px.
    widthMm: 60,
    heightMm: 20,
    dpi: 300,
    notes: 'Signed in black or blue ink on plain white paper. Not in capital letters.',
    notesHi: 'सादे सफेद कागज़ पर काली या नीली स्याही से। कैपिटल अक्षरों में नहीं।',
    source: 'SSC One Time Registration instructions',
    confidence: 'published',
  },
];

/** NTA runs JEE Main, NEET UG, CUET and UGC NET off one upload spec, with extras for NEET. */
const NTA: RequirementPreset[] = [
  {
    code: 'nta.photo',
    portal: 'NTA',
    portalHi: 'एनटीए',
    label: 'Passport photo (JEE / NEET / CUET / NET)',
    labelHi: 'पासपोर्ट फोटो (जेईई / नीट / सीयूईटी / नेट)',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 10 * KB,
    maxBytes: 200 * KB,
    widthMm: 35,
    heightMm: 45,
    dpi: 200,
    colorMode: 'colour',
    requiresNameDateStamp: true,
    notes:
      'Name of the candidate and the date the photo was taken must be printed across the bottom. 80% of the frame should be the face, ears visible, white or light background.',
    notesHi:
      'नीचे उम्मीदवार का नाम और फोटो की तारीख छपी होनी चाहिए। चेहरा फ्रेम का 80% हो, कान दिखें, सफेद बैकग्राउंड।',
    source: 'NTA public notice, information bulletin',
    confidence: 'published',
  },
  {
    code: 'nta.signature',
    portal: 'NTA',
    portalHi: 'एनटीए',
    label: 'Signature',
    labelHi: 'हस्ताक्षर',
    category: 'signature',
    outputMime: 'image/jpeg',
    minBytes: 4 * KB,
    maxBytes: 30 * KB,
    widthMm: 35,
    heightMm: 15,
    dpi: 200,
    notes: 'Running handwriting in black ink. NTA rejects a signature written in block capitals.',
    notesHi: 'काली स्याही में सामान्य हस्ताक्षर। कैपिटल अक्षरों वाले हस्ताक्षर अस्वीकार होते हैं।',
    source: 'NTA public notice, information bulletin',
    confidence: 'published',
  },
  {
    code: 'nta.postcard_photo',
    portal: 'NTA',
    portalHi: 'एनटीए',
    label: 'Postcard photo 4 × 6 in (NEET UG)',
    labelHi: 'पोस्टकार्ड फोटो 4 × 6 इंच (नीट यूजी)',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 10 * KB,
    maxBytes: 200 * KB,
    widthMm: 101.6,
    heightMm: 152.4,
    dpi: 150,
    colorMode: 'colour',
    requiresNameDateStamp: true,
    notes:
      'The same face photo blown up to postcard size, with the name and the date printed on it. NEET asks for this in addition to the passport photo.',
    notesHi:
      'वही फोटो पोस्टकार्ड साइज़ में, नाम और तारीख के साथ। नीट में पासपोर्ट फोटो के साथ यह भी मांगी जाती है।',
    source: 'NTA NEET UG information bulletin',
    confidence: 'published',
  },
  {
    code: 'nta.thumb_impression',
    portal: 'NTA',
    portalHi: 'एनटीए',
    label: 'Left thumb impression',
    labelHi: 'बाएँ अंगूठे का निशान',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 10 * KB,
    maxBytes: 200 * KB,
    widthMm: 30,
    heightMm: 30,
    dpi: 200,
    notes: 'Blue ink on plain white paper.',
    notesHi: 'सादे सफेद कागज़ पर नीली स्याही।',
    source: 'NTA NEET UG information bulletin',
    confidence: 'published',
  },
];

const UPSC: RequirementPreset[] = [
  {
    code: 'upsc.photo',
    portal: 'UPSC',
    portalHi: 'यूपीएससी',
    label: 'Photograph (OTR / CSE)',
    labelHi: 'फोटो (ओटीआर / सीएसई)',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 20 * KB,
    maxBytes: 300 * KB,
    minWidthPx: 350,
    minHeightPx: 350,
    maxWidthPx: 1000,
    maxHeightPx: 1000,
    dpi: 200,
    colorMode: 'colour',
    requiresNameDateStamp: true,
    notes:
      'UPSC requires the candidate name and the date of the photograph printed clearly on it, and refuses a photo older than ten days for some notifications. Square frame.',
    notesHi:
      'यूपीएससी फोटो पर नाम और तारीख साफ छपी होना अनिवार्य करता है। कुछ अधिसूचनाओं में दस दिन से पुरानी फोटो मान्य नहीं।',
    source: 'UPSC One Time Registration / CSE notification',
    confidence: 'published',
  },
  {
    code: 'upsc.signature',
    portal: 'UPSC',
    portalHi: 'यूपीएससी',
    label: 'Signature',
    labelHi: 'हस्ताक्षर',
    category: 'signature',
    outputMime: 'image/jpeg',
    minBytes: 20 * KB,
    maxBytes: 300 * KB,
    minWidthPx: 350,
    minHeightPx: 350,
    maxWidthPx: 1000,
    maxHeightPx: 1000,
    dpi: 200,
    notes: 'UPSC uses the same square upload box for the signature as for the photograph.',
    notesHi: 'यूपीएससी हस्ताक्षर के लिए भी फोटो जैसा ही चौकोर बॉक्स इस्तेमाल करता है।',
    source: 'UPSC One Time Registration / CSE notification',
    confidence: 'published',
  },
];

/** IBPS publishes exact pixels at 200 DPI, so these presets state pixels and not millimetres. */
const IBPS: RequirementPreset[] = [
  {
    code: 'ibps.photo',
    portal: 'IBPS',
    portalHi: 'आईबीपीएस',
    label: 'Photograph (PO / Clerk / SO / RRB)',
    labelHi: 'फोटो (पीओ / क्लर्क / एसओ / आरआरबी)',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 20 * KB,
    maxBytes: 50 * KB,
    widthPx: 200,
    heightPx: 230,
    dpi: 200,
    colorMode: 'colour',
    notes: 'Light background, 80% face, both ears visible. No cap, no tinted glasses.',
    notesHi: 'हल्का बैकग्राउंड, 80% चेहरा, दोनों कान दिखें। टोपी या रंगीन चश्मा नहीं।',
    source: 'IBPS common recruitment notice, guidelines for scanning',
    confidence: 'published',
  },
  {
    code: 'ibps.signature',
    portal: 'IBPS',
    portalHi: 'आईबीपीएस',
    label: 'Signature',
    labelHi: 'हस्ताक्षर',
    category: 'signature',
    outputMime: 'image/jpeg',
    minBytes: 10 * KB,
    maxBytes: 20 * KB,
    widthPx: 140,
    heightPx: 60,
    dpi: 200,
    notes:
      'Black ink on white paper. The signature is matched at the exam centre, so it must be the one the candidate can repeat.',
    notesHi: 'सफेद कागज़ पर काली स्याही। परीक्षा केंद्र पर इसी हस्ताक्षर से मिलान होता है।',
    source: 'IBPS common recruitment notice, guidelines for scanning',
    confidence: 'published',
  },
  {
    code: 'ibps.thumb_impression',
    portal: 'IBPS',
    portalHi: 'आईबीपीएस',
    label: 'Left thumb impression',
    labelHi: 'बाएँ अंगूठे का निशान',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 20 * KB,
    maxBytes: 50 * KB,
    widthPx: 240,
    heightPx: 240,
    dpi: 200,
    notes: 'Blue or black ink on white paper.',
    notesHi: 'सफेद कागज़ पर नीली या काली स्याही।',
    source: 'IBPS common recruitment notice, guidelines for scanning',
    confidence: 'published',
  },
  {
    code: 'ibps.handwritten_declaration',
    portal: 'IBPS',
    portalHi: 'आईबीपीएस',
    label: 'Handwritten declaration',
    labelHi: 'हस्तलिखित घोषणा',
    category: 'document',
    outputMime: 'image/jpeg',
    minBytes: 50 * KB,
    maxBytes: 100 * KB,
    widthPx: 800,
    heightPx: 400,
    dpi: 200,
    notes:
      'The declaration text in the candidate’s own running handwriting, in English only, on white paper in black ink. Capitals are rejected.',
    notesHi:
      'घोषणा उम्मीदवार की अपनी लिखावट में, केवल अंग्रेज़ी में, सफेद कागज़ पर काली स्याही से। कैपिटल अक्षर अस्वीकार।',
    source: 'IBPS common recruitment notice, guidelines for scanning',
    confidence: 'published',
  },
];

const RRB: RequirementPreset[] = [
  {
    code: 'rrb.photo',
    portal: 'Railway RRB',
    portalHi: 'रेलवे आरआरबी',
    label: 'Photograph (NTPC / Group D / ALP)',
    labelHi: 'फोटो (एनटीपीसी / ग्रुप डी / एएलपी)',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 15 * KB,
    maxBytes: 40 * KB,
    widthMm: 35,
    heightMm: 45,
    dpi: 200,
    colorMode: 'colour',
    notes:
      'Front-facing colour photo not older than three months. RRB compares it at the document-verification stage, so it must look like the candidate today.',
    notesHi:
      'तीन महीने से पुरानी नहीं, सामने से ली गई रंगीन फोटो। दस्तावेज़ सत्यापन में इसी से मिलान होता है।',
    source: 'RRB centralised employment notice',
    confidence: 'published',
  },
  {
    code: 'rrb.signature',
    portal: 'Railway RRB',
    portalHi: 'रेलवे आरआरबी',
    label: 'Signature',
    labelHi: 'हस्ताक्षर',
    category: 'signature',
    outputMime: 'image/jpeg',
    minBytes: 10 * KB,
    maxBytes: 40 * KB,
    widthMm: 40,
    heightMm: 20,
    dpi: 200,
    source: 'RRB centralised employment notice',
    confidence: 'published',
  },
  {
    code: 'rrb.scanned_certificate',
    portal: 'Railway RRB',
    portalHi: 'रेलवे आरआरबी',
    label: 'SC / ST / OBC certificate scan',
    labelHi: 'एससी / एसटी / ओबीसी प्रमाण पत्र स्कैन',
    category: 'document',
    outputMime: 'image/jpeg',
    minBytes: 50 * KB,
    maxBytes: 100 * KB,
    dpi: 200,
    colorMode: 'colour',
    notes: 'Whole certificate in frame, all four corners visible, no glare over the seal.',
    notesHi: 'पूरा प्रमाण पत्र फ्रेम में, चारों कोने दिखें, मुहर पर चमक न हो।',
    source: 'RRB centralised employment notice',
    confidence: 'commonly_reported',
  },
];

const ARMY: RequirementPreset[] = [
  {
    code: 'agniveer.photo',
    portal: 'Indian Army (Agniveer)',
    portalHi: 'भारतीय सेना (अग्निवीर)',
    label: 'Photograph',
    labelHi: 'फोटो',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 10 * KB,
    maxBytes: 50 * KB,
    widthMm: 35,
    heightMm: 45,
    dpi: 200,
    colorMode: 'colour',
    requiresNameDateStamp: true,
    notes:
      'The Join Indian Army portal asks for the name and the date written on the photograph. Its limits have changed between recruitment cycles — read the current notification before you rely on these numbers.',
    notesHi:
      'जॉइन इंडियन आर्मी पोर्टल फोटो पर नाम और तारीख मांगता है। हर भर्ती चक्र में सीमाएँ बदली हैं — वर्तमान अधिसूचना जाँचें।',
    source: 'Join Indian Army registration guidance',
    confidence: 'commonly_reported',
  },
  {
    code: 'agniveer.signature',
    portal: 'Indian Army (Agniveer)',
    portalHi: 'भारतीय सेना (अग्निवीर)',
    label: 'Signature',
    labelHi: 'हस्ताक्षर',
    category: 'signature',
    outputMime: 'image/jpeg',
    minBytes: 10 * KB,
    maxBytes: 20 * KB,
    widthMm: 40,
    heightMm: 20,
    dpi: 200,
    source: 'Join Indian Army registration guidance',
    confidence: 'commonly_reported',
  },
];

const STATE_PSC: RequirementPreset[] = [
  {
    code: 'uppsc.photo',
    portal: 'UPPSC',
    portalHi: 'यूपीपीएससी',
    label: 'Photograph',
    labelHi: 'फोटो',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 20 * KB,
    maxBytes: 50 * KB,
    widthMm: 35,
    heightMm: 45,
    dpi: 200,
    colorMode: 'colour',
    requiresNameDateStamp: true,
    notes: 'UPPSC asks for the photo with the name and the date printed below it.',
    notesHi: 'यूपीपीएससी फोटो के नीचे नाम और तारीख मांगता है।',
    source: 'UPPSC OTR / advertisement guidance',
    confidence: 'commonly_reported',
  },
  {
    code: 'uppsc.signature',
    portal: 'UPPSC',
    portalHi: 'यूपीपीएससी',
    label: 'Signature',
    labelHi: 'हस्ताक्षर',
    category: 'signature',
    outputMime: 'image/jpeg',
    minBytes: 10 * KB,
    maxBytes: 20 * KB,
    widthMm: 40,
    heightMm: 20,
    dpi: 200,
    source: 'UPPSC OTR / advertisement guidance',
    confidence: 'commonly_reported',
  },
  {
    code: 'bpsc.photo',
    portal: 'BPSC',
    portalHi: 'बीपीएससी',
    label: 'Photograph',
    labelHi: 'फोटो',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 20 * KB,
    maxBytes: 50 * KB,
    widthMm: 35,
    heightMm: 45,
    dpi: 200,
    colorMode: 'colour',
    source: 'BPSC online application guidance',
    confidence: 'commonly_reported',
  },
];

const SCHOLARSHIP: RequirementPreset[] = [
  {
    code: 'nsp.photo',
    portal: 'National Scholarship Portal',
    portalHi: 'राष्ट्रीय छात्रवृत्ति पोर्टल',
    label: 'Student photograph',
    labelHi: 'छात्र की फोटो',
    category: 'photo',
    outputMime: 'image/jpeg',
    maxBytes: 200 * KB,
    widthMm: 35,
    heightMm: 45,
    dpi: 150,
    colorMode: 'colour',
    source: 'National Scholarship Portal upload guidance',
    confidence: 'published',
  },
  {
    code: 'nsp.document_pdf',
    portal: 'National Scholarship Portal',
    portalHi: 'राष्ट्रीय छात्रवृत्ति पोर्टल',
    label: 'Certificate / marksheet PDF',
    labelHi: 'प्रमाण पत्र / अंकपत्र पीडीएफ',
    category: 'pdf',
    outputMime: 'application/pdf',
    maxBytes: 200 * KB,
    notes:
      'One document per PDF. NSP rejects a file that bundles the income certificate and the marksheet together.',
    notesHi:
      'एक पीडीएफ में एक ही दस्तावेज़। आय प्रमाण पत्र और अंकपत्र एक साथ जोड़ने पर फाइल अस्वीकार होती है।',
    source: 'National Scholarship Portal upload guidance',
    confidence: 'published',
  },
  {
    code: 'up_scholarship.photo',
    portal: 'UP Scholarship',
    portalHi: 'यूपी छात्रवृत्ति',
    label: 'Student photograph',
    labelHi: 'छात्र की फोटो',
    category: 'photo',
    outputMime: 'image/jpeg',
    minBytes: 20 * KB,
    maxBytes: 50 * KB,
    widthMm: 35,
    heightMm: 45,
    dpi: 150,
    colorMode: 'colour',
    source: 'UP scholarship portal upload guidance',
    confidence: 'commonly_reported',
  },
  {
    code: 'up_scholarship.signature',
    portal: 'UP Scholarship',
    portalHi: 'यूपी छात्रवृत्ति',
    label: 'Signature',
    labelHi: 'हस्ताक्षर',
    category: 'signature',
    outputMime: 'image/jpeg',
    minBytes: 10 * KB,
    maxBytes: 20 * KB,
    widthMm: 35,
    heightMm: 15,
    dpi: 150,
    source: 'UP scholarship portal upload guidance',
    confidence: 'commonly_reported',
  },
];

const CERTIFICATES: RequirementPreset[] = [
  {
    code: 'passport_seva.document_pdf',
    portal: 'Passport Seva',
    portalHi: 'पासपोर्ट सेवा',
    label: 'Supporting document PDF',
    labelHi: 'सहायक दस्तावेज़ पीडीएफ',
    category: 'pdf',
    outputMime: 'application/pdf',
    maxBytes: 1024 * KB,
    notes:
      'Passport Seva takes supporting documents as PDF only. The photograph is captured at the Passport Seva Kendra, not uploaded.',
    notesHi:
      'पासपोर्ट सेवा में सहायक दस्तावेज़ केवल पीडीएफ में। फोटो पीएसके पर ली जाती है, अपलोड नहीं होती।',
    source: 'Passport Seva online application help',
    confidence: 'published',
  },
  {
    code: 'edistrict.certificate_100kb',
    portal: 'e-District / general',
    portalHi: 'ई-डिस्ट्रिक्ट / सामान्य',
    label: 'Certificate PDF under 100 KB',
    labelHi: 'प्रमाण पत्र पीडीएफ 100 KB से कम',
    category: 'pdf',
    outputMime: 'application/pdf',
    maxBytes: 100 * KB,
    notes:
      'The tightest limit state certificate portals use. A phone scan usually needs to drop to about 100 DPI greyscale to fit.',
    notesHi:
      'राज्य प्रमाण पत्र पोर्टलों की सबसे सख्त सीमा। मोबाइल स्कैन के लिए लगभग 100 DPI ग्रेस्केल चाहिए।',
    source: 'Common state certificate portal limits',
    confidence: 'commonly_reported',
  },
  {
    code: 'edistrict.certificate_200kb',
    portal: 'e-District / general',
    portalHi: 'ई-डिस्ट्रिक्ट / सामान्य',
    label: 'Certificate PDF under 200 KB',
    labelHi: 'प्रमाण पत्र पीडीएफ 200 KB से कम',
    category: 'pdf',
    outputMime: 'application/pdf',
    maxBytes: 200 * KB,
    source: 'Common state certificate portal limits',
    confidence: 'commonly_reported',
  },
  {
    code: 'edistrict.certificate_500kb',
    portal: 'e-District / general',
    portalHi: 'ई-डिस्ट्रिक्ट / सामान्य',
    label: 'Certificate PDF under 500 KB',
    labelHi: 'प्रमाण पत्र पीडीएफ 500 KB से कम',
    category: 'pdf',
    outputMime: 'application/pdf',
    maxBytes: 500 * KB,
    source: 'Common state certificate portal limits',
    confidence: 'commonly_reported',
  },
];

const GENERIC: RequirementPreset[] = [
  {
    code: 'generic.passport_photo',
    portal: 'General',
    portalHi: 'सामान्य',
    label: 'Passport-size photo 3.5 × 4.5 cm',
    labelHi: 'पासपोर्ट साइज़ फोटो 3.5 × 4.5 सेमी',
    category: 'photo',
    outputMime: 'image/jpeg',
    widthMm: 35,
    heightMm: 45,
    dpi: 300,
    colorMode: 'colour',
    notes:
      'Print quality at 300 DPI. Use this when the customer wants prints rather than an upload.',
    notesHi: '300 DPI पर प्रिंट गुणवत्ता। अपलोड की जगह प्रिंट चाहिए तो यह चुनें।',
    source: 'Standard Indian passport photo size',
    confidence: 'published',
  },
  {
    code: 'generic.stamp_photo',
    portal: 'General',
    portalHi: 'सामान्य',
    label: 'Stamp-size photo 2 × 2.5 cm',
    labelHi: 'स्टाम्प साइज़ फोटो 2 × 2.5 सेमी',
    category: 'photo',
    outputMime: 'image/jpeg',
    widthMm: 20,
    heightMm: 25,
    dpi: 300,
    colorMode: 'colour',
    source: 'Standard Indian stamp photo size',
    confidence: 'published',
  },
  {
    code: 'generic.signature',
    portal: 'General',
    portalHi: 'सामान्य',
    label: 'Signature 3.5 × 1.5 cm',
    labelHi: 'हस्ताक्षर 3.5 × 1.5 सेमी',
    category: 'signature',
    outputMime: 'image/jpeg',
    widthMm: 35,
    heightMm: 15,
    dpi: 300,
    source: 'Common signature box size',
    confidence: 'published',
  },
];

/** Everything the picker offers, in the order it is grouped. */
export const REQUIREMENT_PRESETS: readonly RequirementPreset[] = [
  ...SSC,
  ...NTA,
  ...UPSC,
  ...IBPS,
  ...RRB,
  ...ARMY,
  ...STATE_PSC,
  ...SCHOLARSHIP,
  ...CERTIFICATES,
  ...GENERIC,
];

const BY_CODE: ReadonlyMap<string, RequirementPreset> = new Map(
  REQUIREMENT_PRESETS.map((preset) => [preset.code, preset]),
);

export function findPreset(code: string): RequirementPreset | null {
  return BY_CODE.get(code) ?? null;
}

export function isPresetCode(value: unknown): value is string {
  return typeof value === 'string' && BY_CODE.has(value);
}

export function presetsForCategory(
  category: PresetCategory | readonly PresetCategory[],
): RequirementPreset[] {
  const wanted = new Set<PresetCategory>(
    Array.isArray(category) ? category : [category as PresetCategory],
  );
  return REQUIREMENT_PRESETS.filter((preset) => wanted.has(preset.category));
}

/** Presets grouped by portal, preserving catalogue order so SSC stays at the top. */
export function groupPresetsByPortal(
  presets: readonly RequirementPreset[],
): { portal: string; portalHi?: string; presets: RequirementPreset[] }[] {
  const groups: { portal: string; portalHi?: string; presets: RequirementPreset[] }[] = [];
  for (const preset of presets) {
    const last = groups.at(-1);
    if (last && last.portal === preset.portal) {
      last.presets.push(preset);
      continue;
    }
    const existing = groups.find((group) => group.portal === preset.portal);
    if (existing) {
      existing.presets.push(preset);
      continue;
    }
    groups.push({ portal: preset.portal, portalHi: preset.portalHi, presets: [preset] });
  }
  return groups;
}

/**
 * Free-text search over portal, label and code, in either language.
 *
 * Operators type what the portal calls it ("thumb impression"), the exam ("cgl"), or the Hindi
 * label — all three have to hit.
 */
export function searchPresets(
  query: string,
  presets: readonly RequirementPreset[] = REQUIREMENT_PRESETS,
): RequirementPreset[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...presets];
  return presets.filter((preset) =>
    [preset.portal, preset.portalHi, preset.label, preset.labelHi, preset.code]
      .filter((field): field is string => typeof field === 'string')
      .some((field) => field.toLowerCase().includes(needle)),
  );
}
