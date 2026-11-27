# Bharatfill / BharatDoc — R&D Blueprint: Becoming India's Daily-Life & Service-Centre Standard

> **Date:** 2026-11-26  
> **Goal:** Evolve Bharatfill (`apps/web`, `apps/extension`, `apps/mobile`) from a form-filling & scanning utility into an **irreplaceable daily habit ("addictive standard")** for Cyber Cafes, CSCs, VLEs, CSPs, and every citizen in India.

---

## 1. Current Baseline (Grounded in the Codebase)

From `README.md`, `docs/ROADMAP.md`, `docs/PRD.md`, `docs/CITIZEN_MOBILE_APP_SPEC.md`, and `docs/VAULT_BRIDGE_DESIGN.md`, the platform already has a strong technical foundation:

- **Operator Web Dashboard (`apps/web`):** Next.js 15 App Router + Supabase (Postgres, Auth, Storage, RLS), multi-tenant orgs with 5 roles, Hindi/English localization, Customer CRM with Indian field registry & duplicate detection, masked high-risk fields (full Aadhaar, PAN, bank account) with audited reveal, OCR pipeline (`local-ocr`, `ai-vision`, paste-text import, human review), Document Tools (Photo & Signature Studio, Passport Photo Grid, PVC Card & Aadhaar Mask, PDF Studio, PDF Bundle, and public SEO tools at `/tools/*`), Applications tracking + "Documents needed" checklist, Schemes catalogue & eligibility radar, Walk-in document drop (`/drop/[code]`, `/standee/print`, Telegram/WhatsApp bots), Portal credential vault (OTR/SSO logins + thermal slip print / WhatsApp send), and `/admin` console.
- **Chrome MV3 Extension (`apps/extension`):** Pairing auth, customer picker + roaming access (OTP or BharatDoc app approval), English/Hindi/Hinglish field detection, 20 named transforms, `dependsOn` field ordering, safety classifiers (strictly no auto-submit, no CAPTCHA bypass, no OTP automation, no payment autofill), direct file attachment via `DataTransfer` + offscreen auto-fit to KB/format limits + unambiguous auto-matching, multi-stage tracking, and one-click portal login fill.
- **Citizen Mobile App (`apps/mobile` — BharatDoc):** Expo + React Native, OpenCV + Google ML Kit vFlat-grade scanner, photo/PDF import (including password-protected e-Aadhaar), ID/photo/signature presets, AES-256-GCM encrypted local vault + cloud sync (form documents sync automatically; "Other"/everyday scans stay on the phone by default), Vault PIN + biometrics, Centre access & trusted centres (Stop / Lock), and portal export presets.

### Why It Is Not Yet a Daily "Addiction"
1. **Only 2 real portal adapters exist** (`bihar-rtps-serviceonline` and `ssc-portal`, both still in `testing` status in `docs/ROADMAP.md`).
2. **Infrastructure gaps block real-world loops:** Live Supabase migrations, `POST /api/jobs/run` cron, DLT SMS gateway, WhatsApp Business API notifications, and Razorpay billing webhooks are not yet live.
3. **The workflow stops at "form filled":** Cyber cafes also need counter billing, *udhar* (credit) tracking, print batching, and citizen follow-ups; citizens need daily-life utility beyond occasional govt forms.

---

## 2. Pillar 1 — Making Cyber Cafes, CSCs & VLEs Addicted ("The 9 AM to 9 PM Counter OS")

Operators get addicted to software that **increases daily revenue per hour** and **runs their entire counter**, not just a browser autofill sidebar.

### 2.1 Counter Billing, Token Queue & *Udhar* Khata Ledger
- **Problem:** Cyber cafes handle high-volume, small-ticket cash/UPI transactions (₹50–₹200 per form: Govt Fee + Cafe Service Charge) and frequent *udhar* (citizen pays an advance now and the rest when the admit card or certificate arrives).
- **Solution:** Attach a lightweight **Counter Ledger + Token + Thermal/WhatsApp Receipt + UPI QR** directly to each `application` record.
  - Record `govt_fee`, `service_charge`, `amount_paid`, and `balance_due`.
  - 1-click print on 58mm/80mm thermal printers or send via WhatsApp with the cafe's name, application ID, and pending balance.
  - End-of-day cash/UPI/udhar summary on `/dashboard`. Once their daily cash register lives in Bharatfill, operators open it every morning at 9 AM.

