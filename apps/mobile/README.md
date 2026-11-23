# @assistigo/mobile — Bharatfill Citizen App

Expo + Expo Router app for citizens: a document scanner and a personal vault that a CSC /
cyber cafe operator can read from during form filling.

Spec: `docs/CITIZEN_MOBILE_APP_SPEC.md` (build status in its §8). The scanner, the encrypted
on-device vault, export and the app lock work on the phone; sign-in, cloud sync, Log out and
Delete account are built but switched off unless the build sets the cloud values (below); the
operator bridge and consent controls do not exist yet. Scan quality work: `docs/SCANNER_VFLAT_QUALITY_PLAN.md`.

The app name is **Bharatfill** (`app.json`, `app.name` in `messages/`); the splash, onboarding
and sign-in artwork spell the wordmark **BharatDoc** (`splash.brandPrimary` + `brandAccent`).

## Run

The camera (`react-native-vision-camera`) and OpenCV (`react-native-fast-opencv`) are native
modules, so the app runs as a **development build**, not in Expo Go. One-time setup: install
Android Studio (with the Android SDK), set `ANDROID_HOME`, and connect an Android phone with USB
debugging on (or start an emulator).

```bash
npm run android --workspace @assistigo/mobile   # builds and installs the dev build (first run is slow)
npm run dev:mobile                              # from the repo root: starts Metro for the dev build
npm run typecheck --workspace @assistigo/mobile
npm run test:mobile                             # from the repo root
```

Rebuild with `npm run android` whenever a native dependency or `app.json` plugin changes; for
JS-only changes, Metro reloads the installed build.

### Install on a phone without Metro

- **Local release build:** `npx expo run:android --variant release` (from `apps/mobile`) builds
  and installs a standalone release build on the connected phone. It is signed with the debug
  key — fine for testing, not for the Play Store.
- **EAS:** `eas.json` has `development` (dev client APK), `preview` (installable release APK for
  testers, `npx eas-cli build -p android --profile preview`) and `production` (Play Store app
  bundle) profiles. EAS builds in Expo's cloud and needs an Expo account; no project id or
  signing secrets are committed.

## Real, sample and placeholder

Development builds (`__DEV__`) fill empty screens with the design mockups' sample content so
layouts can be reviewed. Release builds never show it.

| Area                                                            | Release build                                                                                                                                                                          | Dev build extra                                                                             |
| :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| Scanner, review, save, vault, details, export, expiry reminders | Real, on-device                                                                                                                                                                        | Vault shows sample documents while the phone's vault is empty (`components/vault/demo.tsx`) |
| Home                                                            | Counts per category and recent documents from the vault; no name (no profile)                                                                                                          | Sample dashboard while the vault is empty (`components/home/demo.tsx`)                      |
| Connect / nearby centres                                        | No centres (no directory, no location)                                                                                                                                                 | Sample centres (`components/connect/demo.tsx`)                                              |
| Profile                                                         | Cloud builds: the signed-in name and number, Personal Information (edit name, Delete account) and Log out; otherwise the signed-out card. Language, Security (app lock) and About work | Sample account (`components/profile/demo.ts`) when no cloud is configured                   |
| Mobile number / OTP / profile setup                             | Screens and validation only; Get OTP says SMS is not available                                                                                                                         | A dev-only demo number walks the flow through OTP → profile → security; no code is checked  |
| Security setup                                                  | Offline builds: opens App lock set-up; cloud builds: the Vault PIN                                                                                                                     | —                                                                                           |

Every tap on something not built (notifications, directions, calling, Connect & Share, access
history, plans, …) shows a "coming soon" alert; nothing is read or sent.

## Scanner

`app/scanner.tsx` → `app/scan-review.tsx` → `app/save-document.tsx` → `app/scan-result.tsx`.
No cloud processing: every page is processed on the phone.

