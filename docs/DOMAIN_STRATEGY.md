# Domain & Branding Strategy

This document outlines the domain selection, brand identity rationale, TLD strategy, and codebase transition guide for the product.

---

## 1. Executive Summary

The project repository currently has references to multiple names:

- **`Assistigo.ai`** (original technical specification and package scope `@assistigo/*`)
- **`Bharatfill.ai`** (git repository name and corpus identity)
- **`Assistigofill.ai`** (local workspace folder name)

### Strategic Verdict

| Candidate            | Primary Recommendation               | Role                                                     |
| :------------------- | :----------------------------------- | :------------------------------------------------------- |
| **`bharatfill.in`**  | 🥇 **Primary Customer & Web Portal** | Public landing page, web dashboard, operator login       |
| **`bharatfill.ai`**  | 🥈 **Tech & Extension Brand**        | Chrome Web Store listing, AI API endpoint, investor docs |
| **`bharatfill.com`** | 🥉 **Defensive Acquisition**         | 301 redirect to primary `.in` or `.ai`                   |

> [!IMPORTANT]
> **Avoid `assistigofill` as a domain or public brand.**
> Combining both words creates a 13-character compound word that is difficult to pronounce, slow to type on mobile, and prone to spelling errors by shop operators.

---

## 2. Target Market & User Psychology

The core users of this platform are **not Silicon Valley developers**—they are Indian micro-entrepreneurs:

- **Village Level Entrepreneurs (VLEs)** operating Common Service Centres (CSCs)
- **Jan Seva Kendra / Maha e-Seva** kiosk operators
- **Cyber cafe and DTP shop operators** in Tier-2, Tier-3, and rural India
- **Recruitment & Exam Form filling agents**

### Linguistic & Cultural Requirements

1. **The "Phone & WhatsApp Test":** An operator in Patna or Gorakhpur must be able to say the website address over a noisy phone call without having to spell it out character by character.
   - _Assistigo:_ Often misheard or misspelled as _asistgo_, _assist-go_, or _asistigo_.
   - _BharatFill:_ Zero spelling confusion across Hindi and regional language speakers.
2. **National & Institutional Trust:** In India, government-facing businesses build immediate legitimacy using national and service nomenclature (e.g., _BharatPe_, _BharatBillPay_, _Jan Seva_, _e-Mitra_).
3. **Utility Clarity:** The word **"Fill"** clearly and immediately communicates the tool's core purpose: filling out complex multi-page online forms.

---

## 3. Brand & Domain Candidate Evaluation

| Rank  | Domain Name                                              |  Trust & Resonance  |              Phonetic Clarity              |   Market Fit    | Verdict                                                                                        |
| :---: | :------------------------------------------------------- | :-----------------: | :----------------------------------------: | :-------------: | :--------------------------------------------------------------------------------------------- |
| **1** | **`bharatfill`**<br>(`.in` / `.ai` / `.com`)             |    **Very High**    |       **High** (2 simple syllables)        | **Exceptional** | **Best overall choice.** Matches the India-first mission and current repository name.          |
| **2** | **`formmitra`**<br>(`.in` / `.ai`)                       |      **High**       | **High** (universally understood in India) |  **Very High**  | Excellent alternative. "Mitra" connects with _Bank Mitra_, _Kisan Mitra_, and _Shiksha Mitra_. |
| **3** | **`sewafill`** / **`jansewafill`**<br>(`.in` / `.co.in`) |      **High**       |                 **Medium**                 |    **High**     | Strongly resonates with Jan Seva Kendra operators, but slightly longer.                        |
| **4** | **`fillkaro`**<br>(`.in`)                                |     **Medium**      |                  **High**                  |   **Medium**    | Catchy, modern consumer brand, but sounds more like a consumer app than B2B operator software. |
| **5** | **`assistigo`**<br>(`.ai`)                               | **Low in Tier-2/3** |     **Low** (frequent spelling errors)     |     **Low**     | Sounds like an international or medical SaaS. Weak organic recall among Indian shop owners.    |

---

## 4. TLD (Top Level Domain) Strategy

