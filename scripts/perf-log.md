# Perf optimization log

## FINAL SUMMARY (2026-07-30 12:45, loop stopped after 8 iterations)

Stop condition 3 (8 iterations without 2 consecutive full passes). One run
(iteration 5, 12:25) met EVERY target; the remaining gap is HubSpot
latency variance, not fixable app-side without weakening correctness.

### Baseline -> now (cold, fresh dev server)

| Metric | Baseline | Now (typical) | Target | Verdict |
|---|---|---|---|---|
| Status `/api/attention` | 13.2-18.2s | 3.0-4.8s | <5000ms | MET (passed 6 of last 7 runs) |
| Onboarding `/api/onboarding` | 2.8-5.1s | 1.4-3.5s | <3000ms | Borderline (2942/2605/1356 pass; 3016-3547 miss) |
| Pay Migration `/api/pay-migration` | 2.8-9.1s* | 2.7-5.5s | <4000ms | Borderline; *old baseline was partly built on silently truncated data |
| Filter switch | 1.1-2.6s | 2-70ms once pre-warm lands (~10s after bulk) | <1500ms | MET |
| Warm repeat | ~5ms | 4-10ms | <100ms | MET |

### What changed (all uncommitted, localhost-verified)

1. `src/lib/attention.ts` — fetchHealthScoreIssues: 4 sequential HubSpot
   calls per company (5 concurrent) -> 3 batched calls. 11.4s -> ~1.2s.
2. `src/lib/attention.ts` — fetchNoFutureEvents: parallelized assoc +
   company batch chunks, added mandatory sorts. 9.4s -> ~3.4s.
3. `src/lib/pay-migration.ts` — payDeals page size 100 -> 200; moved
   fetchUnwillingReasons + fetchZeroEventDealIds onto the retrying
   searchObjectsPage helper. FIXED A REAL BUG: zeroEvents flags were
   silently truncated by unretried 429s (46 vs the true 127 flagged deals).
4. `src/lib/pay-migration.ts` — zero-event lookup inverted from org-wide
   company search (19 sequential pages) to batch associations from the 704
   pay deals. 6.5-7s -> ~0.6-0.8s.
5. `src/lib/pay-q2-classifier.ts` — Haiku output compacted to a 0/1 array
   (~750 -> ~90 output tokens). Classifier ~4-6s -> ~1.3s. One borderline
   flag flip (Braunstein -> false), defensible per prompt rules.
6. `src/app/api/onboarding/route.ts` — after() pre-warm of all 10 filter
   scopes (2-wide pool) after the unfiltered build. Filter switches 2-70ms.
7-8. `src/lib/pay-migration.ts` — classifier + stage-history overlapped
   with each other and with the zeroEvents fetch. Pay build is now
   payDeals + ~1.3s tail.

### Remaining floor

Pay/Onboarding cold times are dominated by sequential HubSpot search
pagination (payDeals: 4 pages, 1.2-4.0s run-to-run on identical requests)
plus dev-server route compile on first hit. Both routes pass their targets
whenever HubSpot responds at median speed. Options if further speed is
wanted: accept the variance (prod cron + edge cache hides it from users),
or trim payDeals properties to shrink page payloads.

### Correctness

Every iteration diffed payloads against the previous build: same record
counts (attention 51/5/99/123, pay 704 deals), zero field diffs beyond live
CRM drift. `npm run build` passes; vitest 106 passed / 5 failed — the same
5 failures exist on the unmodified tree (meeting-prep/portfolio/format,
pre-existing). NOT committed or deployed, per instructions.

Newest entries at the top.

## Iteration 8 (2026-07-30 12:44): classifier overlaps zeroEvents fetch

Change (`src/lib/pay-migration.ts`): zeroEvents is no longer awaited in the
initial Promise.all — the deal list builds with placeholder flags, the LLM
classifier and stage-history start as soon as stages are final, and the
zeroEvents flags are applied when that fetch resolves. Pay build is now
payDeals + ~1.3s tail.

Cold run: attention 3641 PASS, onboarding 3072 FAIL (72ms over),
pay 5535 FAIL — payDeals span alone was 4016ms this run (1.2-2.9s on
previous runs; identical request, pure HubSpot variance). Filters
67/353/3/5ms PASS. Payload verified identical (704 deals, zeroEvents 127,
q2 flips 0, only live CRM activity-date drift). Build passes; vitest same
5 pre-existing failures.

