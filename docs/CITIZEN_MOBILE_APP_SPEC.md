# Bharatfill Citizen App — Product & Technical Specification

> **Working Title:** BharatDoc / Bharatfill Vault  
> **Positioning:** India's smart personal document scanner and digital vault that connects directly with local Cyber Cafes & CSCs for instant, error-free form filling.  
> **Tagline:** *Aapka Personal Document Scanner & Sarkari Form Vault.*

---

## 1. Executive Summary & Vision

### 1.1 The Core Problem
Every day, millions of Indian citizens visit Jan Seva Kendras, CSCs, and Cyber Cafes to apply for government jobs, scholarships, driver's licenses, and welfare schemes. Today, this process relies on a broken, painful workflow:
1. **The WhatsApp Bottleneck:** The operator asks the citizen: *"Bhaiya WhatsApp pe documents bhejo."*
2. **Poor Image Quality:** Citizens send crooked, tilted photos taken under yellow bulbs, with fingers covering Aadhaar numbers or folded marksheets casting heavy shadows.
3. **Wasted Time & High Rejections:** Operators spend 10–20 minutes per customer in MS Paint or Photoshop cropping, deskewing, and resizing images to strict portal limits (e.g., `< 50 KB JPG` or `200 DPI PDF`). Misread or blurry uploads lead to rejected applications.
4. **Severe Privacy Leaks:** Citizens' Aadhaar cards, caste certificates, and marksheets stay permanently saved in cyber cafe operators' personal WhatsApp galleries and public desktop download folders.

### 1.2 The Solution
The **Bharatfill Citizen App** creates a powerful two-sided ecosystem:
* **For Citizens:** A free, clean, ad-free mobile document scanner (rivaling **vFlat Scan**) and an organized personal digital vault for all official documents.
* **For Cyber Cafe / CSC Operators:** When a customer arrives (or calls), the operator types the customer’s **10-digit mobile number** into the **Bharatfill Chrome Extension**. The customer's pristine, pre-scanned, pre-cropped documents and verified details appear immediately in the vault, ready to autofill and attach to government portals in seconds.

```text
┌─────────────────────────────────────────────────────────────┐
│                 CITIZEN (Mobile App)                        │
│  - vFlat-quality AI Scanner (Auto-crop, flat, magic color)  │
│  - Organized Indian Document Vault (Identity, Education)    │
│  - Linked to citizen's Mobile Number                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ (Direct Cloud Sync via Mobile Number)
┌─────────────────────────────────────────────────────────────┐
│        CSC / CYBER CAFE OPERATOR (Desktop & Extension)      │
│  - Operator searches citizen's Phone Number                 │
│  - Customer profile loads with verified documents           │
│  - Bharatfill Extension injects docs straight into portals  │
│  - Zero WhatsApp mess; Zero local desktop clutter           │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Value Proposition & Growth Flywheel

### 2.1 The Two-Sided Network Advantage
| For the Citizen | For the CSC / Cyber Cafe Operator |
| :--- | :--- |
| **Pristine Document Scans:** No more rejected government forms due to blurry or dark photos. | **15 Minutes Saved per Form:** No manual cropping, deskewing, or WhatsApp downloading. |
| **Personal Digital Locker:** Always carry Aadhaar, 10th marksheet, caste certificate, photo & signature in one secure vault. | **Higher Throughput & Revenue:** Serve 25–30 customers a day instead of 10–12 during peak exam seasons. |
| **Privacy & Security:** Complete control over who accesses documents; no permanent copies left in cafe WhatsApp chats. | **Clean Business Compliance:** No citizen PII cluttering operator phones or public cyber cafe desktop drives. |
| **Remote Form Filling:** Citizen can sit at home, scan documents, call the cafe, and get their form filled without standing in line. | **Customer Loyalty:** Citizens return to Bharatfill-enabled cafes because their profile is already ready. |

### 2.2 The Zero-CAC Distribution Flywheel
* **Every Cyber Cafe Operator is a Marketing Agent:** Operators will display a Bharatfill table-top banner or counter poster with a QR code:  
  *"Apne documents Bharatfill App mein scan karein — Form 2 minute mein bharega!"*
* **Organic Word-of-Mouth:** Because the app functions as a world-class scanner (like vFlat), users keep and use it for everyday scanning needs even when they are not filling government forms.

---

## 3. Core Product Features

### Feature 1: The vFlat-Grade Scanner Engine

The camera module transforms casual phone snapshots into professional laser-scanned copies.

```text
Camera Capture → Edge Detection → 4-Point Warp → Dewarping → Finger Removal → Magic Color
```

1. **Auto-Boundary Detection & Real-Time Shutter:**
   * Automatically detects document borders against any background (table, bedsheet, floor).
   * Visual corner quad overlay with automatic capture as soon as the camera is steady.
   * Manual fine-tune handles with a zoom loupe for millimeter-level corner adjustments.
2. **3D Surface Dewarping & Page Flattening:**
   * Straightens curved book pages, folded certificates, and crumpled paper using neural mesh unwarping (via Google ML Kit / UVDoc).
3. **Finger / Thumb Erasing:**
   * When a user holds a document with their thumb at the edge, the app identifies the skin occlusion, masks the finger, and synthesizes the background paper texture without touching inner text.
4. **"Magic Color" & Background Whitening:**
   * Multi-scale illumination division that eliminates shadows and dingy yellow paper tints.
   * Whitens background to `#FFFFFF` while preserving colored government seals, red stamps, blue ballpoint signatures, and passport photos.
