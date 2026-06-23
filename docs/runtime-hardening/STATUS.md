# Runtime Hardening — STATUS

> Update this file at the end of every working session. It is the resume pointer:
> an agent reads this first, then jumps to the named task in [`PLAN.md`](./PLAN.md).

**Current phase:** P1 — Schema hardening (in progress)
**Next unchecked task:** `P1.0` — Reconcile drift: migrate already-in-schema `Tenant`/`tenantId`/`AiMemory`; seed `upsert`s default tenant **first**.
**Blockers:** none.

## Decisions locked
- **Runtime:** Full BullMQ — separate always-on worker host + managed Redis (P10). Web stays on Vercel.
- **Scope:** Entire plan P0–P11.
- **Migrations/workers:** use `DIRECT_URL` (Neon HTTP driver has no interactive transactions).
- **Email live-send:** stays `EMAIL_SEND_DRY_RUN=true` until P4/P6 verified.

## Progress log
- 2026-06-23 — Plan authored, verified against codebase, committed. Pinned as primary flow in `CLAUDE.md` / `AGENTS.md` / `.claude/rules/runtime-hardening.md`. No app code changed yet.
- 2026-06-23 — P0.1: Lead list AND-compose fix already applied to codebase (found during verification). No additional changes needed.
- 2026-06-23 — P0.2–P0.11: Completed entire workflow correctness phase. Added timezone boundary helper, lead access validations, soft archiving on delete, task completion CAS, and Topbar role fencing. Verified with passing Vitest tests.
- 2026-06-23 — P2: BullMQ foundation built. Installed `bullmq` + `ioredis`. Created `lib/bullmq/{connection,types,queues,jobOptions,enqueue,events,index}.ts`. Created `workers/{index,healthcheck}.ts`. Created `scripts/{worker-dev,worker-start}.cjs`. Updated `package.json` scripts + `.env.example` with `REDIS_URL`.

## How to resume (any machine)
1. `git pull`
2. Read this file → note **Next unchecked task**.
3. Open `PLAN.md`, find that task, re-read the named source files (don't trust stale context).
4. Implement + add/extend the Vitest test. Run `npm test`.
5. Tick the checkbox in `PLAN.md`, update **Next unchecked task** + **Progress log** here.
6. Commit `fix:`/`feat:` referencing the task id (e.g. `P0.1`).
