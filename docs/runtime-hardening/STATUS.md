# Runtime Hardening — STATUS

> Update this file at the end of every working session. It is the resume pointer:
> an agent reads this first, then jumps to the named task in [`PLAN.md`](./PLAN.md).

**Current phase:** P0 — Workflow correctness (not yet started)
**Next unchecked task:** `P0.1` — AND-compose the Lead list `where` in `app/api/leads/route.ts` (+ enum validation, tests in `tests/podScoping.test.ts`).
**Blockers:** none.

## Decisions locked
- **Runtime:** Full BullMQ — separate always-on worker host + managed Redis (P10). Web stays on Vercel.
- **Scope:** Entire plan P0–P11.
- **Migrations/workers:** use `DIRECT_URL` (Neon HTTP driver has no interactive transactions).
- **Email live-send:** stays `EMAIL_SEND_DRY_RUN=true` until P4/P6 verified.

## Progress log
- 2026-06-23 — Plan authored, verified against codebase, committed. Pinned as primary flow in `CLAUDE.md` / `AGENTS.md` / `.claude/rules/runtime-hardening.md`. No app code changed yet.

## How to resume (any machine)
1. `git pull`
2. Read this file → note **Next unchecked task**.
3. Open `PLAN.md`, find that task, re-read the named source files (don't trust stale context).
4. Implement + add/extend the Vitest test. Run `npm test`.
5. Tick the checkbox in `PLAN.md`, update **Next unchecked task** + **Progress log** here.
6. Commit `fix:`/`feat:` referencing the task id (e.g. `P0.1`).
