# Assistigo.ai — agent instructions

## Docs (search them, don't read them whole)

`docs/MASTER_BUILD_SPEC.md` is the source of truth for scope; `docs/DEVELOPMENT_RULES.md` holds
the non-negotiable product rules; `docs/ROADMAP.md` holds phase/status. Area docs: `ARCHITECTURE`,
`DATABASE`, `SECURITY`, `AI_PIPELINE`, `EXTENSION`, `FORM_ENGINE`, `CITIZEN_MOBILE_APP_SPEC` (for
`apps/mobile`). These are large — grep for the relevant section and read only that.

## Never do these

- Add auto-submit, CAPTCHA bypass, OTP automation or payment autofill.
- Put customer PII in logs, error reports or portal adapter reports.
- Use real citizen data in seeds, fixtures or tests.
- Copy competitor branding, copy, layout or assets.
- Invent product scope that is not in the master spec.
- Weaken or delete the safety regression tests.

## Working loop

Before coding, state what you will build, files touched, tests added, and any privacy/security
risk. Implement → test → self-review → fix. After coding, run `typecheck`, `lint`, `test` and
report the real output.

## Conventions

- TypeScript strict; `any` is a lint error; validate every external input with Zod.
- Database `snake_case`; TS `camelCase`; components `PascalCase`.
- Customer field keys look like `customer.father_name`.
- Domain logic lives in `packages/*`, not in React components.
- Authorization is checked server-side in every route handler, and again by RLS.
- Every user-facing string goes through a translation key (`en` + `hi`).

## Gotchas

- `npm test` includes the `rls` project, which throws without a running local Supabase — that is
  an environment failure, not a code bug. Use `--project unit` etc. to skip it, or see the
  `local-supabase` skill.
- `npm run dev:mobile` needs an Expo dev build, not Expo Go.

## Escalate, do not guess

Stop and ask the product owner when a decision affects privacy, billing or legal risk — e.g.
storing a new sensitive field, sending data to a third party, or changing what is retained.