### Comparison Matrix

| TLD          | Estimated Cost (Annual)                                                          | Strengths                                                                                            | Drawbacks                                  | Recommended Use                                       |
| :----------- | :------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- | :----------------------------------------- | :---------------------------------------------------- |
| **`.in`**    | ₹399 – ₹699 / year                                                               | • High domestic trust<br>• Local SEO boost for Google India<br>• Familiar to government portal users | Less global tech prestige                  | **Primary web app & dashboard** (`app.bharatfill.in`) |
| **`.ai`**    | $70 – $85 / year (~₹6,000–₹7,500/yr)<br>_(Note: 2-year min. on most registrars)_ | • Tech startup credibility<br>• Emphasizes OCR & AI extraction<br>• Great for Chrome Web Store       | Higher cost commitment                     | **Extension brand & API** (`api.bharatfill.ai`)       |
| **`.com`**   | $10 – $14 / year (~₹900–₹1,200/yr)                                               | • Global default instinct                                                                            | High likelihood of secondary market markup | **Defensive purchase (301 redirect)**                 |
| **`.co.in`** | ₹299 – ₹499 / year                                                               | • Established Indian commercial TLD                                                                  | Clunkier than single `.in`                 | Secondary defensive purchase                          |

### Recommended DNS & Routing Architecture

```text
[bharatfill.com] ──(301 redirect)──┐
                                   ▼
[bharatfill.ai]  ──(301 redirect)──► [bharatfill.in]  (Public Landing Page)
                                            │
                                            ├──► app.bharatfill.in  (Web Dashboard / Next.js)
                                            └──► api.bharatfill.in  (API Handlers / Webhooks)
```

_(Alternatively, `bharatfill.ai` can serve as the primary marketing site if targeting investors or premium cyber cafes, with `bharatfill.in` redirecting to it.)_

---

## 5. Registrar & Security Guidelines

1. **Recommended Registrars:**
   - **For `.in`:** Dynadot, Namecheap, Porkbun, or INRegistry-accredited Indian registrars.
   - **For `.ai`:** Porkbun, Namecheap, or Dynadot (compare 2-year renewal fees).
2. **Essential Configurations:**
   - **WHOIS Privacy:** Enable privacy protection to prevent personal contact spam.
   - **Two-Factor Authentication (2FA):** Mandatory hardware/app-based 2FA on the registrar account.
   - **DNSSEC:** Enable DNSSEC at the registrar to prevent DNS spoofing.
   - **Email Security Records:** Configure `SPF`, `DKIM`, and `DMARC` records immediately upon acquiring the domain to ensure transactional verification emails (Supabase Auth) land in customer inboxes.

---

## 6. Codebase & Configuration Checklist (When Migrating)

When finalizing the domain and brand transition from `assistigo` to `bharatfill`, the following locations in the codebase should be updated:

### 1. Environment Variables (`.env.local` & production deployment)

- [ ] `NEXT_PUBLIC_APP_URL` (`https://app.bharatfill.in`)
- [ ] `NEXT_PUBLIC_SITE_URL` (`https://bharatfill.in`)
- [ ] Supabase Authentication redirect URLs and email templates

### 2. Chrome Extension (`apps/extension`)

- [ ] `manifest.json`: `name` ("BharatFill - AI Form Filling Assistant for CSC & Cyber Cafes")
- [ ] Extension permissions and host permissions: `https://api.bharatfill.in/*` or `https://*.bharatfill.in/*`
- [ ] Chrome Web Store listing, promotional tiles, and privacy policy URL

### 3. Public Web & i18n (`apps/web`)

- [ ] `apps/web/app/layout.tsx`: OpenGraph titles, meta descriptions, canonical URLs
- [ ] Shared copy and localization dictionaries in Hindi (`hi`) and English (`en`)
- [ ] Support email references (e.g., `support@bharatfill.in`)

### 4. Monorepo Package Scopes (Optional / Gradual)

- The internal npm package namespace (currently `@assistigo/*`) can either remain as internal technical debt or be systematically renamed to `@bharatfill/*` during a dedicated refactoring phase.
