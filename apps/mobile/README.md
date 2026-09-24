# @assistigo/mobile — Bharatfill Citizen App

Expo + Expo Router app for citizens: a document scanner and a personal vault that a CSC /
cyber cafe operator can read from during form filling.

Spec: `docs/CITIZEN_MOBILE_APP_SPEC.md`. This is Phase 1 (§6) — the scaffold only.

## Run

The document scanner is a native module, so the app runs as a **development build**, not in
Expo Go. One-time setup: install Android Studio (with the Android SDK), set `ANDROID_HOME`, and
connect an Android phone with USB debugging on (or start an emulator that has Google Play).

```bash
npm run android --workspace @assistigo/mobile   # builds and installs the dev build (first run is slow)
npm run dev:mobile                              # from the repo root: starts Metro for the dev build
npm run typecheck --workspace @assistigo/mobile
npm run test:mobile                             # from the repo root
```

Rebuild with `npm run android` whenever a native dependency or `app.json` plugin changes; for
JS-only changes, Metro reloads the installed build.

## Scanner and vault

- `app/scanner.tsx` is a full-screen modal opened by the Scan tab, the Home hero and quick
  actions. The shutter opens the platform scanner — Google ML Kit on Android (edge detection,
  auto-capture, crop, filters, shadow/stain/finger clean-up), VisionKit on iOS — through
  `react-native-document-scanner-plugin`. Gallery imports photos as they are.
- `lib/vault/vault-storage.ts` encrypts every page with AES-256-GCM before it is stored under
  the app's document directory; the key lives in the platform keystore (this device only).
  Plaintext copies left by the scanner or picker are deleted after sealing. Nothing is uploaded.
- Android backup is off (`allowBackup: false`) so vault files never leave the phone.

## Layout

```text
app/
  _layout.tsx          root stack; theme, locale and safe-area providers
  (tabs)/
    _layout.tsx        tab shell — Home, Vault, Scan, Profile
    index.tsx          Home
    vault.tsx          Vault (empty state)
    scan.tsx           Scan (placeholder for the ML Kit scanner)
    profile.tsx        Profile (signed-out shell)
theme/
  colors.ts            brand ramp, vault category accents, light/dark tokens
  presets.ts           spacing, radii, type and composed style presets
  ThemeProvider.tsx    resolves the scheme once and memoises the presets
lib/
  i18n/                en + hi, dependency-free, mirrors apps/web/lib/i18n
  vault/categories.ts  maps @assistigo/core DocumentType onto vault sections
messages/              en.json, hi.json
tests/                 runs in the root vitest `mobile` project
```

## Monorepo wiring

- `@assistigo/core` is consumed as TypeScript source. `metro.config.js` watches the workspace
  root and pins a single hoisted React, otherwise hooks break on a duplicate copy.
- `tsconfig.json` extends `tsconfig.base.json` and maps `@assistigo/core` to its source.
- `metro.config.js` and `babel.config.js` are CommonJS because Metro and Babel require it;
  `eslint.config.mjs` has a scoped override for exactly those two files.

## Conventions

- Every user-facing string goes through a translation key, with `en` and `hi` entries.
- No component hard-codes a colour or a spacing number — import from `theme/`.
- `VAULT_DOCUMENT_TYPES` is exhaustive over core's `DocumentType`: adding a document class in
  core fails the typecheck here until it is placed in a category.

## Not built yet

A vault browser (the Vault tab and Home's counts and recent documents still show no saved
scans), document categories, PDF export, phone OTP sign-in, cloud sync and the
consent/access-mode controls. Scanned documents are stored encrypted on the phone only; no
screen logs or uploads citizen PII.