5. **Dedicated Application Asset Presets:**
   * **Passport Photo Mode:** Captures portrait, automatically cleans/replaces background to solid white/light blue, crops to standard Indian 3.5 × 4.5 cm (300 DPI).
   * **Signature Mode:** Isolates black/blue ink on white paper, removes paper shadow, outputs transparent or pure white background.
   * **ID Card Mode:** Dual-shot capture (Front + Back) merged into a single printable A4 or ID card layout.
   * **Multi-Page Booklets:** Merges semester marksheets or multi-page circulars into a single optimized PDF.

---

### Feature 2: Structured Indian Document Vault

Instead of an unorganized photo album, the vault is organized strictly around the categories demanded by Indian recruitment, welfare, and identity portals:

```text
📁 Bharatfill Vault
├── 🪪 1. Identity & Citizenship
│   ├── Aadhaar Card (Front / Back / Full e-Aadhaar)
│   ├── PAN Card
│   ├── Voter ID (EPIC)
│   ├── Driving License
│   └── Passport
├── 🎓 2. Education & Academic
│   ├── 10th (Secondary) Marksheet & Certificate
│   ├── 12th (Senior Secondary) Marksheet & Certificate
│   ├── Graduation / Diploma Degree & Marksheets (Sem 1–8)
│   └── Migration / Transfer Certificate
├── 📜 3. Certificates & Reservations
│   ├── Category / Caste Certificate (SC / ST / OBC-NCL / EWS)
│   ├── Domicile / Resident Certificate (Niwas Praman Patra)
│   ├── Income Certificate (Aay Praman Patra)
│   └── Disability Certificate (UDID) / Ex-Serviceman Docs
└── 📸 4. Ready-to-Fill Form Assets
    ├── Recent Passport Photograph (White background, < 50 KB)
    └── Official Signature (< 20 KB)
```

#### Vault Capabilities:
* **Automatic Field Extraction:** Once scanned, on-device OCR extracts key fields (`name`, `dob`, `roll_number`, `father_name`, `issue_date`) into the customer profile.
* **Offline-First:** Vault documents are cached securely on the device with local SQLite / WatermelonDB.
* **App Lock:** Protected by Biometrics (Fingerprint / Face Unlock / 4-digit PIN).

---

### Feature 3: Seamless Operator Connection (No QR Friction)

