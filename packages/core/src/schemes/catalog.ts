/**
 * The scheme & vacancy catalogue that ships with the build.
 *
 * Same shape of decision as `BUILT_IN_ADAPTERS` in the form engine: an empty database should not
 * mean "this centre has nothing to sell today". These are the high-volume Central and State
 * opportunities a cyber cafe or CSC actually fills, and they are validated at import rather than
 * trusted, because a malformed criterion is a citizen told they qualify for something they do not.
 *
 * Two rules were applied throughout, and both matter more than completeness:
 *
 *   1. Every built-in ships with an empty `schedule` — no start date, no end date. Recruitment
 *      windows move with each notification, and a stale date read aloud at the counter is worse
 *      than no date. A centre that tracks a live window sets it on its own copy in
 *      `schemes_catalog`; the lifecycle badges and countdowns are driven entirely by those dates,
 *      so they stay quiet until somebody has a real one to put in. Evergreen schemes are the
 *      exception and say so with `isAlwaysOpen`, because "open all year" does not go stale.
 *   2. Age limits, income ceilings and qualifications are the *standard published* values for the
 *      scheme. They still change, so every entry carries `officialNotificationUrl` and the UI
 *      always points the operator at it before an application is started.
 *
 * `estimatedOperatorFee` is a typical centre service charge, not a government fee and not a price
 * Assistigo sets. It exists so the widget can show an operator what the next hour is worth.
 */

import { schemeDefinitionSchema, type SchemeDefinition } from './types';