### 2.2 Proactive Revenue Engine ("Sarkari Radar" → WhatsApp Broadcast)
- **Problem:** `packages/core/src/schemes/` and `/schemes` already match eligible customers, but the insight sits passively in the dashboard.
- **Solution:** Turn eligibility matching into a **1-click lead generator**:
  - *"38 of your saved customers are eligible for UP Scholarship / SSC GD (last date in 5 days) — Send WhatsApp alert."*
  - When Bharatfill actively **brings paying walk-in customers back to the shop**, operator retention becomes near 100%.

### 2.3 Scale from 2 Portals → Top 30+ Portals (AI + Crowd-Sourced Mapping)
- **Problem:** Two `testing` adapters cannot support a typical cafe's daily workload.
- **Solution:**
  - **Top-25 Portal Sprint:** Prioritize the highest-volume Indian portals: NTA (NEET/JEE/CUET), Railway RRB, IBPS, UPSC, Parivahan/Sarathi (DL/RC), NSDL/UTIITSL (PAN), Passport Seva, EPFO, Ayushman/PMJAY, NSP Scholarship, and major State e-Districts (UP, Bihar, MP, Rajasthan, Maharashtra, Jharkhand).
  - **AI-Assisted Mapping + Operator Teaching:** Complete Phase 5's AI-assisted mapping (priority 5, org opt-in) and let operators save org-level field overrides when mapping an unfamiliar portal. Allow anonymised label-to-key proposals (zero PII) to flow to the `/admin` review queue so one operator's 2-minute fix upgrades every cafe in India.

### 2.4 "Aaya Kya?" Status & Admit Card Notification Loop
- **Problem:** Citizens visit or call cafes 3–4 times just to ask if their certificate, scholarship, or admit card has arrived.
- **Solution:** Automated **WhatsApp + BharatDoc Push** alerts tied to application status updates:
  - When an operator updates an application status or attaches the final PDF/certificate, the citizen automatically receives: *"Aapka Jaati Praman Patra aa gaya hai — Sharma Cyber Cafe se print le jayein"* (plus a copy pushed straight to their BharatDoc Vault via migration `0047`).

### 2.5 Multi-Customer Batch Print Studio
- **Problem:** Printing 1 customer's 4 passport photos wastes most of an expensive A4 glossy photo sheet.
- **Solution:** Extend `packages/document-tools` with a **Print Queue** that packs multiple customers' passport photos or PVC cards onto **one single A4 sheet** with subtle cut marks and customer labels.

---

## 3. Pillar 2 — Making Every Citizen in India Addicted ("Ghar Ka Digital Locker")

A citizen only fills government forms a few times a year. To prevent uninstalls between exams/schemes, **BharatDoc (`apps/mobile`)** must be useful every week.

### 3.1 Family Profiles ("Ek Phone, Poora Parivar")
- **Reality in India:** One smartphone-literate family member usually manages documents for parents, siblings, and grandparents.
- **Solution:** Add **Family Member Profiles** (`Self`, `Papa`, `Mummy`, `Sister`, etc.) inside one BharatDoc account, with per-member folders, quick switching, and per-member expiry reminders.

### 3.2 Everyday Life Vault + Local-Only Privacy
- **Leverage Existing Architecture:** `docs/VAULT_BRIDGE_DESIGN.md` (§15) already separates form documents (cloud-synced for cafe access) from "Other"/everyday documents ("Keep on this phone only").
- **Solution:** Lean into everyday Indian document clutter—electricity/gas bills, bike RC & insurance, school fee receipts, *Khatauni/Jamabandi* land records, medical prescriptions, and appliance warranties—paired with **smart renewal alerts** (*"Bike PUC expires in 7 days"*, *"Income Certificate expires in 30 days — Renew at nearest Bharatfill centre"*).