#### The Friction-Free Flow:
1. **Citizen Registration:** Citizen registers on the app using their **10-Digit Mobile Number** + SMS OTP.
2. **Automatic Cloud Sync:** Scanned documents and extracted profile details are securely synced to the Bharatfill cloud database (Supabase).
3. **Operator Search in Cafe:**
   * Citizen walks in: *"Bhaiya mera SSC CGL ka form bhardo, number hai 98XXXXXXXX."*
   * Operator opens the **Bharatfill Chrome Extension** or **Dashboard**, enters the 10-digit number.
   * The customer profile opens immediately with all uploaded documents.
4. **Portal Injection:**
   * Operator opens the SSC portal.
   * The Bharatfill side-panel displays: *"Detected required files: Photo (20–50 KB), Signature (10–20 KB), 10th Marksheet (< 200 KB PDF)"*.
   * Operator clicks **"Autofill & Attach"** — Bharatfill automatically selects the pre-sized assets from the vault and attaches them directly into the government portal file inputs.

---

### Feature 4: Privacy & Consent Architecture (DPDP Act 2023 Compliant)

To keep citizens safe and build long-term trust, the app includes robust consent mechanisms:

1. **Instant Activity Alerts:**
   * Whenever an operator accesses the citizen's vault, the citizen receives a push notification:
     > *"Sharma Cyber Cafe accessed your 10th Marksheet and Photo for SSC CGL form filling."*
