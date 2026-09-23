# @assistigo/mobile — Bharatfill Citizen App

Expo + Expo Router app for citizens: a document scanner and a personal vault that a CSC /
cyber cafe operator can read from during form filling.

Spec: `docs/CITIZEN_MOBILE_APP_SPEC.md`. This is Phase 1 (§6) — the scaffold only.

## Run

```bash
npm run dev:mobile          # from the repo root
npm run typecheck --workspace @assistigo/mobile
npm run test:mobile         # from the repo root
```

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

Scanner capture, vault persistence, phone OTP sign-in, cloud sync and the consent/access-mode
controls. No screen currently reads, stores or logs citizen PII.