const SCHEMES: readonly SchemeDefinition[] = [
  // -------------------------------------------------------------------------
  // Recruitment — Central
  // -------------------------------------------------------------------------
  {
    id: 'ssc-gd-constable',
    slug: 'ssc-gd-constable',
    title: { en: 'SSC GD Constable', hi: 'एसएससी जीडी कांस्टेबल' },
    shortDescription: {
      en: 'Constable (General Duty) in CAPF, NIA, SSF and Rifleman in Assam Rifles.',
      hi: 'सीएपीएफ, एनआईए, एसएसएफ में कांस्टेबल (जनरल ड्यूटी) और असम राइफल्स में राइफलमैन।',
    },
    benefitsSummary: {
      en: 'Central government job, Pay Level 3 (₹21,700–₹69,100) with full central benefits.',
      hi: 'केंद्र सरकार की नौकरी, वेतन स्तर 3 (₹21,700–₹69,100) पूर्ण केंद्रीय लाभों के साथ।',
    },
    benefitHighlight: { en: '₹21,700+ starting pay', hi: '₹21,700+ प्रारंभिक वेतन' },
    category: 'recruitment',
    portalName: 'Staff Selection Commission',
    portalUrl: 'https://ssc.gov.in/',
    officialNotificationUrl: 'https://ssc.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 100,
    eligibility: {
      minAge: 18,
      maxAge: 23,
      ageRelaxations: { obc: 3, sc: 5, st: 5 },
      minEducationLevel: 'class10',
      requiredDocuments: ['aadhaar', 'marksheet_10th', 'photo', 'signature'],
    },
    pitchTemplate: {
      en: '{name}, SSC GD Constable applications are open and you meet the age and qualification bar. Shall I start your form now? Our charge is ₹{fee}.',
      hi: '{name}, एसएससी जीडी कांस्टेबल के फॉर्म चल रहे हैं और आप उम्र और योग्यता दोनों में फिट हैं। अभी फॉर्म भर दें? हमारा शुल्क ₹{fee} है।',
    },
    upcomingPitchTemplate: {
      en: '{name}, the next SSC GD Constable notification is due in {days} days. Let me keep your 10th marksheet, photo and signature ready now so we apply on the first day — the site crawls in the last week. Our charge is ₹{fee}.',
      hi: '{name}, अगली एसएससी जीडी कांस्टेबल भर्ती {days} दिन में खुल रही है। अभी से 10वीं की मार्कशीट, फोटो और हस्ताक्षर तैयार रखवा दूं ताकि पहले ही दिन फॉर्म भर सकें — आखिरी हफ्ते में साइट चलती ही नहीं। हमारा शुल्क ₹{fee} है।',
    },
  },
  {
    id: 'ssc-chsl',
    slug: 'ssc-chsl',
    title: { en: 'SSC CHSL (10+2)', hi: 'एसएससी सीएचएसएल (10+2)' },
    shortDescription: {
      en: 'Lower Division Clerk, Junior Secretariat Assistant and Data Entry Operator posts.',
      hi: 'लोअर डिवीजन क्लर्क, जूनियर सचिवालय सहायक और डेटा एंट्री ऑपरेटर पद।',
    },
    benefitsSummary: {
      en: 'Central government clerical posts, Pay Level 2–4 with pension and medical cover.',
      hi: 'केंद्र सरकार के लिपिक पद, वेतन स्तर 2–4, पेंशन एवं चिकित्सा सुविधा सहित।',
    },
    benefitHighlight: { en: '₹19,900+ starting pay', hi: '₹19,900+ प्रारंभिक वेतन' },
    category: 'recruitment',
    portalName: 'Staff Selection Commission',
    portalUrl: 'https://ssc.gov.in/',
    officialNotificationUrl: 'https://ssc.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 100,
    eligibility: {
      minAge: 18,
      maxAge: 27,
      ageRelaxations: { obc: 3, sc: 5, st: 5, pwd: 10 },
      minEducationLevel: 'class12',
      requiredDocuments: ['aadhaar', 'marksheet_10th', 'marksheet_12th', 'photo', 'signature'],
    },
    pitchTemplate: {
      en: '{name}, you are 12th pass and within the age limit for SSC CHSL — a central government clerical job. Shall I fill the form? ₹{fee}.',
      hi: '{name}, आप 12वीं पास हैं और एसएससी सीएचएसएल की उम्र सीमा में हैं — केंद्र सरकार की क्लर्क की नौकरी। फॉर्म भर दूं? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, SSC CHSL applications open in {days} days and you fit both the 12th-pass and the age criteria. Shall I collect your marksheets and photo now so your form goes in on day one? ₹{fee}.',
      hi: '{name}, एसएससी सीएचएसएल के फॉर्म {days} दिन में शुरू हो रहे हैं और आप 12वीं पास एवं उम्र, दोनों शर्तों में फिट हैं। अभी मार्कशीट और फोटो ले लूं ताकि पहले ही दिन फॉर्म लग जाए? ₹{fee}।',
    },
  },
  {
    id: 'ssc-cgl',
    slug: 'ssc-cgl',
    title: { en: 'SSC CGL', hi: 'एसएससी सीजीएल' },
    shortDescription: {
      en: 'Group B and Group C posts across central ministries and departments.',
      hi: 'केंद्रीय मंत्रालयों और विभागों में ग्रुप बी और ग्रुप सी पद।',
    },
    benefitsSummary: {
      en: 'Graduate-level central government posts, Pay Level 4–8, the most sought-after SSC exam.',
      hi: 'स्नातक स्तर के केंद्र सरकार पद, वेतन स्तर 4–8, एसएससी की सबसे लोकप्रिय परीक्षा।',
    },
    benefitHighlight: { en: '₹25,500+ starting pay', hi: '₹25,500+ प्रारंभिक वेतन' },
    category: 'recruitment',
    portalName: 'Staff Selection Commission',
    portalUrl: 'https://ssc.gov.in/',
    officialNotificationUrl: 'https://ssc.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 120,
    eligibility: {
      minAge: 18,
      maxAge: 30,
      ageRelaxations: { obc: 3, sc: 5, st: 5, pwd: 10 },
      minEducationLevel: 'graduation',
      requiredDocuments: [
        'aadhaar',
        'marksheet_10th',
        'marksheet_graduation',
        'photo',
        'signature',
      ],
    },
    pitchTemplate: {
      en: '{name}, you are a graduate — SSC CGL is the biggest central government exam and you qualify. Shall I start the form? ₹{fee}.',
      hi: '{name}, आप स्नातक हैं — एसएससी सीजीएल केंद्र सरकार की सबसे बड़ी परीक्षा है और आप पात्र हैं। फॉर्म शुरू करूं? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, SSC CGL opens in {days} days — the biggest graduate-level central exam of the year. Let me keep your degree marksheet and documents ready now. ₹{fee}.',
      hi: '{name}, एसएससी सीजीएल {days} दिन में खुल रहा है — साल की सबसे बड़ी स्नातक स्तर की केंद्रीय परीक्षा। अभी आपकी डिग्री की मार्कशीट और दस्तावेज तैयार रखवा दूं। ₹{fee}।',
    },
  },
  {
    id: 'rrb-group-d',
    slug: 'rrb-group-d',
    title: { en: 'Railway RRB Group D', hi: 'रेलवे आरआरबी ग्रुप डी' },
    shortDescription: {
      en: 'Level 1 posts across Indian Railways — track maintainer, pointsman, assistant grades.',
      hi: 'भारतीय रेलवे में लेवल 1 पद — ट्रैक मेंटेनर, पॉइंट्समैन, सहायक श्रेणी।',
    },
    benefitsSummary: {
      en: 'Railway job at Pay Level 1 (₹18,000) with railway quarters, passes and medical cover.',
      hi: 'वेतन स्तर 1 (₹18,000) पर रेलवे की नौकरी, रेलवे आवास, पास एवं चिकित्सा सुविधा सहित।',
    },
    benefitHighlight: { en: '₹18,000 + railway benefits', hi: '₹18,000 + रेलवे सुविधाएं' },
    category: 'recruitment',
    portalName: 'Railway Recruitment Board',
    portalUrl: 'https://www.rrbcdg.gov.in/',
    officialNotificationUrl: 'https://indianrailways.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 100,
    eligibility: {
      minAge: 18,
      maxAge: 33,
      ageRelaxations: { obc: 3, sc: 5, st: 5, pwd: 10 },
      minEducationLevel: 'class10',
      alsoAcceptsEducation: ['iti'],
      requiredDocuments: ['aadhaar', 'marksheet_10th', 'photo', 'signature'],
    },
    pitchTemplate: {
      en: '{name}, Railway Group D takes 10th pass or ITI and you are inside the age limit. Railway job with quarters and passes — shall I apply? ₹{fee}.',
      hi: '{name}, रेलवे ग्रुप डी में 10वीं या आईटीआई चलता है और आप उम्र सीमा में हैं। रेलवे की नौकरी, आवास और पास के साथ — आवेदन कर दूं? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, the Railway Group D notification opens in {days} days and lakhs of forms go in during the first week. Shall I get your 10th marksheet and photo ready now? ₹{fee}.',
      hi: '{name}, रेलवे ग्रुप डी की भर्ती {days} दिन में खुलेगी और पहले ही हफ्ते में लाखों फॉर्म लग जाते हैं। अभी 10वीं की मार्कशीट और फोटो तैयार करवा दूं? ₹{fee}।',
    },
  },
  {
    id: 'rrb-ntpc',
    slug: 'rrb-ntpc',
    title: { en: 'Railway RRB NTPC', hi: 'रेलवे आरआरबी एनटीपीसी' },
    shortDescription: {
      en: 'Non-technical popular categories — clerk, station master, goods guard, ticket clerk.',
      hi: 'गैर-तकनीकी लोकप्रिय श्रेणियां — क्लर्क, स्टेशन मास्टर, गुड्स गार्ड, टिकट क्लर्क।',
    },
    benefitsSummary: {
      en: 'Railway posts at Pay Level 2–6 for 12th pass and graduate candidates.',
      hi: '12वीं पास और स्नातक उम्मीदवारों के लिए वेतन स्तर 2–6 पर रेलवे पद।',
    },
    benefitHighlight: { en: '₹19,900+ starting pay', hi: '₹19,900+ प्रारंभिक वेतन' },
    category: 'recruitment',
    portalName: 'Railway Recruitment Board',
    portalUrl: 'https://www.rrbcdg.gov.in/',
    officialNotificationUrl: 'https://indianrailways.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 100,
    eligibility: {
      minAge: 18,
      maxAge: 33,
      ageRelaxations: { obc: 3, sc: 5, st: 5, pwd: 10 },
      minEducationLevel: 'class12',
      requiredDocuments: ['aadhaar', 'marksheet_10th', 'marksheet_12th', 'photo', 'signature'],
    },
    pitchTemplate: {
      en: '{name}, RRB NTPC is open for 12th pass — station master and clerk posts. You qualify. Shall I fill it? ₹{fee}.',
      hi: '{name}, आरआरबी एनटीपीसी 12वीं पास के लिए है — स्टेशन मास्टर और क्लर्क के पद। आप पात्र हैं। भर दूं? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, RRB NTPC applications open in {days} days. Let me keep your documents ready now so we file early and you get the exam centre you want. ₹{fee}.',
      hi: '{name}, आरआरबी एनटीपीसी के फॉर्म {days} दिन में शुरू होंगे। अभी दस्तावेज तैयार रखवा दूं ताकि फॉर्म जल्दी लगे और मनचाहा परीक्षा केंद्र मिले। ₹{fee}।',
    },
  },
  {
    id: 'agniveer-army',
    slug: 'agniveer-army',
    title: { en: 'Agniveer (Indian Army)', hi: 'अग्निवीर (भारतीय सेना)' },
    shortDescription: {
      en: 'Four-year Agnipath enrolment as Agniveer General Duty, Technical and Clerk.',
      hi: 'अग्निपथ योजना के तहत चार वर्षीय अग्निवीर जनरल ड्यूटी, तकनीकी एवं क्लर्क भर्ती।',
    },
    benefitsSummary: {
      en: '₹30,000/month starting package with a ₹11.71 lakh Seva Nidhi on completion.',
      hi: '₹30,000 प्रति माह प्रारंभिक पैकेज और सेवा पूर्ण होने पर ₹11.71 लाख सेवा निधि।',
    },
    benefitHighlight: { en: '₹30,000/month + Seva Nidhi', hi: '₹30,000/माह + सेवा निधि' },
    category: 'recruitment',
    portalName: 'Join Indian Army',
    portalUrl: 'https://joinindianarmy.nic.in/',
    officialNotificationUrl: 'https://joinindianarmy.nic.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 100,
    eligibility: {
      minAge: 17,
      maxAge: 21,
      minEducationLevel: 'class10',
      requiredDocuments: [
        'aadhaar',
        'marksheet_10th',
        'domicile_certificate',
        'photo',
        'signature',
      ],
    },
    pitchTemplate: {
      en: '{name}, Agniveer registration is open and you are in the 17–21 age band. ₹30,000 a month plus Seva Nidhi. Shall I register you? ₹{fee}.',
      hi: '{name}, अग्निवीर का रजिस्ट्रेशन चल रहा है और आपकी उम्र 17–21 के बीच है। ₹30,000 महीना और सेवा निधि। रजिस्ट्रेशन कर दूं? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, Agniveer registration opens in {days} days. Let me put your 10th marksheet, domicile and photo in order now — the online window is short. ₹{fee}.',
      hi: '{name}, अग्निवीर का पंजीकरण {days} दिन में खुल रहा है। अभी 10वीं की मार्कशीट, निवास प्रमाण पत्र और फोटो दुरुस्त करवा दूं — ऑनलाइन विंडो छोटी होती है। ₹{fee}।',
    },
  },

  // -------------------------------------------------------------------------
  // Recruitment — State
  // -------------------------------------------------------------------------
  {
    id: 'up-police-constable',
    slug: 'up-police-constable',
    title: { en: 'UP Police Constable', hi: 'यूपी पुलिस कांस्टेबल' },
    shortDescription: {
      en: 'Civil Police constable recruitment by the UP Police Recruitment Board.',
      hi: 'उत्तर प्रदेश पुलिस भर्ती बोर्ड द्वारा सिविल पुलिस आरक्षी भर्ती।',
    },
    benefitsSummary: {
      en: 'State police post, Pay Level 3 (₹21,700–₹69,100), UP domicile required for reservation.',
      hi: 'राज्य पुलिस पद, वेतन स्तर 3 (₹21,700–₹69,100), आरक्षण हेतु यूपी निवास प्रमाण आवश्यक।',
    },
    benefitHighlight: { en: '₹21,700+ starting pay', hi: '₹21,700+ प्रारंभिक वेतन' },
    category: 'recruitment',
    portalName: 'UP Police Recruitment Board',
    portalUrl: 'https://uppbpb.gov.in/',
    officialNotificationUrl: 'https://uppbpb.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 120,
    eligibility: {
      minAge: 18,
      maxAge: 22,
      ageRelaxations: { obc: 3, sc: 5, st: 5, female: 3 },
      allowedStates: ['UP'],
      minEducationLevel: 'class12',
      requiredDocuments: [
        'aadhaar',
        'marksheet_10th',
        'marksheet_12th',
        'domicile_certificate',
        'photo',
        'signature',
      ],
    },
    pitchTemplate: {
      en: '{name}, UP Police Constable is open and you have UP domicile with 12th pass. Shall I fill the form today? ₹{fee}.',
      hi: '{name}, यूपी पुलिस कांस्टेबल की भर्ती चल रही है, आप यूपी के निवासी और 12वीं पास हैं। आज ही फॉर्म भर दें? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, UP Police Constable applications open in {days} days. Shall I get your domicile and caste certificate made now so nothing holds up the form? ₹{fee}.',
      hi: '{name}, यूपी पुलिस कांस्टेबल के फॉर्म {days} दिन में खुलेंगे। अभी निवास और जाति प्रमाण पत्र बनवा दूं ताकि फॉर्म में कोई अड़चन न आए? ₹{fee}।',
    },
  },
  {
    id: 'up-police-si',
    slug: 'up-police-si',
    title: { en: 'UP Police Sub-Inspector', hi: 'यूपी पुलिस उप निरीक्षक' },
    shortDescription: {
      en: 'Sub-Inspector (Civil Police), Platoon Commander and Fire Officer recruitment.',
      hi: 'उप निरीक्षक (नागरिक पुलिस), प्लाटून कमांडर एवं अग्निशमन अधिकारी भर्ती।',
    },
    benefitsSummary: {
      en: 'Gazetted-track state police post, Pay Level 6 (₹35,400–₹1,12,400).',
      hi: 'राज्य पुलिस का अधिकारी वर्ग पद, वेतन स्तर 6 (₹35,400–₹1,12,400)।',
    },
    benefitHighlight: { en: '₹35,400+ starting pay', hi: '₹35,400+ प्रारंभिक वेतन' },
    category: 'recruitment',
    portalName: 'UP Police Recruitment Board',
    portalUrl: 'https://uppbpb.gov.in/',
    officialNotificationUrl: 'https://uppbpb.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 150,
    eligibility: {
      minAge: 21,
      maxAge: 28,
      ageRelaxations: { obc: 3, sc: 5, st: 5 },
      allowedStates: ['UP'],
      minEducationLevel: 'graduation',
      requiredDocuments: [
        'aadhaar',
        'marksheet_graduation',
        'domicile_certificate',
        'photo',
        'signature',
      ],
    },
    pitchTemplate: {
      en: '{name}, you are a graduate with UP domicile — UP Police SI is an officer-track post at ₹35,400. Shall I apply? ₹{fee}.',
      hi: '{name}, आप यूपी निवासी स्नातक हैं — यूपी पुलिस एसआई अधिकारी स्तर का पद है, ₹35,400 वेतन। आवेदन कर दूं? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, UP Police Sub-Inspector applications open in {days} days and you are graduate-qualified. Let me keep your degree and certificates ready now. ₹{fee}.',
      hi: '{name}, यूपी पुलिस दरोगा (एसआई) के फॉर्म {days} दिन में खुलेंगे और आप स्नातक हैं। अभी डिग्री और प्रमाण पत्र तैयार रखवा दूं। ₹{fee}।',
    },
  },
  {
    id: 'bihar-police-constable',
    slug: 'bihar-police-constable',
    title: { en: 'Bihar Police Constable', hi: 'बिहार पुलिस सिपाही' },
    shortDescription: {
      en: 'Constable recruitment by the Central Selection Board of Constable, Bihar.',
      hi: 'केंद्रीय चयन पर्षद (सिपाही भर्ती), बिहार द्वारा सिपाही भर्ती।',
    },
    benefitsSummary: {
      en: 'Bihar police post, Pay Level 3 (₹21,700–₹69,100), Bihar domicile required.',
      hi: 'बिहार पुलिस पद, वेतन स्तर 3 (₹21,700–₹69,100), बिहार निवास प्रमाण आवश्यक।',
    },
    benefitHighlight: { en: '₹21,700+ starting pay', hi: '₹21,700+ प्रारंभिक वेतन' },
    category: 'recruitment',
    portalName: 'CSBC Bihar',
    portalUrl: 'https://csbc.bih.nic.in/',
    officialNotificationUrl: 'https://csbc.bih.nic.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 120,
    eligibility: {
      minAge: 18,
      maxAge: 25,
      ageRelaxations: { obc: 2, sc: 5, st: 5, female: 2 },
      allowedStates: ['BR'],
      minEducationLevel: 'class12',
      requiredDocuments: [
        'aadhaar',
        'marksheet_10th',
        'marksheet_12th',
        'domicile_certificate',
        'photo',
        'signature',
      ],
    },
    pitchTemplate: {
      en: '{name}, Bihar Police Constable is open for 12th pass with Bihar domicile — that is you. Shall I fill it now? ₹{fee}.',
      hi: '{name}, बिहार पुलिस सिपाही भर्ती 12वीं पास बिहार निवासियों के लिए है — आप पात्र हैं। अभी भर दें? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, Bihar Police Constable applications open in {days} days. Shall I get your residence and caste certificate made now so the form goes in on day one? ₹{fee}.',
      hi: '{name}, बिहार पुलिस कांस्टेबल के फॉर्म {days} दिन में खुलेंगे। अभी आवासीय और जाति प्रमाण पत्र बनवा दूं ताकि पहले ही दिन फॉर्म लग जाए? ₹{fee}।',
    },
  },

  // -------------------------------------------------------------------------
  // Welfare & financial
  // -------------------------------------------------------------------------
  {
    id: 'pm-kisan',
    slug: 'pm-kisan',
    title: { en: 'PM-Kisan Samman Nidhi', hi: 'पीएम-किसान सम्मान निधि' },
    shortDescription: {
      en: 'Income support for land-holding farmer families, paid directly into the bank account.',
      hi: 'भूमिधारक किसान परिवारों को सीधे बैंक खाते में आय सहायता।',
    },
    benefitsSummary: {
      en: '₹6,000 a year in three equal instalments of ₹2,000, credited by DBT.',
      hi: '₹2,000 की तीन समान किस्तों में प्रति वर्ष ₹6,000, डीबीटी द्वारा हस्तांतरित।',
    },
    benefitHighlight: { en: '₹6,000 / year', hi: '₹6,000 / वर्ष' },
    category: 'welfare',
    portalName: 'PM-Kisan',
    portalUrl: 'https://pmkisan.gov.in/',
    officialNotificationUrl: 'https://pmkisan.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: true,
      examDate: null,
    },
    estimatedOperatorFee: 50,
    eligibility: {
      minAge: 18,
      requiredTraits: ['farmer'],
      requiredDocuments: ['aadhaar', 'bank_account'],
    },
    pitchTemplate: {
      en: '{name}, if the land is in your name you can get ₹6,000 a year under PM-Kisan, straight to your bank. Registration takes ten minutes — ₹{fee}.',
      hi: '{name}, अगर जमीन आपके नाम है तो पीएम-किसान से हर साल ₹6,000 सीधे बैंक में आएंगे। रजिस्ट्रेशन दस मिनट का काम है — ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, PM-Kisan registration reopens in {days} days. Let me keep your land record, Aadhaar and bank details ready now. ₹{fee}.',
      hi: '{name}, पीएम-किसान का पंजीकरण {days} दिन में फिर खुलेगा। अभी खतौनी, आधार और बैंक विवरण तैयार रखवा दूं। ₹{fee}।',
    },
  },
  {
    id: 'pm-vishwakarma',
    slug: 'pm-vishwakarma',
    title: { en: 'PM Vishwakarma Yojana', hi: 'पीएम विश्वकर्मा योजना' },
    shortDescription: {
      en: 'Recognition, skilling, toolkit incentive and collateral-free credit for 18 traditional trades.',
      hi: '18 पारंपरिक व्यवसायों हेतु पहचान, कौशल प्रशिक्षण, टूलकिट प्रोत्साहन एवं बिना गारंटी ऋण।',
    },
    benefitsSummary: {
      en: '₹15,000 toolkit incentive, ₹500/day training stipend and loans up to ₹3 lakh at 5%.',
      hi: '₹15,000 टूलकिट प्रोत्साहन, ₹500 प्रतिदिन प्रशिक्षण भत्ता और 5% ब्याज पर ₹3 लाख तक ऋण।',
    },
    benefitHighlight: { en: '₹15,000 toolkit + ₹3L loan', hi: '₹15,000 टूलकिट + ₹3 लाख ऋण' },
    category: 'business_loan',
    portalName: 'PM Vishwakarma',
    portalUrl: 'https://pmvishwakarma.gov.in/',
    officialNotificationUrl: 'https://pmvishwakarma.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: true,
      examDate: null,
    },
    estimatedOperatorFee: 100,
    eligibility: {
      minAge: 18,
      requiredTraits: ['artisan'],
      requiredDocuments: ['aadhaar', 'bank_account'],
    },
    pitchTemplate: {
      en: '{name}, PM Vishwakarma gives artisans a ₹15,000 toolkit grant and a ₹3 lakh loan at 5%. Registration is done here — ₹{fee}.',
      hi: '{name}, पीएम विश्वकर्मा में कारीगरों को ₹15,000 का टूलकिट और 5% पर ₹3 लाख का ऋण मिलता है। रजिस्ट्रेशन यहीं हो जाएगा — ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, the next PM Vishwakarma registration round opens in {days} days. Let me keep your Aadhaar and bank details ready so we register you straight away. ₹{fee}.',
      hi: '{name}, पीएम विश्वकर्मा का अगला पंजीकरण दौर {days} दिन में खुलेगा। अभी आधार और बैंक विवरण तैयार रखवा दूं ताकि तुरंत पंजीकरण हो जाए। ₹{fee}।',
    },
  },
  {
    id: 'ayushman-bharat-pmjay',
    slug: 'ayushman-bharat-pmjay',
    title: { en: 'Ayushman Bharat PM-JAY', hi: 'आयुष्मान भारत पीएम-जेएवाई' },
    shortDescription: {
      en: 'Cashless secondary and tertiary hospital care for eligible low-income families.',
      hi: 'पात्र कम आय वाले परिवारों हेतु द्वितीयक एवं तृतीयक स्तर का नकदी रहित अस्पताल उपचार।',
    },
    benefitsSummary: {
      en: '₹5 lakh per family per year at empanelled hospitals, with no premium to pay.',
      hi: 'सूचीबद्ध अस्पतालों में प्रति परिवार प्रति वर्ष ₹5 लाख, कोई प्रीमियम नहीं।',
    },
    benefitHighlight: { en: '₹5 lakh health cover', hi: '₹5 लाख स्वास्थ्य कवर' },
    category: 'welfare',
    portalName: 'Ayushman Bharat',
    portalUrl: 'https://beneficiary.nha.gov.in/',
    officialNotificationUrl: 'https://pmjay.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: true,
      examDate: null,
    },
    estimatedOperatorFee: 50,
    eligibility: {
      requiredTraits: ['bpl'],
      requiredDocuments: ['aadhaar', 'ration_card'],
    },
    pitchTemplate: {
      en: '{name}, your family may already be on the Ayushman list — that is ₹5 lakh of free hospital cover. Let me check and make the card. ₹{fee}.',
      hi: '{name}, आपका परिवार आयुष्मान सूची में हो सकता है — ₹5 लाख तक मुफ्त इलाज। मैं देखकर कार्ड बना देता हूं। ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, the Ayushman card drive opens in {days} days. Keep your ration card and Aadhaar with you and we will make the card the same day. ₹{fee}.',
      hi: '{name}, आयुष्मान कार्ड का अभियान {days} दिन में शुरू होगा। राशन कार्ड और आधार साथ रखिए, उसी दिन कार्ड बनवा देंगे। ₹{fee}।',
    },
  },
  {
    id: 'e-shram-card',
    slug: 'e-shram-card',
    title: { en: 'e-Shram Card', hi: 'ई-श्रम कार्ड' },
    shortDescription: {
      en: 'National database registration for unorganised-sector workers, with a Universal Account Number.',
      hi: 'असंगठित क्षेत्र के श्रमिकों हेतु राष्ट्रीय डेटाबेस पंजीकरण एवं यूनिवर्सल खाता संख्या।',
    },
    benefitsSummary: {
      en: 'Free ₹2 lakh accidental insurance cover and the entry point to most worker welfare schemes.',
      hi: 'निःशुल्क ₹2 लाख दुर्घटना बीमा और अधिकांश श्रमिक कल्याण योजनाओं का प्रवेश द्वार।',
    },
    benefitHighlight: { en: '₹2 lakh accident cover', hi: '₹2 लाख दुर्घटना बीमा' },
    category: 'welfare',
    portalName: 'e-Shram',
    portalUrl: 'https://eshram.gov.in/',
    officialNotificationUrl: 'https://eshram.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: true,
      examDate: null,
    },
    estimatedOperatorFee: 50,
    eligibility: {
      minAge: 16,
      maxAge: 59,
      requiredTraits: ['unorganized_worker'],
      requiredDocuments: ['aadhaar', 'bank_account'],
    },
    pitchTemplate: {
      en: '{name}, the e-Shram card is free ₹2 lakh accident cover and opens the door to the other worker schemes. Two minutes — ₹{fee}.',
      hi: '{name}, ई-श्रम कार्ड में ₹2 लाख का मुफ्त दुर्घटना बीमा है और बाकी श्रमिक योजनाओं का रास्ता भी खुलता है। दो मिनट का काम — ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, e-Shram enrolment reopens in {days} days. Keep your Aadhaar-linked mobile and bank passbook handy and we will register you. ₹{fee}.',
      hi: '{name}, ई-श्रम पंजीकरण {days} दिन में फिर खुलेगा। आधार से जुड़ा मोबाइल और बैंक पासबुक साथ रखिए, हम पंजीकरण कर देंगे। ₹{fee}।',
    },
  },
  {
    id: 'pm-svanidhi',
    slug: 'pm-svanidhi',
    title: { en: 'PM SVANidhi', hi: 'पीएम स्वनिधि' },
    shortDescription: {
      en: 'Collateral-free working capital loans for street vendors, in escalating tranches.',
      hi: 'रेहड़ी-पटरी विक्रेताओं हेतु बिना गारंटी कार्यशील पूंजी ऋण, बढ़ती किस्तों में।',
    },
    benefitsSummary: {
      en: '₹10,000 first loan rising to ₹50,000, with a 7% interest subsidy and cashback on digital payments.',
      hi: 'पहला ऋण ₹10,000, ₹50,000 तक, 7% ब्याज सब्सिडी और डिजिटल भुगतान पर कैशबैक सहित।',
    },
    benefitHighlight: { en: 'Up to ₹50,000 loan', hi: '₹50,000 तक ऋण' },
    category: 'business_loan',
    portalName: 'PM SVANidhi',
    portalUrl: 'https://pmsvanidhi.mohua.gov.in/',
    officialNotificationUrl: 'https://pmsvanidhi.mohua.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: true,
      examDate: null,
    },
    estimatedOperatorFee: 100,
    eligibility: {
      minAge: 18,
      requiredTraits: ['street_vendor'],
      requiredDocuments: ['aadhaar', 'bank_account'],
    },
    pitchTemplate: {
      en: '{name}, PM SVANidhi gives vendors a ₹10,000 loan with no guarantee, going up to ₹50,000 as you repay. Shall I apply? ₹{fee}.',
      hi: '{name}, पीएम स्वनिधि में बिना गारंटी ₹10,000 का ऋण मिलता है, चुकाने पर ₹50,000 तक। आवेदन कर दूं? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, the next PM SVANidhi loan round opens in {days} days. Let me keep your vending certificate and bank details ready now. ₹{fee}.',
      hi: '{name}, पीएम स्वनिधि ऋण का अगला दौर {days} दिन में खुलेगा। अभी वेंडिंग प्रमाण पत्र और बैंक विवरण तैयार रखवा दूं। ₹{fee}।',
    },
  },
  {
    id: 'ladli-behna-mp',
    slug: 'ladli-behna-mp',
    title: { en: 'Mukhyamantri Ladli Behna Yojana', hi: 'मुख्यमंत्री लाड़ली बहना योजना' },
    shortDescription: {
      en: 'Monthly income support for women of Madhya Pradesh, paid directly into their own account.',
      hi: 'मध्य प्रदेश की महिलाओं को उनके अपने खाते में सीधे मासिक आय सहायता।',
    },
    benefitsSummary: {
      en: 'Monthly transfer to the woman’s own bank account; income and land-holding limits apply.',
      hi: 'महिला के अपने बैंक खाते में मासिक हस्तांतरण; आय एवं भूमि सीमा लागू।',
    },
    benefitHighlight: { en: 'Monthly cash transfer', hi: 'मासिक नकद हस्तांतरण' },
    category: 'welfare',
    portalName: 'Ladli Behna, Madhya Pradesh',
    portalUrl: 'https://cmladlibahna.mp.gov.in/',
    officialNotificationUrl: 'https://cmladlibahna.mp.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 50,
    eligibility: {
      minAge: 21,
      maxAge: 60,
      gender: 'female',
      allowedStates: ['MP'],
      maxAnnualIncome: 250_000,
      requiredDocuments: ['aadhaar', 'bank_account', 'income_certificate'],
    },
    pitchTemplate: {
      en: '{name}, Ladli Behna pays a monthly amount straight into a woman’s own account. You meet the conditions — shall I register you? ₹{fee}.',
      hi: '{name}, लाड़ली बहना में हर महीने पैसा सीधे महिला के अपने खाते में आता है। आप शर्तें पूरी करती हैं — रजिस्ट्रेशन कर दूं? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, the next Ladli Behna registration round opens in {days} days. Let me keep your Aadhaar, Samagra ID and bank details ready. ₹{fee}.',
      hi: '{name}, लाड़ली बहना का अगला पंजीकरण दौर {days} दिन में खुलेगा। अभी आधार, समग्र आईडी और बैंक विवरण तैयार रखवा दूं। ₹{fee}।',
    },
  },

  // -------------------------------------------------------------------------
  // Scholarships & education
  // -------------------------------------------------------------------------
  {
    id: 'nsp-post-matric',
    slug: 'nsp-post-matric',
    title: {
      en: 'NSP Post-Matric Scholarship (SC/ST/OBC)',
      hi: 'एनएसपी पोस्ट-मैट्रिक छात्रवृत्ति (एससी/एसटी/ओबीसी)',
    },
    shortDescription: {
      en: 'Central post-matric scholarship for SC, ST and OBC students, via the National Scholarship Portal.',
      hi: 'राष्ट्रीय छात्रवृत्ति पोर्टल के माध्यम से एससी, एसटी एवं ओबीसी विद्यार्थियों हेतु केंद्रीय पोस्ट-मैट्रिक छात्रवृत्ति।',
    },
    benefitsSummary: {
      en: 'Course fee reimbursement plus a maintenance allowance for the full duration of study.',
      hi: 'अध्ययन की पूरी अवधि हेतु पाठ्यक्रम शुल्क प्रतिपूर्ति एवं रखरखाव भत्ता।',
    },
    benefitHighlight: { en: 'Fees + maintenance allowance', hi: 'शुल्क + रखरखाव भत्ता' },
    category: 'scholarship',
    portalName: 'National Scholarship Portal',
    portalUrl: 'https://scholarships.gov.in/',
    officialNotificationUrl: 'https://scholarships.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 80,
    eligibility: {
      allowedCategories: ['sc', 'st', 'obc'],
      minEducationLevel: 'class10',
      maxAnnualIncome: 250_000,
      requiredTraits: ['student'],
      requiredDocuments: [
        'aadhaar',
        'caste_certificate',
        'income_certificate',
        'marksheet_10th',
        'bank_account',
      ],
    },
    pitchTemplate: {
      en: '{name}, the NSP post-matric scholarship covers your course fee and pays a monthly allowance. Bring the caste and income certificate and I will file it — ₹{fee}.',
      hi: '{name}, एनएसपी पोस्ट-मैट्रिक छात्रवृत्ति में फीस भी मिलती है और महीने का भत्ता भी। जाति और आय प्रमाण पत्र ले आइए, मैं भर दूंगा — ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, the National Scholarship Portal opens in {days} days. Get the income and caste certificate made now — every year students lose the scholarship waiting for them. ₹{fee}.',
      hi: '{name}, राष्ट्रीय छात्रवृत्ति पोर्टल {days} दिन में खुलेगा। आय और जाति प्रमाण पत्र अभी बनवा लीजिए — हर साल इन्हीं के इंतज़ार में छात्रवृत्ति छूट जाती है। ₹{fee}।',
    },
  },
  {
    id: 'up-scholarship-post-matric',
    slug: 'up-scholarship-post-matric',
    title: {
      en: 'UP Scholarship & Fee Reimbursement',
      hi: 'यूपी छात्रवृत्ति एवं शुल्क प्रतिपूर्ति',
    },
    shortDescription: {
      en: 'Post-matric scholarship and fee reimbursement for students domiciled in Uttar Pradesh.',
      hi: 'उत्तर प्रदेश के निवासी विद्यार्थियों हेतु पोस्ट-मैट्रिक छात्रवृत्ति एवं शुल्क प्रतिपूर्ति।',
    },
    benefitsSummary: {
      en: 'Tuition fee reimbursement and maintenance allowance, renewed each academic year.',
      hi: 'प्रत्येक शैक्षणिक वर्ष नवीनीकृत होने वाली शुल्क प्रतिपूर्ति एवं रखरखाव भत्ता।',
    },
    benefitHighlight: { en: 'Fee reimbursement', hi: 'शुल्क प्रतिपूर्ति' },
    category: 'scholarship',
    portalName: 'UP Scholarship',
    portalUrl: 'https://scholarship.up.gov.in/',
    officialNotificationUrl: 'https://scholarship.up.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 80,
    eligibility: {
      allowedStates: ['UP'],
      minEducationLevel: 'class10',
      maxAnnualIncome: 200_000,
      requiredTraits: ['student'],
      requiredDocuments: [
        'aadhaar',
        'income_certificate',
        'domicile_certificate',
        'marksheet_10th',
        'bank_account',
      ],
    },
    pitchTemplate: {
      en: '{name}, UP scholarship renewals are on and your fee can be reimbursed in full. I need the income certificate — shall we do it now? ₹{fee}.',
      hi: '{name}, यूपी छात्रवृत्ति चल रही है और आपकी पूरी फीस वापस मिल सकती है। आय प्रमाण पत्र चाहिए — अभी कर लें? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, the UP scholarship portal opens in {days} days. The income and caste certificate take time — shall I apply for them now so the scholarship form is ready? ₹{fee}.',
      hi: '{name}, यूपी छात्रवृत्ति पोर्टल {days} दिन में खुलेगा। आय और जाति प्रमाण पत्र बनने में समय लगता है — अभी आवेदन कर दूं ताकि छात्रवृत्ति फॉर्म तैयार रहे? ₹{fee}।',
    },
  },
  {
    id: 'bihar-post-matric-scholarship',
    slug: 'bihar-post-matric-scholarship',
    title: { en: 'Bihar Post-Matric Scholarship', hi: 'बिहार पोस्ट-मैट्रिक छात्रवृत्ति' },
    shortDescription: {
      en: 'Post-matric scholarship for SC, ST, EBC and BC students domiciled in Bihar.',
      hi: 'बिहार के निवासी एससी, एसटी, ईबीसी एवं बीसी विद्यार्थियों हेतु पोस्ट-मैट्रिक छात्रवृत्ति।',
    },
    benefitsSummary: {
      en: 'Course fee and maintenance support paid through the Bihar e-Kalyan portal.',
      hi: 'बिहार ई-कल्याण पोर्टल के माध्यम से पाठ्यक्रम शुल्क एवं रखरखाव सहायता।',
    },
    benefitHighlight: { en: 'Fees + maintenance support', hi: 'शुल्क + रखरखाव सहायता' },
    category: 'scholarship',
    portalName: 'Bihar e-Kalyan',
    portalUrl: 'https://www.pmsonline.bih.nic.in/',
    officialNotificationUrl: 'https://state.bihar.gov.in/',
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 80,
    eligibility: {
      allowedStates: ['BR'],
      allowedCategories: ['sc', 'st', 'obc'],
      minEducationLevel: 'class10',
      maxAnnualIncome: 250_000,
      requiredTraits: ['student'],
      requiredDocuments: [
        'aadhaar',
        'caste_certificate',
        'income_certificate',
        'domicile_certificate',
        'bank_account',
      ],
    },
    pitchTemplate: {
      en: '{name}, Bihar post-matric scholarship is open for your category and your fee can be covered. Shall I file it? ₹{fee}.',
      hi: '{name}, बिहार पोस्ट-मैट्रिक छात्रवृत्ति आपकी श्रेणी के लिए खुली है और फीस मिल सकती है। भर दूं? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, the Bihar post-matric scholarship portal opens in {days} days. Let me get the income and caste certificate made now so the form is not held up. ₹{fee}.',
      hi: '{name}, बिहार पोस्ट-मैट्रिक छात्रवृत्ति पोर्टल {days} दिन में खुलेगा। अभी आय और जाति प्रमाण पत्र बनवा दूं ताकि फॉर्म अटके नहीं। ₹{fee}।',
    },
  },

  // -------------------------------------------------------------------------
  // Certificates — the centre's own bread and butter
  // -------------------------------------------------------------------------
  {
    id: 'income-certificate',
    slug: 'income-certificate',
    title: { en: 'Income certificate', hi: 'आय प्रमाण पत्र' },
    shortDescription: {
      en: 'Revenue department income certificate, required by almost every scholarship and welfare scheme.',
      hi: 'राजस्व विभाग का आय प्रमाण पत्र, लगभग हर छात्रवृत्ति एवं कल्याण योजना हेतु आवश्यक।',
    },
    benefitsSummary: {
      en: 'Unlocks post-matric scholarships, EWS claims and most state welfare applications.',
      hi: 'पोस्ट-मैट्रिक छात्रवृत्ति, ईडब्ल्यूएस दावे और अधिकांश राज्य कल्याण आवेदनों का द्वार खोलता है।',
    },
    benefitHighlight: { en: 'Unlocks scholarships', hi: 'छात्रवृत्ति का द्वार' },
    category: 'certificate',
    portalName: 'State e-District portal',
    portalUrl: 'https://serviceonline.gov.in/',
    officialNotificationUrl: null,
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: true,
      examDate: null,
    },
    estimatedOperatorFee: 60,
    eligibility: {
      requiredDocuments: ['aadhaar', 'ration_card', 'photo'],
    },
    pitchTemplate: {
      en: '{name}, an income certificate is what most scholarship and welfare forms ask for first. Shall I apply for it today? ₹{fee}.',
      hi: '{name}, आय प्रमाण पत्र ही ज्यादातर छात्रवृत्ति और योजनाओं में सबसे पहले मांगा जाता है। आज ही आवेदन कर दें? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, applications reopen in {days} days. Keep your Aadhaar and ration card ready and we will file the moment it opens. ₹{fee}.',
      hi: '{name}, आवेदन {days} दिन में फिर खुलेंगे। आधार और राशन कार्ड तैयार रखिए, खुलते ही आवेदन कर देंगे। ₹{fee}।',
    },
  },
  {
    id: 'caste-certificate',
    slug: 'caste-certificate',
    title: { en: 'Caste certificate', hi: 'जाति प्रमाण पत्र' },
    shortDescription: {
      en: 'Revenue department caste certificate, required to claim reservation in exams and admissions.',
      hi: 'राजस्व विभाग का जाति प्रमाण पत्र, परीक्षा एवं प्रवेश में आरक्षण हेतु आवश्यक।',
    },
    benefitsSummary: {
      en: 'Unlocks category age relaxation, fee concession and reserved seats across recruitment exams.',
      hi: 'भर्ती परीक्षाओं में श्रेणी आयु छूट, शुल्क रियायत एवं आरक्षित सीटों का लाभ दिलाता है।',
    },
    benefitHighlight: { en: 'Unlocks reservation', hi: 'आरक्षण का लाभ' },
    category: 'certificate',
    portalName: 'State e-District portal',
    portalUrl: 'https://serviceonline.gov.in/',
    officialNotificationUrl: null,
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: true,
      examDate: null,
    },
    estimatedOperatorFee: 60,
    eligibility: {
      allowedCategories: ['obc', 'sc', 'st'],
      requiredDocuments: ['aadhaar', 'photo'],
    },
    pitchTemplate: {
      en: '{name}, without a caste certificate you lose the age relaxation and fee concession on every exam form. Shall I apply for it? ₹{fee}.',
      hi: '{name}, जाति प्रमाण पत्र के बिना हर फॉर्म में उम्र की छूट और फीस की रियायत छूट जाती है। आवेदन कर दूं? ₹{fee}।',
    },
    upcomingPitchTemplate: {
      en: '{name}, applications reopen in {days} days. Keep your Aadhaar and the family caste proof ready and we will file as soon as it opens. ₹{fee}.',
      hi: '{name}, आवेदन {days} दिन में फिर खुलेंगे। आधार और परिवार का जाति प्रमाण तैयार रखिए, खुलते ही आवेदन कर देंगे। ₹{fee}।',
    },
  },
];

