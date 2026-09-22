# Master Implementation Plan for Claude Code: Audience-Tailored Landing Page for Assistigo.ai

> **Target Audience:** Indian Cyber Cafe Operators, CSC VLEs (Common Service Centres), Jan Seva Kendra / Vasudha Kendra Operators, Bank Mitras (CSPs), and Online Form Filling Kiosks.  
> **Core Objective:** Replace the generic "individual job seeker" landing page with a high-converting, trust-building, bilingual SaaS landing page tailored to the business realities and psychology of Indian digital service operators.  
> **Source Documents:** [`docs/PRD.md`](docs/PRD.md), [`docs/MASTER_BUILD_SPEC.md`](docs/MASTER_BUILD_SPEC.md).

---

## 1. Audience Psychology & Positioning Architecture

### The Audience Reality
- **Who they are:** 25–45 year old small business owners running 1–5 PCs in Tier-1, Tier-2, Tier-3, and rural India (Patna, Lucknow, Ranchi, Indore, Jaipur, Meerut, etc.).
- **Their daily crunch:** During recruitment rushes (SSC CGL/GD, Railway RRB, State Police, BPSC, CTET, RTPS/ServicePlus certificates), 30–60 applicants queue outside their shops. 
- **Their bottlenecks:**
  1. **Manual typing friction:** Typing the same name, father's name, DOB, Aadhaar, address 50 times a day into slow government portals.
  2. **Typo anxiety:** A single spelling mistake can disqualify a candidate, leading to customer disputes and lost trust.
  3. **Photo/Signature formatting:** Spending 5–10 minutes per applicant cropping and compressing files to arbitrary portal limits (e.g., "Must be 20KB–50KB, 200x230 pixels").
  4. **Customer document hunting:** Customers losing their previous year's application details or roll numbers.
- **Their fear of software:** *"Will this software get my portal account banned?"* or *"Will customer forms get rejected?"*

### The Transformation & Core Promise
- **Tagline (English):** *Stop Retyping. Fill Government & Exam Forms in 30 Seconds with 100% Human Review.*
- **Tagline (Hindi / Hinglish):** *ग्राहक की डिटेल्स एक बार सेव करें — सरकारी, भर्ती और स्कॉलरशिप फॉर्म 30 सेकंड में भरें।*
- **The Economic Equation:**
  - Average fee charged per form: **₹50 – ₹100**
  - Average time spent manually: **15 – 20 minutes**
  - Time spent with Assistigo: **30 seconds to 2 minutes**
  - Operator capacity: Increases from **15–20 forms/day ➔ 45–60 forms/day** (+₹15,000 to +₹30,000 extra revenue per month!).
  - Cost of Assistigo: **₹299/month (<₹10/day)** ➔ Pays for itself before 10 AM on Day 1.

---

## 2. Landing Page Component Blueprint

```
apps/web/
├── app/
│   └── page.tsx                         # Landing page container with language state & SEO metadata
└── components/landing/
    ├── translations.ts                  # Bilingual dictionary (English & Hindi/Hinglish)
    ├── header.tsx                       # Sticky glassmorphic navbar with language switch & CTA
    ├── hero.tsx                         # Punchy audience hook, primary CTAs, trust badges
    ├── portal-marquee.tsx               # Animated marquee of 30+ supported portals (SSC, RTPS, CTET...)
    ├── interactive-demo.tsx             # Side-by-side portal autofill simulator with candidate picker
    ├── how-it-works.tsx                 # 3-step operator flow (Save Once ➔ Open Portal ➔ Review & Fill)
    ├── features-grid.tsx                # 6 Cyber Cafe tools (Vault CRM, OCR, Photo Resizer, Receipts...)
    ├── roi-calculator.tsx               # Interactive slider calculating hours saved & ₹ profit gained
    ├── safety-guarantees.tsx            # The 4 non-negotiable legal/safety guardrails (Zero Ban guarantee)
    ├── testimonials.tsx                 # Real operator reviews from Patna, Lucknow, Rajasthan
    ├── pricing.tsx                      # Indian operator tiers (₹0 Free, ₹299 Starter, ₹599 Pro, ₹999 Biz)
    ├── faq.tsx                          # Objection-handling accordion (Portal bans, PC specs, Aadhaar safety)
    └── footer.tsx                       # Trust seals, WhatsApp VLE group link, sticky mobile CTA
```

---

## 3. Phased Execution Tasks for Claude Code