- **Platform scanner** (`lib/scan/platform-scanner.ts`, native module
  `modules/platform-scanner`, Android only): an ordinary document scan opens Google's ML Kit
  Document Scanner (Google Play services; full mode — neural page detection, flattening, shadow,
  stain and finger clean-up; gallery import; up to 24 pages). Its JPEGs land in the app cache
  and go to review as `platform` pages: not searched for a page again, Original filter first.
  Backing out with no pages leaves; with pages, `PlatformScanLauncher` offers scan again,
  review, the in-app camera, or close. No Play services, iOS, or a scanner that fails to open →
  the in-app camera below. The ID card, photo and signature presets always use the in-app
  camera. The module autolinks from `modules/`; rebuild the dev build after pulling it. ML Kit
  sends Google API usage metrics (not images) — see `docs/CITIZEN_MOBILE_APP_SPEC.md` §8.

- **Upload** (`app/import.tsx`, `components/import/`, `lib/scan/file-import.ts`): add a photo or
  PDF already on the phone without the camera — Home's Upload tile, Vault's More menu and empty
  state. Photos use `expo-image-picker`; files use `expo-document-picker` (PDF, JPG, PNG; copied
  into the cache). Each PDF page is drawn at up to 300 dpi (long side ≤ 2400 px) on white by
  Android's `PdfRenderer` in the local module `modules/pdf-pages` (`lib/scan/pdf-pages.ts`) and
  joins the session as a `pdf` page: not searched for a page, Original filter, no photo-quality
  warning. Locked PDFs prompt for the password (`PdfPasswordSheet`) — `PdfRenderer` with
  `LoadParams` on Android 15, `PdfRendererPreV` on Android 12–14 with SDK extension 13, otherwise
  "cannot open here". The session's `origin` is `import`, so review comes back to Upload and
  Retake reads Replace. One message at the end lists what was skipped. The picked PDF and its
  page images are cache copies, deleted like any scan file. No module on iOS: photos and image
  files only. Rebuild the dev build after pulling it.
- **Camera** (`app/scanner.tsx`, `components/scanner/ScannerScreen.tsx`): a full-screen modal
  opened by the Scan tab, the Home hero and quick actions (`?mode=single|multi`). Live detection
  (`components/scanner/useLiveDocumentDetection.ts`) streams 640×480 frames; a camera-thread
  worklet shrinks the luma plane to ~200px (`lib/scan/luma.ts`) and the JS thread runs
  `detectDocument` about 8 times a second. The outline is drawn over the preview
  (`ScanOverlay.tsx`); Auto Capture fires once the page has been held steady
  (`nextStability` / `steadyProgress` in `lib/scan/geometry.ts`), or Manual uses the shutter.
  The drawn outline is eased between detections (`smoothQuad`); after a shot Auto Capture waits
  until the page is taken away or moved (`nextCaptureArm`), so a page is not shot twice. When
  nothing is found, a low-contrast frame gets a second, contrast-stretched look.
  Torch, tap-to-focus, Tips, Multi-Page (up to 24 pages, `MULTI_PAGE_LIMIT`) and Gallery import
  (HEIC arrives as JPEG) are on the same screen. Photos are 12 MP (`UHD_4_3`,
  `qualityPrioritization: 'quality'`).
- **Presets** (`lib/scan/presets.ts`, `?preset=id_card|photo|signature`, opened by Home's
  shortcuts): **ID card** — front, then back, each prompted; flattened to ID-1 and saved as one
  A4 page with both sides at true size at 300 dpi (`composeIdCardSheet`; if that fails, the sides
  are saved as two pages). **Photo** — one manual shot, cut to 35 × 45 mm at 413 × 531 px with a
  gentle brightness correction and no document filter; the background is left as photographed.
  **Signature** — one shot, cleaned like a document and cropped to its ink. Save Document starts
  photos and signatures on their document type.
- **Capture session** (`lib/scan/capture-session.ts`): the pages in progress, in memory only.
  Pages are processed one at a time; a result that went stale while computing is thrown away.
  Camera and gallery photos go through the same processing.
