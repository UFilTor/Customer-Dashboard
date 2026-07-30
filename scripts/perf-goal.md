# Perf optimization loop: instructions and end goal

Goal: get dashboard cold-load and filter-switch times under the targets below,
measured with `bash scripts/perf-check.sh` against the local dev server.

## Targets (cold cache, dev server on :3001)

| Metric                          | Baseline (2026-07-30) | Target   |
|---------------------------------|------------------------|----------|
| Status `/api/attention`         | 13.2-18.2s             | < 5000ms |
| Pay Migration `/api/pay-migration` | 2.8-9.1s            | < 4000ms |
| Onboarding `/api/onboarding`    | 2.8-5.1s               | < 3000ms |
| Filter switch (per-owner keys)  | 1.1-2.6s               | < 1500ms |
| Warm repeat (any route)         | ~5ms                   | < 100ms  |

Correctness is part of the goal: payload shape and record counts must not
change. Faster-but-wrong does not count.

## Each iteration

1. Ensure the dev server is running on :3001 (`PORT=3001 npm run dev` in
   background; port 3000 is occupied by another app). A fresh process means
   an empty in-memory cache, which is exactly the cold state we measure.
2. Run `bash scripts/perf-check.sh` and append the results to
   `scripts/perf-log.md` with a timestamp and a note of what changed since
   the last run.
3. Evaluate against the targets:
   - All targets met in 2 consecutive cold runs -> STOP the loop, write a
     final summary at the top of perf-log.md, and report.
   - Otherwise continue to step 4.
4. Profile the slowest failing route: add temporary timing logs around the
   HubSpot calls in the relevant `src/lib/*.ts` builder to find which fetches
   dominate. Remove temporary logs before finishing the iteration.
5. Apply ONE optimization per iteration, so regressions are traceable.
   Preferred techniques (see AGENTS.md for prior art):
   - Replace `/crm/v3/objects/deals/search` with
     `crm/v4/associations/.../batch/read` (past wins: 27s -> 0.6s).
   - Parallelize independent batch loops with `Promise.all`.
   - Overlap dependent fetches by chaining promises instead of awaiting
     blocks sequentially (see `buildOnboardingPayload` notes).
   - Trim over-fetched properties from search/batch requests.
   - Pre-warm per-owner filter cache keys in the background after the
     unfiltered payload builds.
6. Verify before counting the result: `npm run build` passes, `npx vitest`
   passes, and the route's JSON has the same shape and plausible counts as
   before (diff a saved sample if in doubt).
7. Restart the dev server after code changes, then re-measure (back to
   step 2).

## Hard rules

- Never commit, push, or deploy. Filip reviews on localhost first.
- One optimization per iteration. If a change makes things slower or breaks
  the payload, revert it and log why.
- Follow existing retry/pagination rules: always pass `sorts` to search
  endpoints, retry 429/5xx (see `searchDealsPage` in
  `src/lib/pay-migration.ts`).
- Do not weaken correctness to hit a number (no dropping records, no
  shrinking date windows, no skipping owners).

## Stop conditions

Stop the loop and summarize when ANY of these is true:

1. All targets met in 2 consecutive cold runs (success).
2. HubSpot latency floor reached: profiling shows the remaining time is
   dominated by unavoidable sequential HubSpot round-trips and the last two
   optimization attempts yielded < 10% improvement. Report the floor and the
   best achieved numbers.
3. 8 iterations completed without reaching targets. Summarize progress and
   what remains, so Filip can decide whether to continue.