2. **Access Control Settings (Citizen's Choice):**
   * **Mode A — Open with Authorized Centers (Fastest):** Operators in the Bharatfill verified network can view documents linked to the phone number.
   * **Mode B — Approval Required (Highest Security):** When an operator searches the phone number, the citizen receives a 1-tap notification: *"Allow Sharma Cyber Cafe to access your documents for 30 minutes? [Approve / Deny]"*.
   * **Mode C — 4-Digit Vault PIN:** Citizen tells the operator a 4-digit temporary PIN shown in their app to unlock access.
3. **Zero Local Desktop Residuals:**
   * The Bharatfill Extension injects file buffers directly into web portal inputs via Blob URLs.
   * Documents are **not** downloaded to the cyber cafe's public Windows desktop hard drive.

---

## 4. Technical Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    MOBILE CLIENT (React Native)              │
│                                                             │
│   UI Layer: React Native (Expo) + NativeWind (Tailwind)    │
│   Native Modules: Google Play Services ML Kit Doc Scanner   │
│   Local DB: SQLite / WatermelonDB (Offline Cache)           │
│   Local Security: SecureStore (AES-256 Keys + Biometrics)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / TLS 1.3
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND (Supabase Platform)               │
│                                                             │
│   Auth: Supabase Phone SMS OTP Provider                     │
│   Database: PostgreSQL (Indian Customer Profile Schema)     │
│   Storage: Supabase Private S3 Buckets (Encrypted at Rest)   │
│   Security: Row Level Security (RLS) + Access Token Guards  │
│   Realtime: Event notifications for access requests         │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / WebSockets
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             OPERATOR CLIENT (Desktop & Extension)           │
│                                                             │
│   Web Dashboard: Next.js 15 (Current Repo: apps/web)        │
│   Browser Extension: Chrome Manifest V3 (apps/extension)    │
│   Shared Packages: @assistigo/types, @assistigo/database    │
└─────────────────────────────────────────────────────────────┘
```

### 4.1 Recommended Technology Stack
* **Mobile Framework:** **React Native with Expo**
  * *Why:* Can be added directly into this repository as `apps/mobile` in the existing Turborepo / npm workspaces setup. Directly imports TypeScript types and DB models from `packages/types` and `packages/database`.
* **Scanning Engine:** **Google Play Services ML Kit Document Scanner API**
  * *Why:* Google's official document scanner running on-device. Zero APK size increase; real-time edge detection, auto-crop, shadow removal, and cleaning built by Google.
* **Secondary CV Engine (Dewarp & Finger Removal):** Native C++ / OpenCV bindings (`react-native-fast-opencv`) or MediaPipe Hands.
* **Backend:** Supabase PostgreSQL + Storage (reusing existing backend infrastructure).

---

## 5. Database Schema Extensions

To connect mobile citizens with operator accounts seamlessly, the Supabase schema is extended with:

### 5.1 `citizen_accounts`
Represents the authenticated citizen on the mobile app.
```sql
create table citizen_accounts (
  id uuid primary key default gen_random_uuid(),
  phone_number varchar(15) unique not null,
  full_name text not null,
  avatar_url text,
  vault_pin_hash text,
  access_mode text not null default 'notification_alert', -- 'open_trusted', 'notification_alert', 'pin_required'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 5.2 `citizen_vault_documents`
Stores the pristine scanned documents uploaded by the citizen.
```sql
create table citizen_vault_documents (
  id uuid primary key default gen_random_uuid(),
  citizen_id uuid references citizen_accounts(id) on delete cascade not null,
  document_class varchar(50) not null, -- 'aadhaar_front', 'marksheet_10th', 'photo', 'signature', etc.
  category varchar(30) not null,       -- 'identity', 'academic', 'certificate', 'form_asset'
  file_path text not null,             -- Supabase Storage path
  mime_type varchar(50) not null,
  file_size_bytes bigint not null,
  dimensions jsonb,                    -- { width: 1200, height: 1600, dpi: 300 }
  extracted_fields jsonb,              -- { name: "Rahul Kumar", roll_no: "123456", dob: "2001-05-12" }
  is_verified boolean default false,
  created_at timestamptz default now()
);
```

### 5.3 `operator_access_logs`
Full audit trail for DPDP Act compliance whenever an operator accesses documents.
```sql
create table operator_access_logs (
  id uuid primary key default gen_random_uuid(),
  citizen_id uuid references citizen_accounts(id) not null,
  organization_id uuid references organizations(id) not null,
  operator_id uuid references auth.users(id) not null,
  document_ids uuid[] not null,
  portal_name text,                    -- e.g. "SSC CGL 2026", "UP Scholarship"
  accessed_at timestamptz default now()
);
```

---

## 6. Phased Implementation Roadmap

```text
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│   PHASE 1: SCAN & SAVE │ ───► │  PHASE 2: CLOUD BRIDGE │ ───► │  PHASE 3: SMART TOOLS  │
│   (Standalone Utility) │      │  (Ecosystem Sync)      │      │  (Portal Optimization) │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

### Phase 1: Standalone Scanner & Vault MVP
* Scaffold `apps/mobile` using React Native (Expo).
* Integrate Google ML Kit Document Scanner for high-speed edge detection, auto-crop, and color enhancement.
* Implement the categorized Indian Document Vault with local biometric app lock.
* Multi-page PDF creation and basic export to WhatsApp / Files.

### Phase 2: Phone Authentication & Operator Bridge
* Add Supabase Phone OTP authentication.
* Sync vault documents and extracted key-values to cloud storage.
* Update Bharatfill Chrome Extension & Dashboard (`apps/extension` and `apps/web`) with **Customer Phone Number Search**.
* Allow operators to browse the customer’s cloud vault and attach files directly to government portal inputs.

### Phase 3: Portal Auto-Preparation & Consent Engine
* In-app push notifications for instant access alerts.
* Portal Presets in the mobile app: Export photo directly as "SSC Preset (20–50 KB, 3.5×4.5 cm)" or "UPSC Preset (100–300 KB)".
* Full Hindi + English bilingual localization.

---

## 7. Success Metrics

| Metric | Target (First 6 Months) |
| :--- | :--- |
| **Document Scan Quality Rating** | ≥ 98% accepted on government portals without manual operator edit |
| **Operator Time Saved per Application** | 12 minutes saved per walk-in customer |
| **Customer Retention in Vault** | ≥ 65% of citizens retain the app after initial form filling |
| **Ecosystem Adoption** | ≥ 70% of Bharatfill-partnered cyber cafes have customers walking in with pre-scanned Bharatfill app vaults |