- **Processing** (`lib/scan/document-vision.ts`): `analysePhoto` turns the photo upright from
  EXIF (`exif.ts`), finds the page from its straight edges (`page-lines.ts`, contour fallback),
  snaps the sides at 1080px and insets 0.5%. `renderPage` warps the page to its true shape
  (`pageAspect`) at 3508px on the long side (A4 at 300 dpi, ≤2× upscale), applies the filter and
  quarter turns, and writes a JPEG to the cache, plus a 240px preview per filter. Filters:
  Magic Color (default), Original, Grayscale, Black & White. Lighting is evened from paper only
  (`paper-light.ts`), then band-pass sharpening and a per-page tone curve (`tone-curve.ts`).
  Tuning notes: `docs/SCANNER_VFLAT_QUALITY_PLAN.md` §6.
- **Photo quality** (`lib/scan/photo-quality.ts`): measured with the analysis, inside the page —
  blurred (edge steepness, which also catches camera shake), too dark, or glare on a laminated
  card. Review shows a warning with Retake or Keep. Thresholds lean towards silence; blur is not
  judged on a passport photo. Never logged.
- **Review** (`components/scanner/ScanReviewScreen.tsx`): page strip, filter cards, pinch-zoom
  viewer (`PageZoomViewer.tsx`, 1–5×), Crop, Delete Page, Add Page, Retake (replaces the page in
  place), retry for a page that failed, and the photo-quality warning. Crop opens
  `CropEditor.tsx` on the original photo: corner handles with a zoom loupe above the finger while
  one is dragged, quarter turns left/right and the ±45° `StraightenDial.tsx`, Reset or Done; the
  page is processed once, on Done. An ID card's pages are named Front and Back; a passport photo
  shows no filter cards.
- **Save Document** (`components/save-document/SaveDocumentScreen.tsx`,
  `lib/vault/save-document.ts`): name, document type (core's `DocumentType`), folder (follows the
  type until changed), up to 10 tags, optional expiry date with a reminder. Saving seals the
  pages into one vault document and deletes every temporary file of the session.
- **Scan result** (`components/scanner/ScanResultScreen.tsx`): the saved pages, Scan Another,
  Delete.

## Vault

- `lib/vault/vault-storage.ts` seals every page with AES-256-GCM (`expo-crypto`) before it is
  written under the app's document directory (`vault/<id>/page-NNN.enc`). The document id and
  page index are GCM additional data, so a page moved between documents fails to decrypt. The
  key is generated on the phone and kept in `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`).
- The index (`vault/index.enc`, `lib/vault/vault-index.ts`) is sealed the same way, parsed with
  Zod on every read and written atomically. It holds ids, dates, page types, and what the citizen
  chose on Save Document: name, type, folder, tags, expiry date, reminder id and a star.
- Decrypted pages exist only in memory, as `data:` URIs. The camera's and picker's plaintext
  copies in the cache / tmp folders are deleted after sealing or discard; gallery originals are
  never touched (`isDisposableScanFile` in `lib/scan/scan-session.ts`).
- **Vault tab** (`app/(tabs)/vault.tsx`, `components/vault/VaultScreen.tsx`,
  `lib/vault/vault-screen.ts`): re-read on focus; search, All / Folders / Recent / Starred chips,
  a tile per category (`lib/vault/categories.ts`) with counts, sort (newest, oldest, name), list or
  grid, star, delete. A virtualised list, so only visible rows decrypt a thumbnail.
- **Document details** (`app/document-details.tsx`, `components/document-details/`,
  `lib/vault/document-details.ts`): page viewer, star, rename, add / remove tags, move folder,
  delete (also cancels the reminder), Share, Download, Print.