### Phase 1: Translation & Copywriting Engine (`translations.ts`)
Create `apps/web/components/landing/translations.ts` exporting full text dictionaries for `en` (English) and `hi` (Hindi/Hinglish).

```typescript
export type Language = 'en' | 'hi';

export const translations = {
  en: {
    badge: '🎯 Built Exclusively for CSC VLEs, Cyber Cafes & Jan Seva Kendras',
    headlineStart: 'Stop Retyping. Fill Government & Exam Forms in ',
    headlineGradient: '30 Seconds',
    headlineEnd: ' with AI Assistance',
    subheadline: 'Store walk-in customer profiles once. Auto-fill ServicePlus (RTPS), SSC, BPSC, Police, CTET & scholarship portals with zero typing mistakes. You review every field before submitting.',
    ctaPrimary: 'Add to Chrome — Free Trial',
    ctaSecondary: 'Watch 90-Sec Demo (Hindi)',
    trustPills: ['No Credit Card Required', '100% Legal & Portal Safe', 'Works on Any Windows PC'],
    stats: {
      formsFilled: '50,000+',
      formsLabel: 'Forms Auto-Filled',
      timeSaved: '15 Mins',
      timeLabel: 'Saved per Candidate',
      accuracy: 'Zero',
      accuracyLabel: 'Typo Rejections',
      portals: '30+',
      portalsLabel: 'Portals Supported',
    },
    // ... complete dictionary for all components
  },
  hi: {
    badge: '🎯 CSC VLE, साइबर कैफे और जन सेवा केंद्र संचालकों के लिए खास',
    headlineStart: 'बार-बार टाइपिंग बंद करें। सरकारी और भर्ती फॉर्म भरें सिर्फ ',
    headlineGradient: '30 सेकंड',
    headlineEnd: ' में AI के साथ',
    subheadline: 'कस्टमर की डिटेल्स एक बार सेव करें। ServicePlus (RTPS), SSC, BPSC, पुलिस, CTET और स्कॉलरशिप फॉर्म बिना किसी स्पेलिंग गलती के भरें। सबमिट से पहले पूरा कंट्रोल आपके हाथ में।',
    ctaPrimary: 'Chrome में जोड़ें — फ्री ट्रायल',
    ctaSecondary: '90-सेकंड का डेमो देखें (हिंदी)',
    trustPills: ['क्रेडिट कार्ड की जरूरत नहीं', '100% सुरक्षित और लीगल', 'किसी भी सामान्य PC पर चलेगा'],
    stats: {
      formsFilled: '50,000+',
      formsLabel: 'फॉर्म सफलतापूर्वक भरे गए',
      timeSaved: '15 मिनट',
      timeLabel: 'प्रति ग्राहक समय की बचत',
      accuracy: 'शून्य',
      accuracyLabel: 'फॉर्म रिजेक्शन की समस्या',
      portals: '30+',
      portalsLabel: 'सरकारी व भर्ती पोर्टल्स',
    },
    // ... complete dictionary for all components
  }
};
```

---

### Phase 2: High-Converting Header & Hero Component
Update `header.tsx` and `hero.tsx`:
- **Header:**
  - Sticky glassmorphic bar (`backdrop-blur-md bg-white/85 dark:bg-slate-900/85`).
  - Brand Logo + subtitle: `Assistigo.ai` | *Digital Seva Assistant*.
  - Language toggle pill (`🌐 हिंदी` ⇄ `English`) updating global state.
  - High-visibility Chrome Web Store CTA button with Chrome icon.
- **Hero Section:**
  - Clean light background with subtle saffron/blue digital India aura.
  - Animated pulsing badge with real audience callout.
  - Dual CTAs: High-contrast `Add to Chrome — Free Trial` + `Watch 90-Sec Video`.
  - Trust micro-copy: *✓ No Credit Card • ✓ Never Bypasses CAPTCHA/OTP • ✓ DPDPA 2023 Compliant*.
  - Floating mock visual: Chrome side panel docked next to a realistic Indian portal (ServicePlus Bihar / SSC CGL) with green checkmarks indicating instant field match.

---