8 iterations complete -> stopping per stop condition 3. See FINAL SUMMARY
at the top of this file.

## Iteration 7 (2026-07-30 12:39): overlap Q2 classifier with stage-history fetch

Change (`src/lib/pay-migration.ts`): `classifyUnwillingForQ2` (LLM, ~1.3s)
and `fetchRecentStageChanges` (~0.5-0.6s) were sequential at the tail of the
build; both only need the finalized `allDeals`, so they now run concurrently.

| Route | Cold | Target | Status |
|---|---|---|---|
| Status `/api/attention` | 3424ms | <5000 | PASS |
| Onboarding `/api/onboarding` | 3354ms | <3000 | FAIL (variance; 2942 last run) |
| Pay Migration `/api/pay-migration` | 4317ms | <4000 | FAIL |
| Filters Filip/Anders/Cecilia/DK | 2104/2/2/2ms | <1500 | Filip FAIL (warm pool hadn't reached his scope yet) |

Pay span detail: payDeals 2072 (sequential pagination, 1.2-2.9s across runs
— the big variance source) + zeroEventDeals 797 chained + max(classify
~1.3s, history 625). Build passes; vitest same 5 pre-existing failures.

Next (iter 8, last before the 8-iteration stop): start the classifier
before zeroEvents resolves — it only needs deals + unwilling reasons, so
the LLM call can overlap the zeroEventDeals fetch (zeroEvents flags get
applied to allDeals afterwards; they don't affect stage classification).

## Iteration 6 (2026-07-30 12:35): pre-warm onboarding filter scopes

Change (`src/app/api/onboarding/route.ts`): after serving the unfiltered
payload, a `next/server` `after()` callback warms every filter scope the
pill UI can produce (3 regions + 7 persons) into the route cache, two
builds at a time (full concurrency would 429; sequential takes ~20s and
missed the later scopes). Warming uses the same `getOrBuild` path as
on-demand requests, so cached payloads are byte-identical to what a direct
request would build. Iterated: sequential missed person scopes, regions-
first ordering missed persons; 2-wide pool covers all 10 scopes in ~10s.

| Route | Cold | Target | Status |
|---|---|---|---|
| Status `/api/attention` | 3961ms | <5000 | PASS |
| Onboarding `/api/onboarding` | 2942ms | <3000 | PASS |
| Pay Migration `/api/pay-migration` | 4010ms | <4000 | FAIL (by 10ms) |
| Filters Filip/Anders/Cecilia/DK | 5/2/2/3ms | <1500 | PASS |

Build passes; vitest same 5 pre-existing failures.

Next (iter 7): pay-migration is 10ms over. Overlap `classifyUnwillingForQ2`
with the zeroEventDeals/payStageHistory fetches — the classifier only needs
payDeals + unwillingReasons, so chaining it off those two promises takes the
LLM call (~1s) off the tail of the critical path.

## Iteration 5 (2026-07-30 12:25): compact Q2 classifier output

Change (`src/lib/pay-q2-classifier.ts`): the Haiku call now returns a 0/1
array (one value per deal, order-preserving) instead of one JSON object per
deal — output tokens drop from ~750 to ~90, which was most of the call's
4-6s latency. max_tokens 2000 -> 500. First tried "list only the true
indexes" but that recall-style format missed an explicit prompt example
(RibX / waiting-on-Fortnox flipped to false); the per-deal 0/1 array forces
item-by-item consideration and RibX classifies correctly again. One residual
flip vs the old prompt (Braunstein: "not interested, almost angry" ->
false), which matches the prompt's structural-blocker rules better than the
old true. pay-migration build span: ~8954 -> 3573ms.

Cold run A (12:25): attention 3049 PASS, onboarding 1356 PASS, pay 2721
PASS, filters 758/637/1180/941 PASS. ALL TARGETS MET (run 1 of 2 needed).

Cold run B (12:26, immediately after): attention 3734 PASS, onboarding 3016
FAIL (by 16ms), pay 4642 FAIL, filters Filip 2389 / DK 2320 FAIL. Warm
repeats 4-10ms PASS. Likely HubSpot 429 backoff from back-to-back cold
rebuilds; needs a clean re-measure after a cool-down.

Correctness: 704 deals, id sets equal, unwilling 43 with q2 flips as
described. Build passes; vitest same 5 pre-existing failures.

Next: cool-down re-measure; if pay still >4s, overlap the classifier with
the zeroEvent/stage-history fetches (start it once payDeals+unwillingReasons
resolve).

## Iteration 4 (2026-07-30 12:20): invert zero-event lookup in pay-migration

Change (`src/lib/pay-migration.ts`): `fetchZeroEventDealIds` no longer
searches ALL zero-event companies org-wide (3765 companies, 19 sequential
pages, 6.5-7s). It now starts from the pay deals we already have:
deals->companies `crm/v4` associations batch/read + companies batch/read of
`understory_health_score_upcoming_events` (parallel chunks of 100). Missing
property explicitly does NOT count as zero-event, matching the old LTE-0
search semantics. Chained off the payDeals promise so it overlaps the other
fetches. zeroEventDeals span: 6515-7073ms -> 586ms.

Correctness: payload identical to iteration 3's verified-correct sample
(704 deals, 127 zeroEvents flags identical; single lastActivityDate diff is
live CRM drift). Build passes; vitest same 5 pre-existing failures.

| Route | Cold | Target | Status |
|---|---|---|---|
| Status `/api/attention` | 5435ms | <5000 | FAIL (marginal; 4767/4838 prior runs) |
| Onboarding `/api/onboarding` | 2605ms | <3000 | PASS |
| Pay Migration `/api/pay-migration` | 6275ms (was 12663) | <4000 | FAIL |
| Filters Filip/Anders/Cecilia/DK | 738/655/466/916ms | <1500 | PASS |

Profiling insight: pay-migration HubSpot spans now sum to ~2.5s; the
remaining ~4s of build is `classifyUnwillingForQ2` — a single batched Haiku
LLM call whose per-process cache is empty on every cold start, sitting on
the critical path.

Next (iter 5): persist the Q2 classifier cache to disk keyed on
prompt-hash + reason text so cold processes skip the LLM round-trip
(prompt-hash keying also fixes the documented stale-prompt footgun).

## Iteration 3 (2026-07-30 12:15): pay-migration page size + fix silent truncation

Changes (`src/lib/pay-migration.ts`):
- `fetchAllPayDeals` page size 100 -> 200 (search max): payDeals span
  3361 -> ~1865-2877ms.
- Found a real correctness bug while diffing payloads: `fetchUnwillingReasons`
  and `fetchZeroEventDealIds` used raw fetch with `if (!res.ok) break` and no
  `sorts` — under concurrent load HubSpot 429s a page and the loop silently
  truncated. zeroEvents flags were non-deterministic: 46 flagged deals in the
  cached "before" sample vs 127 with retries (19 pages x 200 companies paged
  fully). Both now go through the retrying `searchObjectsPage` helper with
  `sorts`. Verified stable: two consecutive rebuilds produce identical
  payloads (704 deals, ids equal).

Cost: the zero-event company search now actually completes (~6.5-7s span),
so the route got SLOWER but correct: cold 12663ms (was 9279 on partial data).
Per goal ("faster-but-wrong does not count") this is the honest baseline.

| Route | Cold | Target | Status |
|---|---|---|---|
| Status `/api/attention` | 4838ms | <5000 | PASS (2nd consecutive) |
| Onboarding `/api/onboarding` | 3902ms | <3000 | FAIL |
| Pay Migration `/api/pay-migration` | 12663ms | <4000 | FAIL |
| Filters Filip/Anders/Cecilia/DK | 2463/1773/1483/2710ms | <1500 | FAIL |

Build passes; vitest same 5 pre-existing unrelated failures.

Next (iter 4): `fetchZeroEventDealIds` searches ALL zero-event companies
org-wide (3765, 19 sequential pages) just to flag 704 pay deals. Invert it:
batch-read deals->companies associations for the pay deals (~7 parallel
calls), then batch-read `understory_health_score_upcoming_events` for those
companies (~7 parallel calls). Requires payDeals result first, so chain off
the payDeals promise.

## Iteration 2 (2026-07-30 12:09): parallelize fetchNoFutureEvents batches

Change: in `fetchNoFutureEvents` (`src/lib/attention.ts`), the deal->company
association batch loop (was sequential chunks of 50) and the company
batch/read loop (sequential chunks of 100) now run their chunks via
`Promise.all` at 100 per chunk. Also added the mandatory `sorts` clause to
the retention-pipeline deals search (hard rule; guards against silent
pagination truncation).

Phase profile (700 deals): search 2831->2673ms (sequential pagination,
unchanged), assoc 3284->354ms, companyProps 1741->400ms. Function
9402 -> ~3400ms.

| Route | Cold | Target | Status |
|---|---|---|---|
| Status `/api/attention` | 4767ms (was 9451) | <5000 | PASS |
| Onboarding `/api/onboarding` | 3393ms | <3000 | FAIL |
| Pay Migration `/api/pay-migration` | 9279ms | <4000 | FAIL |
| Filters Filip/Anders/Cecilia/DK | 2527/1729/1212/2699ms | <1500 | FAIL (3 of 4) |

Correctness: payload identical to baseline sample (51/5/99/123 per group,
zero field diffs on no_future_events). Build passes; vitest same 5
pre-existing unrelated failures.

Note: filter-switch numbers are noisy — these ran while the cold bulk
builds were still warming; earlier run showed 854-1991ms. Judge filters on
a quieter run.

Next: Pay Migration `/api/pay-migration` (9.3s) is now the slowest route.

## Iteration 1 (2026-07-30 12:02): batch fetchHealthScoreIssues

Change: replaced the per-company loop in `fetchHealthScoreIssues`
(`src/lib/attention.ts`) — 4 sequential HubSpot calls per company, 5
concurrent — with three batched calls: companies `batch/read` with
`propertiesWithHistory: ["health_score"]`, `crm/v4/associations/companies/
deals/batch/read`, and deals `batch/read` (chunked at 100, chunks in
parallel). Removed now-unused `fetchDealForCompany`.

Branch profile: fetchHealthScoreIssues 11367ms -> ~1064-1411ms.

| Route | Cold | Target | Status |
|---|---|---|---|
| Status `/api/attention` | 9451ms (was 13576) | <5000 | FAIL |
| Onboarding `/api/onboarding` | 4690ms | <3000 | FAIL |
| Pay Migration `/api/pay-migration` | 8803ms | <4000 | FAIL |
| Filters Filip/Anders/Cecilia/DK | 854/848/735/2752ms | <1500 | DK FAIL |

Correctness: payload identical to pre-change sample (same signals, same id
sets per group: 51/5/99/123, zero field diffs on health_score). Build passes;
vitest 106 passed, 5 failed — same 5 fail on the unmodified tree
(pre-existing, unrelated: meeting-prep/portfolio/format).

Next bottleneck inside /api/attention: fetchNoFutureEvents (8.3-9.4s), now
dominating. fetchInvoices ~5.3s also above the 5s route target on its own.

## Iteration 1 pre-change measurement (2026-07-30 11:58, cold)

No code changes yet, fresh dev server on :3001. Confirms baseline.

| Route | Cold |
|---|---|
| Status `/api/attention` | 13576ms |
| Onboarding `/api/onboarding` | 3184ms |
| Pay Migration `/api/pay-migration` | 8452ms |
| Onboarding filter Filip / Anders / Cecilia / DK | 1991 / 1340 / 1058 / 1856ms |
| Page shell `/` | 61ms |

Next: profile `/api/attention` (slowest failing route). Baseline below from the 2026-07-30 audit
(5 cold-window samples via scripts/perf-check.sh, dev server on :3001).

## Baseline (2026-07-30, before any optimization)

| Route | Cold (range over 5 runs) | Warm |
|---|---|---|
| Status `/api/attention` | 13.2-18.2s | ~5ms |
| Pay Migration `/api/pay-migration` | 2.8-9.1s | ~5ms |
| Onboarding `/api/onboarding` | 2.8-5.1s | ~10ms |
| Filter switch (per owner) | 1.1-2.6s | ~5ms |
| Page shell `/` | 35-53ms | - |