- **Export** (`lib/vault/document-export.ts`, `lib/vault/scan-pdf.ts`): a single page exports as
  its image or as a PDF; several pages always as a PDF. JPEG pages go into the PDF byte for byte,
  one PDF page per scan sized to A4's short side; other image types go through `expo-print`.
  Share writes one decrypted copy to `cache/vault-export/`, emptied when the share sheet or the
  details screen closes. Download writes a plaintext file into a folder the citizen picks. Print
  writes no file.
- **Expiry reminders** (`lib/vault/expiry-reminders.ts`): one local notification per document,
  at 09:00 on the earliest of 30 / 7 / 1 / 0 days before expiry that is still ahead. Scheduled on
  the phone, no push token or server. The text never names the document (it can show on the lock
  screen). The `expo-notifications` config plugin is left out of `app.json` on purpose.
- Android backup is off (`allowBackup: false`). Nothing in the vault is uploaded.

## Other screens

- **Launch and registration** (`app/index.tsx`, `app/(auth)/`, `components/splash/`,
  `components/onboarding/`, `components/registration/`): splash → onboarding → mobile number
  (`lib/auth/phone.ts`) → OTP (`lib/auth/otp.ts`, 6 digits, 60 s) → profile setup (name, date of
  birth, gender, state, language; `lib/profile/`) → security setup → tabs. Skip goes straight into
  the app. Reaching the tabs once marks onboarding done (`lib/settings/`), so later cold starts go
  splash → tabs. There is no signed-in session.
- **App settings** (`lib/settings/`): one small JSON file in the app's document directory —
  onboarding done, and the language picked — read synchronously at launch, written atomically.
  No personal data; Zod-validated, and anything unreadable counts as a first launch.
- **Home** (`app/(tabs)/index.tsx`, `components/home/`, `lib/home/dashboard.ts`): greeting, scan
  hero, quick actions, CSC banner (opens Connect), vault categories, recent documents. Read from
  the vault on focus: counts per category and the four newest documents, first pages decrypted
  into memory as thumbnails; tapping one opens its details. The Photo / Signature / ID Card
  shortcuts open the scanner presets.
- **Connect** (`app/(tabs)/share/`, `components/connect/`, `lib/connect/`): the Connect tab,
  Nearby CSC Centers (list or map, 5 / 10 km, Open Now, service filter, name / address search)
  and a centre's details. The map is a drawn illustration with pins, not map tiles. Share sends a
  centre's public listing to the share sheet; saved centres are kept in memory only.
- **Profile** (`components/profile/`, `lib/profile/profile-screen.ts`, `lib/cloud/account.ts`):
  account card, settings list, Log out. Signed in, the card shows the account's name and the
  number from the session and opens Personal Information (`app/account-details.tsx`: edit the
  name; Delete account). The language picker switches `en` / `hi`, is remembered between
  launches (else the device locale) and, signed in, updates the account. About shows the app
  version. No photo, email or plan (design D10).
- **Log out / Delete account** (`lib/cloud/use-leave-account.ts`, `lib/cloud/leave-prompt.ts`;
  design D16): both ask whether the documents on this phone are removed or kept, naming how many
  exist only here. Log out runs a last sync (≤ 15 s) when removing, revokes the session on the
  server and forgets this account's document key, so signing in again needs the Vault PIN.
  Delete account keeps the phone's documents, if asked, as a plain offline vault.
- **Vault ↔ account binding**: the vault index records the one cloud account it syncs with
  (`cloudAccountId`, set on the first sync). Sync refuses any other account, so a second person
  signing in on the same phone never has the first person's documents uploaded into their vault.
- **App lock** (`app/security.tsx`, `components/security/`, `lib/security/`): the phone's own
  fingerprint / face / screen lock (`expo-local-authentication`), or a 4-digit app PIN for phones
  without one — a salted SHA-256 in SecureStore, separate from the Vault PIN. Locks on every cold
  start and after a minute in the background (so Google's scanner, the photo picker and the share
  sheet do not lock the citizen out mid-task), as a `Modal` over the whole app, which keeps its
  place underneath. Five wrong PINs are free, then the wait doubles from 30 s up to an hour;
  nothing is erased for wrong PINs. Changing or removing a lock asks for the current one first.
  Forgot PIN: the phone's screen lock if it has one, otherwise a reset that removes the lock,
  signs the phone out and removes the documents on it (cloud copies untouched).