### Phase 3: Interactive Dual-Screen Portal Simulator
Update `interactive-demo.tsx`:
- Provide an interactive widget directly on the landing page:
  - **Portal Switcher Tabs:**
    1. `Bihar ServicePlus (RTPS) — Caste / Income / Domicile`
    2. `Staff Selection Commission (SSC CGL / GD)`
    3. `National Scholarship Portal (NSP)`
  - **Customer Selector:**
    - Candidate A: *Rakesh Yadav (OBC, Farmer's Son, Motihari)*
    - Candidate B: *Pooja Sharma (General, B.Sc Graduate, Patna)*
  - **Dual Viewport:**
    - **Before (Manual):** Simulates slow manual retyping, typo warning flags, and tedious photo resizing (15 mins).
    - **After (Assistigo):** Clicking *"⚡ 1-Click Autofill"* triggers a simulated streaming fill across Name, Father's Name, DOB, Address, Category with green badges and `98% Confidence`.
  - Proves the value in 5 seconds of visitor interaction.

---

### Phase 4: Cyber Cafe Feature Matrix (`features-grid.tsx`)
Showcase the 6 exact tools cyber cafe operators care about:
1. 🗄️ **Multi-Customer Vault (CRM):** Search 1,000+ customer profiles instantly by Mobile Number or Name when they walk into your shop.
2. 📄 **Indian Document OCR Scanner:** Upload Aadhaar, PAN, or 10th Marksheet — AI extracts name, DOB, father's name, and address automatically.
3. ✂️ **Portal Photo & Signature Resizer:** 1-click crop and compress photos to exact government specs (e.g., *"SSC: 20–50 KB JPG"*, *"RTPS: <350 KB"*).
4. 📱 **WhatsApp Document Standee QR:** Customers scan your shop QR code to WhatsApp their documents directly into draft profiles.
5. 🖨️ **Thermal POS Customer Receipts:** 1-click generate 80mm/58mm printed receipts showing Application Ref Number, fee charged, and customer copy.
6. 🔒 **Aadhaar Masking & Privacy by Default:** Automatically masks Aadhaar (XXXX-XXXX-1234) ensuring complete compliance with UIDAI regulations.

---

### Phase 5: Interactive ROI & Earnings Calculator (`roi-calculator.tsx`)
Create `roi-calculator.tsx` with dynamic sliders:
- **Input Slider 1:** Daily Forms Filled (Range: 5 to 100, default: 20).
- **Input Slider 2:** Fee Charged Per Form (Range: ₹30 to ₹200, default: ₹70).
- **Live Output Displays:**
  - ⏱️ **Time Saved Each Month:** `~45 Hours` (5 full working days gained!).
  - 👥 **Extra Customers You Can Serve:** `+180 Customers/Month`.
  - 💰 **Additional Monthly Revenue:** `+₹12,600 / month`.
  - ⚡ **ROI Callout:** *"Assistigo Starter Plan is just ₹299/mo. It pays for itself after filling just 4 forms!"*

---

### Phase 6: Safety, Legal & Compliance Guarantee Shield (`safety-guarantees.tsx`)
Address the fear of portal bans and legal issues with 4 clear guarantee cards:
1. 🛡️ **Human Operator in Total Control:** Assistigo NEVER auto-submits. You review every filled field before clicking submit.
2. 🛡️ **Zero CAPTCHA & OTP Interference:** CAPTCHA and OTPs are entered manually by you. 100% compliant with government portal Terms of Service.
3. 🛡️ **Zero Risk of Portal Account Bans:** The extension simulates natural human keyboard events (`input`, `change`) without firing unauthorized bot scripts.
4. 🛡️ **Aadhaar Masking & DPDPA 2023:** Stored in an encrypted vault; Aadhaar numbers are masked (XXXX-XXXX-1234) per UIDAI regulations.

---

### Phase 7: Real Operator Testimonials & Social Proof (`testimonials.tsx`)
Include relatable operator personas from key regions:
- **Rameshwar Yadav (CSC VLE, Danapur, Patna):**
  > *"Railway aur Police bharti ke time dukan par bheed lag jati thi. Assistigo se form fill aur photo resize 2 minute me ho jata hai. Galti ka dar bilkul khatam ho gaya."*
- **Sunil Verma (Owner, Speed Cyber Zone, Hazratganj, Lucknow):**
  > *"Customer ka phone number dalo, profile load karo aur 1 click me form ready. Pehle din bhar me 20 form bharta tha, ab 50 bhar leta hoon."*
- **Anil Meena (Digital Seva Kendra, Alwar, Rajasthan):**
  > *"Sabse achhi baat hai ki CAPTCHA aur OTP hum khud daalte hain, to portal block hone ka koi tension nahi hai. Ekdum safe aur legal tool hai."*

---

### Phase 8: Pragmatic Indian Pricing & FAQ Accordion
Update `pricing.tsx` and `faq.tsx`:
- **Pricing:**
  - **Free Trial (₹0 / forever):** Up to 10 customer profiles, 30 autofills/month, basic photo resizer.
  - **Starter VLE (₹299 / month) [Most Popular]:** 250 profiles, unlimited autofills, Indian document OCR, auto photo/signature resizer, WhatsApp QR standee.
  - **Cyber Cafe Pro (₹599 / month):** 1,000 profiles, multi-portal mapping, 80mm thermal receipt generator, 2 PC seats.
  - **Multi-Branch Business (₹999 / month):** Unlimited profiles, unlimited PC logins, priority phone support, custom portal adapter requests.
- **FAQ:**
  - *Kya Assistigo use karne se portal meri ID block kar dega?* (Explain human-in-the-loop and zero CAPTCHA bypass).
  - *Kya mujhe high-speed internet ya mehenga computer chahiye?* (Explain lightweight MV3 Chrome extension architecture).
  - *Aadhaar details store karna safe hai?* (Explain DPDPA 2023 compliance & UIDAI masking).
  - *Free trial ke liye credit card chahiye kya?* (No credit card needed).

---

### Phase 9: Footer & Mobile Sticky Bar (`footer.tsx`)
- Direct link: *"Join 2,500+ CSC VLEs on WhatsApp Support Group"*.
- Trust badges: *Made in India for Digital Bharat* • *DPDPA 2023 Compliant*.
- Sticky floating bottom bar on mobile screens: `[🚀 Add to Chrome — Start Free Trial]`.

---

## 4. Claude Code CLI Commands (Copy & Paste)

When executing via Claude Code in terminal inside `Assistigofill.ai`:

```bash
# Step 1: Translation engine and base page setup
claude "Create apps/web/components/landing/translations.ts with full English and Hindi/Hinglish dictionaries for Indian Cyber Cafe and CSC VLE operators. Then update apps/web/app/page.tsx with language toggle state and SEO metadata."

# Step 2: Header & Hero
claude "Update apps/web/components/landing/header.tsx and apps/web/components/landing/hero.tsx to feature audience-specific messaging for CSC VLEs and cyber cafes. Include language switcher, Chrome Web Store CTA, trust pills, and video modal trigger."

# Step 3: Interactive Portal Simulator
claude "Update apps/web/components/landing/interactive-demo.tsx to show real Indian portals (ServicePlus RTPS, SSC CGL, National Scholarship) with customer switcher, before/after manual typing comparison, and simulated streaming autofill."

# Step 4: Cyber Cafe Features Grid
claude "Update apps/web/components/landing/features-grid.tsx with 6 operator tools: Multi-Customer CRM Vault, Indian Document OCR, 20-50KB Photo/Sign Resizer, WhatsApp QR Standee, 80mm Thermal Receipts, and Aadhaar Masking."

# Step 5: ROI Calculator & Safety Guarantee Shield
claude "Create apps/web/components/landing/roi-calculator.tsx with interactive sliders calculating hours and money saved. Create apps/web/components/landing/safety-guarantees.tsx highlighting the 4 non-negotiable safety rules."

# Step 6: Testimonials, Pricing & FAQ
claude "Create apps/web/components/landing/testimonials.tsx with authentic VLE reviews. Update apps/web/components/landing/pricing.tsx with Indian pricing (₹0, ₹299, ₹599, ₹999) and update apps/web/components/landing/faq.tsx with objection-crushing answers."

# Step 7: Footer & Mobile Sticky Bar
claude "Update apps/web/components/landing/footer.tsx with WhatsApp community link, DPDPA badges, and mobile floating CTA bar."

# Step 8: Quality Checks & Build Validation
claude "Run npm run typecheck --workspace @assistigo/web and npm run lint --workspace @assistigo/web to verify zero errors."
```

---

## 5. Verification Checklist

1. **Language Switch Test:** Toggle `🌐 हिंदी` and verify all headlines, buttons, simulator labels, feature descriptions, calculator metrics, and FAQ items switch instantaneously without layout shift.
2. **Interactive Simulator Test:** Click candidate profiles and hit *"Simulate Assistigo Autofill"*; ensure inputs fill smoothly with green checkmarks and confidence badges.
3. **ROI Calculator Test:** Drag the daily forms slider to verify that hours saved and monthly revenue recalculate dynamically.
4. **Mobile Responsiveness:** Verify navigation folds into a clean hamburger menu, the mobile sticky bottom bar stays accessible, and table/calculator elements wrap smoothly on 375px screens.
5. **No Overclaiming:** Verify copy strictly adheres to PRD principles (*"supported forms"*, *"guided autofill"*, *"operator stays in control"*).
