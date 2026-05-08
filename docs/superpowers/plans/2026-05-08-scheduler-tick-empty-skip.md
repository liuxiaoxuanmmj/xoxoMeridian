# Scheduler Tick "空走早退" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `schedulerTick()` short-circuit when there's nothing to do, dropping idle DB queries from 4 to 2; raise tick interval from 3s to 5s.

**Architecture:** Add two parallel `findFirst LIMIT 1` probes at the top of `schedulerTick`. If both return null, return early. Otherwise only run fireDue + scheduleNearTerm for the side that has work. Two new tests verify the spy/no-spy invariants. Tick interval constants are bumped at the same commit.

**Tech Stack:** TypeScript, Prisma, Vitest, Node.js (tsx in container).

**Spec:** `docs/superpowers/specs/2026-05-08-scheduler-tick-empty-skip-design.md`

---

## File Structure

| File | Role | Change |
|---|---|---|
| `agent/scheduler-tick.ts` | Worker scheduler orchestrator | Add early-exit branch in `schedulerTick` |
| `agent/agent-worker.ts` | Worker process entry | Bump tick interval constants |
| `tests/agent/scheduler-tick.test.ts` | Vitest suite (mock prisma) | Extend mock with `findFirst`; add 2 new tests |

No new files. No schema changes. No migrations.

---

## Task 1: Extend the prisma test mock with `findFirst`

**Why first:** The new tests assert that `findFirst` IS called (the probe) and `findMany` IS NOT called (idle path skips real work). The existing mock has no `findFirst` for `reminder` or `scheduledJob`. Both tests AND production code will start using it, so we add it to the mock first as a no-op-passing prerequisite.

**Files:**
- Modify: `tests/agent/scheduler-tick.test.ts:56-148`

- [ ] **Step 1: Read the current mock to confirm shape**

Run: `grep -n "findFirst\|findMany" tests/agent/scheduler-tick.test.ts`
Expected output: only existing `findMany` references for `reminder` and `scheduledJob`. No `findFirst`.

- [ ] **Step 2: Add `findFirst` to the `reminder` mock**

In `tests/agent/scheduler-tick.test.ts`, inside the `reminder:` block (around line 57-92), add this after the existing `findMany` definition:

```ts
    findFirst: vi.fn(async ({ where }: { where: any }) => {
      const row = reminders.find((r) => {
        if (where.status && r.status !== where.status) return false;
        return true;
      });
      return row ? { id: row.id } : null;
    }),
```

(Placement: just below the closing `}),` of `findMany`, before `findUnique`.)

- [ ] **Step 3: Add `findFirst` to the `scheduledJob` mock**

In the same file, inside the `scheduledJob:` block (around line 93-128), add this after its `findMany`:

```ts
    findFirst: vi.fn(async ({ where }: { where: any }) => {
      const row = jobs.find((j) => {
        if (where.enabled !== undefined && j.enabled !== where.enabled) return false;
        return true;
      });
      return row ? { id: row.id } : null;
    }),
```

- [ ] **Step 4: Run existing tests to confirm nothing broken**

Run: `npm test -- tests/agent/scheduler-tick.test.ts`
Expected: 9 passed (existing count). Mock additions are additive, shouldn't affect anything.

- [ ] **Step 5: Commit**