### 3.3 Complete vFlat-Parity Scanner & On-Device Searchable OCR
- **Close Remaining Scanner Gaps (`docs/ROADMAP.md`):**
  - **Selfie-to-Studio Passport Photo:** Replace messy home backgrounds with pure white or light-blue studio backgrounds, auto-cropped to 35×45 mm (`< 50 KB`). This single feature drives organic student word-of-mouth.
  - **3D Dewarping & Finger Removal:** Finish flattening curved/folded certificates and erasing thumb edges.
  - **On-Device OCR + Auto-Filing:** Automatically detect document type (*10th Marksheet*, *Aadhaar*, *PAN*), auto-name the file, extract key metadata (Roll No, DOB, Issue Date), and make the entire vault **searchable by text inside any scan**.

### 3.4 DigiLocker Import & Official QR Verification
- **Positioning:** Do not compete with DigiLocker—**be the smart workflow layer on top of it**.
- **Solution:** One-tap import of DigiLocker PDFs and locked e-Aadhaar PDFs (extending `app/import.tsx`), plus **offline QR verification** for Aadhaar, PAN, and e-District certificates so citizens and operators know a document is valid before paying a portal fee.

### 3.5 "Ghar Baithe Form" (Connect & Nearby Verified Centres)
- **Close Remaining App Screen:** Build the **Connect / Nearby Centres** directory in `apps/mobile`.
- **Flow:** Citizen sitting at home picks a verified local CSC/cyber cafe → selects *"Apply for Caste Certificate"* → grants time-boxed vault access → pays via UPI → receives the acknowledgement slip and final certificate directly in their BharatDoc Vault. Zero queues, zero WhatsApp leaks.
- **Biometric vs. OTP Tagging:** Tag Connect catalogue services clearly as **"100% Ghar Baithe Available (Mobile OTP Only)"** vs. **"Visit Centre Required (Fingerprint/Biometric RD)"** (e.g., Aadhaar updates or biometric e-KYC) so citizens only book remote orders where portals allow mobile OTP.

### 3.6 Recommended Remote OTP Standard (Rule-3 & Play-Store Compliant)
Because `docs/DEVELOPMENT_RULES.md` Rule 3 forbids retrieving or auto-entering OTPs (and Google Play forbids `READ_SMS` OTP harvesting), "Ghar Baithe Form" solves portal OTP walls via **Async Prep → 3-Minute Live Window + In-App Ephemeral OTP Ping (with WhatsApp Fallback)**:

1. **Stage 1 — Async Prep (Citizen Offline):**
   - Citizen places the remote order anytime. Operator resizes photos/PDFs, fills all pre-OTP pages, and pauses at the OTP step, tapping **"Ping Citizen (Ready for OTP)"**.
2. **Stage 2 — 3-Minute Live Window & 1-Tap Android Keyboard Paste:**
   - Citizen receives a high-priority push card in BharatDoc showing the exact **Cafe Name**, **Portal Host** (allow-listed government/exam domains only; never banking/UPI), and a bold warning (*"Sirf Sarkari Form OTP dein — Bank, UPI ya Card OTP kabhi na bhejein"*).
   - Citizen reads their SMS and uses Android's built-in Gboard/keyboard OTP suggestion (1 tap, zero `READ_SMS` permission) to submit the code inside BharatDoc.
   - **WhatsApp Fallback:** If the push is unopened after 25–30 seconds, ping the citizen's verified WhatsApp thread (`/api/webhooks/whatsapp`) with the same portal-scoped confirmation prompt.
3. **Stage 3 — Ephemeral Display & Manual Entry (Rule 3 Compliant):**
   - The OTP is relayed over an encrypted ephemeral channel (120-second TTL, **never persisted to Postgres or audit logs**; only metadata `portal_otp_requested` / `portal_otp_shared` / `portal_host` is audited).
   - The Chrome Extension side panel displays the code for the operator to **type manually** into the portal's OTP field (never auto-filled) and wipes it immediately after use.