## Layout

```text
app/
  _layout.tsx               root stack; theme, locale and safe-area providers; modal routes
  index.tsx                 cold start: splash → onboarding, or tabs once onboarding is done
  (auth)/                   splash, onboarding, mobile-number, otp-verification,
                            profile-setup, security-setup
  (tabs)/
    _layout.tsx             Home, Vault, Scan, Connect (`share`), Profile; custom tab bar
    index.tsx               Home
    vault.tsx               Vault: lists the encrypted vault, star / delete / open
    scan.tsx                deep-link fallback; the Scan tab itself opens /scanner
    share/                  Connect stack: index, nearby, centre
    profile.tsx             Profile
  scanner.tsx               camera, live detection, auto capture, gallery
  import.tsx                Upload: photos or PDF / image files already on the phone
  scan-review.tsx           filters, crop / straighten, retake, add / delete page
  save-document.tsx         name, type, folder, tags, expiry reminder; seals into the vault
  scan-result.tsx           the saved scan
  document-details.tsx      one vault document: view, edit, move, delete, share / download / print
components/                 presentational screens, one folder per area, each with a palette.ts
  scanner/                  ScannerScreen, ScanOverlay, ShutterButton, ScanReviewScreen,
                            CropEditor, StraightenDial, PageZoomViewer, ScanResultScreen,
                            useLiveDocumentDetection
  import/                   ImportScreen, PdfPasswordSheet
  save-document/  vault/  document-details/  home/  connect/  profile/
  splash/  onboarding/  registration/  navigation/
  */demo.ts(x)              dev-only sample content (vault, home, connect, profile)
lib/                        pure logic and storage, unit tested where pure
  scan/                     capture-session, scan-session, document-vision (OpenCV),
                            page-lines, paper-light, tone-curve, geometry, exif, luma,
                            photo-quality, presets, filters, file-import, pdf-pages
  vault/                    vault-storage (encryption), vault-index (Zod), categories,
                            save-document, vault-screen, document-details, document-export,
                            scan-pdf, expiry-reminders
  auth/                     phone and OTP validation, registration steps
  profile/                  profile validation, date of birth, profile screen model
  connect/                  Connect view model, nearby search, centre details, saved centres
  home/dashboard.ts         Home view model, from the vault
  settings/                 onboarding done and language: the app's own small settings
  i18n/                     en + hi, dependency-free, mirrors apps/web/lib/i18n
theme/                      colours, presets, ThemeProvider
messages/                   en.json, hi.json
tests/                      runs in the root vitest `mobile` project
```

## Monorepo wiring

- `@assistigo/core` is consumed as TypeScript source (document types, Indian states, gender
  values). `metro.config.js` watches the workspace root and pins a single hoisted React,
  otherwise hooks break on a duplicate copy.
- `tsconfig.json` extends `tsconfig.base.json` and maps `@assistigo/core` to its source.
- `metro.config.js` and `babel.config.js` are CommonJS because Metro and Babel require it; the
  root `eslint.config.mjs` has a scoped override for exactly those two files, and another that
  lets `components/**/*.tsx` `require()` image assets.

## Conventions

- Every user-facing string goes through a translation key, with `en` and `hi` entries; the
  `*-copy.test.ts` tests check both files have the keys.
- No component hard-codes a colour or a spacing number. Themed screens import from `theme/`;
  light-only branded screens take their colours from their folder's `palette.ts`.
- `VAULT_DOCUMENT_TYPES` is exhaustive over core's `DocumentType`: adding a document class in
  core fails the typecheck here until it is placed in a category.