```bash
git add tests/agent/scheduler-tick.test.ts
git commit -m "$(cat <<'EOF'
test(scheduler): add findFirst to prisma mock for upcoming early-exit tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Write the two failing early-exit tests

**Files:**
- Modify: `tests/agent/scheduler-tick.test.ts` (append a new `describe` block at the end of the file, before the final closing of the last describe)

- [ ] **Step 1: Open the test file and locate the end of the last describe block**

Run: `tail -30 tests/agent/scheduler-tick.test.ts`
Expected: ends with the closing `});` of the `describe("schedulerTick - scheduled job CAS", ...)` or `describe("schedulerTick - near-term timers", ...)` block.

- [ ] **Step 2: Append the new describe block at the end of the file**

Add at the very bottom of `tests/agent/scheduler-tick.test.ts`:

```ts
describe("schedulerTick - empty-skip", () => {
  it("does not call findMany on either resource when both tables are empty", async () => {
    mockPrisma.reminder.findMany.mockClear();
    mockPrisma.scheduledJob.findMany.mockClear();
    mockPrisma.reminder.findFirst.mockClear();
    mockPrisma.scheduledJob.findFirst.mockClear();

    const result = await schedulerTick(new Date());

    expect(mockPrisma.reminder.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.scheduledJob.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.reminder.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.scheduledJob.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      reminders: { fired: 0, skipped: 0, failed: 0 },
      jobs: { fired: 0, skipped: 0, failed: 0 },
    });
  });

  it("skips scheduledJob queries when only reminders exist", async () => {
    // Future-dated reminder so it won't fire; we only care about query routing.
    reminders.push(makeReminder({ dueAt: new Date(Date.now() + 60 * 60 * 1000) }));

    mockPrisma.reminder.findMany.mockClear();
    mockPrisma.scheduledJob.findMany.mockClear();
    mockPrisma.reminder.findFirst.mockClear();
    mockPrisma.scheduledJob.findFirst.mockClear();

    await schedulerTick(new Date());

    expect(mockPrisma.reminder.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.scheduledJob.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.reminder.findMany).toHaveBeenCalled();
    expect(mockPrisma.scheduledJob.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the new tests, confirm both fail**

Run: `npm test -- tests/agent/scheduler-tick.test.ts -t "empty-skip"`

Expected: 2 FAIL.
- Test 1 fails because current `schedulerTick` calls `findMany` regardless (assertion `not.toHaveBeenCalled` fails).
- Test 2 fails for the same reason on `scheduledJob.findMany`.

If test 1 errors instead of failing assertions (e.g., `findFirst is not a function`), revisit Task 1.

- [ ] **Step 4: Run the full test file to make sure existing tests still pass**

Run: `npm test -- tests/agent/scheduler-tick.test.ts`
Expected: 9 pass + 2 fail = 11 total.

- [ ] **Step 5: Commit the failing tests (TDD red)**

```bash
git add tests/agent/scheduler-tick.test.ts
git commit -m "$(cat <<'EOF'
test(scheduler): add failing tests for empty-skip early exit

Asserts schedulerTick uses findFirst probes and skips findMany when the
corresponding resource table has nothing to act on.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement the early-exit in `schedulerTick`

**Files:**
- Modify: `agent/scheduler-tick.ts:30-37`

- [ ] **Step 1: Read the current `schedulerTick` implementation**

Run: `sed -n '30,37p' agent/scheduler-tick.ts`
Expected:
```ts
export async function schedulerTick(now = new Date()): Promise<SchedulerTickResult> {
  const [reminders, jobs] = await Promise.all([
    fireDueReminders(now),
    fireDueScheduledJobs(now),
  ]);
  await Promise.all([scheduleNearTermReminders(now), scheduleNearTermJobs(now)]);
  return { reminders, jobs };
}
```

- [ ] **Step 2: Replace the body with the early-exit version**

Use the Edit tool to replace lines 30-37 with this:

```ts
export async function schedulerTick(now = new Date()): Promise<SchedulerTickResult> {
  const empty = { fired: 0, skipped: 0, failed: 0 };

  const [hasReminder, hasJob] = await Promise.all([
    prisma.reminder.findFirst({ where: { status: "pending" }, select: { id: true } }),
    prisma.scheduledJob.findFirst({ where: { enabled: true }, select: { id: true } }),
  ]);

  if (!hasReminder && !hasJob) {
    return { reminders: { ...empty }, jobs: { ...empty } };
  }

  const reminderWork = hasReminder
    ? (async () => {
        const fired = await fireDueReminders(now);
        await scheduleNearTermReminders(now);
        return fired;
      })()
    : Promise.resolve({ ...empty });

  const jobWork = hasJob
    ? (async () => {
        const fired = await fireDueScheduledJobs(now);
        await scheduleNearTermJobs(now);
        return fired;
      })()
    : Promise.resolve({ ...empty });

  const [reminders, jobs] = await Promise.all([reminderWork, jobWork]);
  return { reminders, jobs };
}
```

- [ ] **Step 3: Run only the two new tests, confirm both pass**

Run: `npm test -- tests/agent/scheduler-tick.test.ts -t "empty-skip"`
Expected: 2 PASS.

- [ ] **Step 4: Run the full scheduler-tick test file**

Run: `npm test -- tests/agent/scheduler-tick.test.ts`
Expected: 11 PASS (9 prior + 2 new).

If any of the prior 9 fail, the most likely cause is that the `Promise.all` ordering changed and a race-test now sees serialized behavior. Inspect failing test name and either:
- (a) Adjust the test to inject the right ordering, or
- (b) If the failure is meaningful, raise it before continuing.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit (TDD green)**

```bash
git add agent/scheduler-tick.ts
git commit -m "$(cat <<'EOF'
feat(scheduler): early-exit schedulerTick when both resources empty

Adds two parallel findFirst probes at the top of schedulerTick. When
neither pending reminders nor enabled jobs exist, returns immediately
without touching findMany. When only one side has work, runs only that
side's fireDue + scheduleNearTerm. Idle worker DB queries: 4 -> 2.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Bump tick interval constants

**Files:**
- Modify: `agent/agent-worker.ts:5-6`

- [ ] **Step 1: Apply the constant changes**

Use the Edit tool to change `agent/agent-worker.ts`:

Replace:
```ts
const SCHEDULER_TICK_MS = 3_000;
const SCHEDULER_JITTER_MS = 500;
```

With:
```ts
const SCHEDULER_TICK_MS = 5_000;
const SCHEDULER_JITTER_MS = 1_000;
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all green. Should be the prior 37 + 2 new = 39 tests.

- [ ] **Step 4: Commit**

```bash
git add agent/agent-worker.ts
git commit -m "$(cat <<'EOF'
chore(scheduler): raise tick interval 3s -> 5s, jitter 500ms -> 1000ms

Combined with empty-skip early-exit (prior commit), idle worker now
wakes every ~5s and does 2 cheap findFirst probes per wake. Short-term
reminder polling deviation: <= 6s (still well under prior <= 12s; the
near-term setTimeout precision path remains unchanged).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Final verification

**Files:** none modified. Just confirms the integrated state.

- [ ] **Step 1: Confirm clean tree on the feature branch**

Run: `git status`
Expected: `nothing to commit, working tree clean` on `release/hardening`.

- [ ] **Step 2: Confirm the feature commits**

Run: `git log --oneline -6`
Expected: top of log shows the four new commits in this order (newest first):
1. `chore(scheduler): raise tick interval 3s -> 5s, jitter 500ms -> 1000ms`
2. `feat(scheduler): early-exit schedulerTick when both resources empty`
3. `test(scheduler): add failing tests for empty-skip early exit`
4. `test(scheduler): add findFirst to prisma mock for upcoming early-exit tests`

- [ ] **Step 3: Final test + typecheck**

Run these in parallel (two Bash calls):
- `npx tsc --noEmit` → 0 errors
- `npm test` → all 39 green

- [ ] **Step 4: (Optional, manual) Integration smoke**

This is for the user to run after restarting the worker container:
```
docker compose up -d agent-worker
docker logs -f xoxo-meridian-agent-worker
```
Expected: only the two startup banner lines (`[worker] dispatch loop started ...` and `[worker] scheduler loop started, tick ~5000ms`). No tick chatter when there are no reminders/jobs.

Then, in chat, ask the assistant `提醒我 8 秒后 ping 一下`. Watch:
- Reminder row created within ~1s.
- `scheduler.reminder.fired` event log appears within `due time + 6s` (typically <1s thanks to setTimeout precision path).

If the timing is outside ±6s, the cause is likely setTimeout pre-arming missed (look in `scheduleNearTermReminders` window).

---

## Self-Review Notes

Spec coverage check:
- Spec §Approach.1 (`SCHEDULER_TICK_MS=5_000`, `SCHEDULER_JITTER_MS=1_000`) → Task 4 ✓
- Spec §Approach.2 (`schedulerTick` top-level findFirst probes, conditional branching) → Task 3 ✓
- Spec §Approach.3 (tick entry stays silent — no change needed) → confirmed in Task 5 step 4 ✓
- Spec §Files Modified, tests row (2 new tests) → Task 2 ✓
- Spec §Verification 1-2 (typecheck, test green) → Task 5 ✓
- Spec §Verification 3 (integration smoke) → Task 5 step 4 (manual)
- Spec §Verification 4 (DB explain) → not in plan; out of scope for the implementation cycle (DB index existence already confirmed at spec time)

No placeholders, no "TBD", no "similar to Task N", every code step shows the actual code.

Type consistency: function name `schedulerTick`, return type `SchedulerTickResult`, both consistent across plan and existing source.