/**
 * Parsed eagerly, exactly like the portal adapters: a broken criterion should surface at build and
 * test time, not when an operator is reading eligibility aloud to a customer.
 *
 * The literal keeps its precise type — `parse` runs for its throw, not for its return value, so a
 * looser inferred shape never leaks into the rest of the app.
 */
export const BUILT_IN_SCHEMES: readonly SchemeDefinition[] = SCHEMES.map((scheme) => {
  schemeDefinitionSchema.parse(scheme);
  return scheme;
});

export const BUILT_IN_SCHEME_BY_SLUG: ReadonlyMap<string, SchemeDefinition> = new Map(
  BUILT_IN_SCHEMES.map((scheme) => [scheme.slug, scheme]),
);

export function getBuiltInScheme(slug: string): SchemeDefinition | undefined {
  return BUILT_IN_SCHEME_BY_SLUG.get(slug);
}

/**
 * Merges an organisation's own schemes over the built-ins by slug, the same precedence rule the
 * form engine uses: a centre that corrects an age limit for its state should see its own version,
 * not both.
 */
export function mergeSchemes(
  organizationSchemes: readonly SchemeDefinition[],
  builtIns: readonly SchemeDefinition[] = BUILT_IN_SCHEMES,
): SchemeDefinition[] {
  const bySlug = new Map<string, SchemeDefinition>();
  for (const scheme of builtIns) bySlug.set(scheme.slug, scheme);
  for (const scheme of organizationSchemes) bySlug.set(scheme.slug, scheme);
  return [...bySlug.values()];
}
