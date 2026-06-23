# Runtime Hardening — STATUS

> Update this file at the end of every working session. It is the resume pointer:
> an agent reads this first, then jumps to the named task in [`PLAN.md`](./PLAN.md).

**Current phase:** P2 — BullMQ foundation (in progress)
**Next unchecked task:** `P2` — `lib/workflows/*` workflow definitions for multi-step processes.
**Blockers:** none.

## Decisions locked
- **Runtime:** Full BullMQ — separate always-on worker host + managed Redis (P10). Web stays on Vercel.
- **Scope:** Entire plan P0–P11.
- **Migrations/workers:** use `DIRECT_URL` (Neon HTTP driver has no interactive transactions).
- **Email live-send:** stays `EMAIL_SEND_DRY_RUN=true` until P4/P6 verified.
- **Tenant scoping:** `@default("default-tenant")` removed from all 23 models; middleware in `lib/prisma.ts` injects `tenantId` from session. Seed wraps operations in `tenantStorage.run()` for explicit tenant context.
- **Token encryption:** OAuth tokens encrypted on save via `lib/crypto.ts`; decrypted on read in `EmailService.fromAccount()`. Old plaintext columns kept for backfill.
- **Suppression dedup:** Partial unique indexes using `COALESCE("campaignId", '')` to handle nullable campaignId; one active enrollment per lead per sequence via `WHERE status='active'`; lead dedup on `(tenantId, campaignId, normalizedEmail)`.

## Progress log
- 2026-06-23 — Plan authored, verified against codebase, committed. Pinned as primary flow in `CLAUDE.md` / `AGENTS.md` / `.claude/rules/runtime-hardening.md`. No app code changed yet.
- 2026-06-23 — P0.1: Lead list AND-compose fix already applied to codebase (found during verification). No additional changes needed.
- 2026-06-23 — P0.2–P0.11: Completed entire workflow correctness phase. Added timezone boundary helper, lead access validations, soft archiving on delete, task completion CAS, and Topbar role fencing. Verified with passing Vitest tests.
- 2026-06-23 — P1.0: Reconciled database drift. Created and applied migration for Tenant, tenantId, and AiMemory drift. Modified seed.ts to upsert default-tenant first, and verified database seed and tests.
- 2026-06-23 — P2: BullMQ foundation built. Installed `bullmq` + `ioredis`. Created `lib/bullmq/{connection,types,queues,jobOptions,enqueue,events,index}.ts`. Created `workers/{index,healthcheck}.ts`. Created `scripts/{worker-dev,worker-start}.cjs`. Updated `package.json` scripts + `.env.example` with `REDIS_URL`.
- 2026-06-23 — **P1.1** ✓ — Removed `@default("default-tenant")` from all 23 models in `schema.prisma`. Updated seed.ts to use middleware-aware `prisma` + `tenantStorage.run()` for tenant context. Migration SQL created.
- 2026-06-23 — **P1.9** ✓ — Added `encAccessToken`/`encRefreshToken` fields to EmailAccount schema. Encrypt on save in Google OAuth, Microsoft OAuth, and IMAP/SMTP accounts routes. Decrypt on read in `EmailService.fromAccount()`. Encrypt refreshed tokens in GmailAdapter `tokens` handler and OutlookAdapter `refreshAccessToken()`. Created backfill script `scripts/encrypt-existing-tokens.ts`. 4 crypto round-trip tests passing.
- 2026-06-23 — **P1.4** ✓ — SuppressionEntry uniqueness: partial unique indexes with `COALESCE("campaignId", '')` for email/domain/company + schema `@@unique` constraints.
- 2026-06-23 — **P1.5** ✓ — SequenceEnrollment: removed full `@@unique([leadId,sequenceId])`; replaced with partial `WHERE status='active'` via raw SQL. Enum already has `completed|unenrolled`.
- 2026-06-23 — **P1.7** ✓ — Lead dedup: partial unique index on `(tenantId, campaignId, normalizedEmail)` where `normalizedEmail IS NOT NULL`.
- 2026-06-23 — **P1.2/P1.3/P1.6/P1.8** ✓ — Verified as already present in schema (checkbox ticked).

## How to resume (any machine)
1. `git pull`
2. Read this file → note **Next unchecked task**.
3. Open `PLAN.md`, find that task, re-read the named source files (don't trust stale context).
4. Implement + add/extend the Vitest test. Run `npm test`.
5. Tick the checkbox in `PLAN.md`, update **Next unchecked task** + **Progress log** here.
6. Commit `fix:`/`feat:` referencing the task id (e.g. `P0.1`).