- Route files own navigation, storage and side effects; screens in `components/` are
  presentational; rules live in `lib/` as pure functions so they can be tested without a device.

## Tests

38 test files, 489 tests (`npm run test:mobile`). They cover the pure modules — scan geometry
(including the outline smoothing, auto-capture re-arm and crop loupe), page-lines, paper-light,
tone curve, photo quality (calibrated on synthetic blurred, smeared, dark and glared pages),
presets (print sizes, ID card layout, signature ink box), EXIF / luma, capture session (presets,
quality warnings, the ID card sheet), scan session, scan PDF, vault index, categories, vault
screen, save document, document details, app settings, phone, OTP, profile, date of birth, home
dashboard, Connect / nearby search / centre details / saved centres — and the `en` / `hi` copy of
each screen. OpenCV, the camera, encryption and the file system are not exercised by tests; they
need a device.

## Not built yet

- **Cloud sign-in is built but switched off by default.** With the three `EXPO_PUBLIC_*` values
  in `.env.example` set, registration is real (docs/VAULT_BRIDGE_DESIGN.md §3): phone OTP
  through Supabase Auth (`lib/cloud/auth-client.ts`), name + language, then a 4-digit Vault PIN
  and consent, which creates the account through `POST /api/citizen/account` and stores the
  vault's document key in SecureStore. A number that already has a vault, on a phone without
  its key, goes to the Vault PIN unlock (`app/(auth)/restore.tsx`). Without the values the app
  is offline-only, as before. Needs an SMS sender on the Supabase project (or test OTPs for
  numbers in the 99000 range) and `VAULT_MASTER_KEY` on the dashboard.
- **Old-phone approval and the 7-day restore hold** (design §3.3): named on the restore screen,
  not built.
- **App lock on a device**: built and unit-tested, not yet run on a phone. Check the system
  prompt with and without enrolled biometrics, a phone with no screen lock (app PIN only), the
  relock after Google's scanner and the share sheet, and Forgot PIN → reset. On Android 13+ the
  recent-apps preview is blank (`modules/private-screen`); older Android still shows it.
- **Cloud sync is built (cloud builds, after sign-up)**: `lib/cloud/sync.ts` encrypts each
  document with the vault's cloud key and uploads it — on launch, when the app returns to the
  foreground, and shortly after a save, rename, move or delete. Document Details → More →
  "Keep on this phone only" keeps one document off the cloud (and deletes a synced copy). Not
  built: bringing synced documents back onto a restored phone.
- **Operator bridge**: the server routes are built (`apps/web/app/api/vault/*`,
  `/api/citizen/share-code|access|requests|grants`); the app has no share-code, approve / deny
  or access-history screens yet, so nothing reaches an operator.
- **Consent and access modes**, operator access alerts and access history (spec §3 Feature 4).
- **Centre directory and location**: no real centres, no location permission, no directions or
  calling.
- **Export for a form** (built, not yet run on real photos): Document Details → More → Export
  for a form lists the portal presets that fit a photo or signature (e.g. SSC photo 20–50 KB),
  then frames, resizes, sets DPI and searches JPEG quality until the file is inside the KB
  window. Not built: passport-photo background replacement.
- **On-device OCR** / field extraction.
- **Scan quality gaps**: curled pages are not dewarped, fingers are not removed, and a page on a
  light desk whose edge is too faint even after the contrast stretch is still missed (falls back
  to the full frame for manual cropping).
- **Device check**: the new OpenCV paths (low-contrast fallback, ID card sheet, photo and
  signature presets) and the quality thresholds have only been typechecked and unit-tested on
  synthetic images; they need a pass on real phones and real documents.
- **Persistence of small settings**: saved centres last one session (worth keeping only once
  real centres exist; store them in the encrypted vault, not the plaintext settings file).
- Dark mode for the branded screens (the app is light-only, `userInterfaceStyle: "light"`).