4. **Stage 4 — Screenshot Proof & Clean Payment Separation:**
   - Before final submission, the operator sends a **Full-Page Preview Screenshot** inside BharatDoc so the citizen approves spelling, DOB, category, and photo.
   - Operators pay portal fees directly via CSC Wallet/Cafe UPI and collect *Govt Fee + Cafe Charge* from the citizen via UPI order checkout—so **bank/UPI OTPs are never relayed**.
   - Citizen's existing **Stop / Freeze** kill switch (`centre-access.tsx`) terminates both the vault grant and the OTP relay channel instantly.

---

## 4. Pillar 3 — The Two-Sided Network Effect & Trust Moat

The unstoppable moat comes from **connecting the cafe counter and the citizen's phone into one closed loop**:

| Loop | Workflow | Why It Creates Addiction |
| :--- | :--- | :--- |
| **Counter → Phone** | Citizen walks in without the app → sends docs via counter QR (`/standee/print` + `/drop/[code]`) → operator uploads final receipt/certificate → **lands directly in citizen's BharatDoc Vault** (migration `0047`). | Citizen learns: *"At a Bharatfill cafe, my receipt and certificate automatically arrive safely on my phone forever."* |
| **Phone → Counter** | Citizen scans cleanly at home → walks into *any* Bharatfill cafe → gives 10-digit mobile → taps **Approve** → **form filled & docs attached in under 2 minutes**. | Cafe learns: *"Bharatfill customers take 2 minutes instead of 20 minutes—I serve 3x more customers per hour."* |
| **DPDP Trust Moat** | Masked Aadhaar, audited reveals, 2-hour/30-min access grants, citizen **Stop / Lock** (`centre-access.tsx`), and **Zero Auto-Submit / Zero CAPTCHA Bypass**. | Positioned as **"Zero-WhatsApp-Leak, Sarkari-Safe"**—legally defensible unlike grey-market auto-submit bots. |

### Physical Branding Standard
- Standardize **"Bharatfill Verified Centre — Zero WhatsApp Leak"** counter standees (`/standee/print`), window stickers, and thermal receipt footers so citizens actively look for the badge in their local market.

---

## 5. Pillar 4 — Recommended Execution Roadmap

### Phase A: Unblock Live Infrastructure (Weeks 1–2)
1. Apply Supabase migrations (`0001`–`0049`) to a hosted staging/production database and run `npm run test:rls`.
2. Wire a cron/scheduler to `POST /api/jobs/run` with `JOB_RUNNER_SECRET`.
3. Provision DLT SMS gateway + WhatsApp Business API + Razorpay billing webhooks.
4. Complete the **Vault Bridge UI** screens between `apps/mobile`, `apps/web`, and `apps/extension`.

### Phase B: Real-World Cafe Pilot (Weeks 3–4)
1. Live smoke-test and promote `bihar-rtps-serviceonline` and `ssc-portal` from `testing` to `active`.
2. Onboard 5–10 real cyber cafes/CSCs and log the **top 15 portals** they open daily.

### Phase C: High-Retention Feature Wave (Month 2)
1. Ship **Top-20 Portal Adapters** + AI/Operator-assisted field mapping.
2. Ship **Counter Khata / Billing / Thermal Receipt** + **WhatsApp Status & Receipt Alerts** in `apps/web`.
3. Ship **Family Profiles**, **Passport Photo Background Replacement**, and **On-Device OCR** in `apps/mobile`.

### Phase D: Bhasha & National Scale (Month 3+)
1. Expand beyond `en` + `hi` to major regional languages (Marathi, Bengali, Tamil, Telugu, Gujarati, Kannada, Odia) with voice-guided hints for rural citizens and VLEs.
2. Launch **Connect / Nearby Verified Centres** for remote "Ghar Baithe Form" orders.
