---
name: local-supabase
description: Run local Supabase for migrations, seeding and RLS tests. Use when touching supabase/migrations, RLS policies, seed scripts, or running test:rls.
---

1. `npm run check:sql` — parse-checks every migration with the real Postgres grammar. No Docker
   needed, but syntax only: missing tables, bad columns or broken policies still need step 3.
2. `npm run db:start` (Docker must be running).
3. `npm run db:reset` — applies all migrations from scratch.
4. `npm run db:seed` for fake demo data (local only). Seeds must never contain real citizen data.
   `npm run db:seed:adapters` publishes portal adapters; it refuses a remote project unless
   `--confirm-remote` is passed — never pass it without the user's say-so.
5. `npm run test:rls` — runs `packages/database/rls-tests/**`.
6. `npm run db:stop` when done.
