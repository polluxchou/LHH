# Storyboard Voice-Over Derived From Script — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the script the single source of truth for storyboard voice-over — the storyboard `voiceOver` column becomes a read-only value derived from `script.sections`, so it can never drift.

**Architecture:** A pure function `deriveVoiceOvers(script, shots, noneLabel)` splits the concatenated script sentences across the non-silent shots in order, proportional to each shot's time duration, snapping at sentence boundaries. A `silent` flag marks no-voice shots (title/transition cards). A reducer helper `recomputeStoryboardVoiceOvers` re-runs derivation whenever the script or the silent set changes (generation, script edit, shot edit). The UI renders `voiceOver` read-only and exposes a silent toggle.

**Tech Stack:** TypeScript, React 19 / Next 15, Vitest. No new deps.

Spec: `docs/superpowers/specs/2026-06-17-storyboard-voiceover-derive-from-script-design.md`

**Isolation:** Implement in a dedicated git worktree branched from `main` (this repo's working tree is shared by other sessions on a different branch). Create it via `superpowers:using-git-worktrees` at execution start. Open a PR at the end.

---

### Task 1: Add `silent` to the StoryboardShot domain type

**Files:**
- Modify: `lib/domain/production.ts` (the `StoryboardShot` interface)

- [ ] **Step 1: Add the field**

In `lib/domain/production.ts`, change `StoryboardShot` to:

```ts
export interface StoryboardShot {
  n: number;
  time: string;
  shot: string;
  /** Derived cache of the script narration for this shot. Read-only in the UI;
   *  always (re)written by deriveVoiceOvers. */
  voiceOver: string;
  visual: string;
  notes: string;
  /** No-voice shot (title / transition card). Defaults to false. */
  silent?: boolean;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (optional field is backward compatible).

- [ ] **Step 3: Commit**

```bash
git add lib/domain/production.ts
git commit -m "feat(production): add silent flag to StoryboardShot"
```

---

### Task 2: Pure `deriveVoiceOvers` function (TDD)

**Files:**
- Create: `lib/production/derive-voiceovers.ts`
- Test: `tests/production/derive-voiceovers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/production/derive-voiceovers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveVoiceOvers, splitSentences } from "@/lib/production/derive-voiceovers";
import type { ProductionScript, StoryboardShot } from "@/lib/domain/production";

const NONE = "（无）";

function script(...bodies: string[]): ProductionScript {
  return {
    targetDuration: "1 min",
    wordCount: bodies.join("").length,
    sections: bodies.map((body, i) => ({ id: `s${i}`, label: `L${i}`, duration: "", body })),
  };
}

function shot(n: number, time: string, silent = false): StoryboardShot {
  return { n, time, shot: "x", voiceOver: "OLD", visual: "v", notes: "", silent };
}

describe("splitSentences", () => {
  it("splits on Chinese terminators and keeps them", () => {
    expect(splitSentences("甲。乙！丙？")).toEqual(["甲。", "乙！", "丙？"]);
  });
  it("returns [] for empty/whitespace", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("deriveVoiceOvers", () => {
  it("concatenation of assigned chunks equals the script", () => {
    const sc = script("甲。乙。", "丙。丁。");
    const shots = [shot(1, "0:00-0:06", true), shot(2, "0:06-0:12"), shot(3, "0:12-0:24")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    const assigned = out.filter((v) => v !== NONE).join("");
    expect(assigned).toBe("甲。乙。丙。丁。");
  });

  it("silent shots get the none label and no text", () => {
    const sc = script("甲。乙。");
    const shots = [shot(1, "0:00-0:06", true), shot(2, "0:06-0:12")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    expect(out[0]).toBe(NONE);
    expect(out[1]).toBe("甲。乙。");
  });

  it("longer shots get more sentences (time-proportional)", () => {
    const sc = script("甲。乙。丙。丁。");
    // shot A short (4s), shot B long (20s)
    const shots = [shot(1, "0:00-0:04"), shot(2, "0:04-0:24")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    expect(out[0].length).toBeLessThan(out[1].length);
    expect(out.join("")).toBe("甲。乙。丙。丁。");
  });

  it("never cuts mid-sentence", () => {
    const sc = script("这是一句很长的话。短。");
    const shots = [shot(1, "0:00-0:01"), shot(2, "0:01-0:30")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    for (const v of out) {
      if (v !== NONE && v !== "") expect(/[。！？；\n]$/.test(v)).toBe(true);
    }
  });

  it("more non-silent shots than sentences: extra shots get none label", () => {
    const sc = script("只有一句。");
    const shots = [shot(1, "0:00-0:06"), shot(2, "0:06-0:12"), shot(3, "0:12-0:18")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    expect(out.filter((v) => v !== NONE).join("")).toBe("只有一句。");
    expect(out.filter((v) => v === NONE).length).toBe(2);
  });

  it("empty script: all shots get none label", () => {
    const out = deriveVoiceOvers(script(""), [shot(1, "0:00-0:06"), shot(2, "0:06-0:12")], NONE);
    expect(out).toEqual([NONE, NONE]);
  });

  it("unparseable times fall back to equal weight", () => {
    const sc = script("甲。乙。丙。丁。");
    const shots = [shot(1, "??"), shot(2, "??")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    expect(out.join("")).toBe("甲。乙。丙。丁。");
    expect(out[0]).not.toBe(NONE);
    expect(out[1]).not.toBe(NONE);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/production/derive-voiceovers.test.ts`
Expected: FAIL — `deriveVoiceOvers`/`splitSentences` not found.

- [ ] **Step 3: Implement**

Create `lib/production/derive-voiceovers.ts`:

```ts
import type { ProductionScript, StoryboardShot } from "@/lib/domain/production";

/** Split Chinese/мixed prose into sentences, keeping terminators (。！？； and newlines). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if (/[。！？；\n]/.test(ch)) {
      const t = buf.trim();
      if (t) out.push(t);
      buf = "";
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/** Parse "m:ss-m:ss" (hyphen or en-dash) into duration seconds; null if unparseable. */
function durationSeconds(time: string): number | null {
  const m = time.match(/(\d+):(\d{1,2})\s*[-–~]\s*(\d+):(\d{1,2})/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  const d = end - start;
  return d > 0 ? d : null;
}

/**
 * Derive each shot's voice-over from the script. Returns one string per shot,
 * aligned to `shots` order. Non-silent shots receive a contiguous run of script
 * sentences, distributed in order proportional to each shot's time duration.
 * Silent shots — and non-silent shots that get no text — return `noneLabel`.
 *
 * Invariant: concatenation of returned non-`noneLabel` chunks === concatenation
 * of script section bodies (split/rejoined at sentence boundaries).
 */
export function deriveVoiceOvers(
  script: ProductionScript,
  shots: StoryboardShot[],
  noneLabel: string,
): string[] {
  const sentences = splitSentences(script.sections.map((s) => s.body).join(""));
  const nonSilentIdx = shots.map((s, i) => ({ s, i })).filter(({ s }) => !s.silent);

  const result = shots.map(() => noneLabel);
  if (sentences.length === 0 || nonSilentIdx.length === 0) return result;

  const weights = nonSilentIdx.map(({ s }) => durationSeconds(s.time) ?? 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || nonSilentIdx.length;
  const totalChars = sentences.reduce((a, s) => a + s.length, 0);

  let cursor = 0; // index into sentences
  for (let k = 0; k < nonSilentIdx.length; k++) {
    const { i } = nonSilentIdx[k];
    if (cursor >= sentences.length) {
      result[i] = noneLabel; // ran out of sentences
      continue;
    }
    if (k === nonSilentIdx.length - 1) {
      // last non-silent shot collects the remainder
      result[i] = sentences.slice(cursor).join("");
      cursor = sentences.length;
      continue;
    }
    const target = Math.round((totalChars * weights[k]) / totalWeight);
    let taken = "";
    // always take at least one sentence; keep taking while under target and
    // sentences remain for the shots after this one
    do {
      taken += sentences[cursor];
      cursor++;
    } while (
      cursor < sentences.length &&
      taken.length < target &&
      sentences.length - cursor > nonSilentIdx.length - 1 - k
    );
    result[i] = taken;
  }
  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/production/derive-voiceovers.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/production/derive-voiceovers.ts tests/production/derive-voiceovers.test.ts
git commit -m "feat(production): deriveVoiceOvers — split script across shots by duration"
```

---

### Task 3: Recompute helper + wire into reducers (TDD)

**Files:**
- Modify: `lib/workflow/local-workflow.ts` (add helper; change `updateScriptSection`, `updateStoryboardShot`)
- Test: `tests/production/local-workflow-production.test.ts` (add cases)

- [ ] **Step 1: Write the failing test**

Append to `tests/production/local-workflow-production.test.ts` (reuse its existing setup helpers; if it builds state via `createInitialWorkflowState`, follow that). Add:

```ts
import { deriveVoiceOvers } from "@/lib/production/derive-voiceovers";
// (existing imports already include updateScriptSection / updateStoryboardShot / ensureProductionDraft)

describe("storyboard voice-over stays derived from script", () => {
  // briefId that has a production draft in the test fixture; reuse the id the
  // existing tests in this file use (e.g. "b-cna-01").
  const briefId = "b-cna-01";

  it("editing a script section recomputes storyboard voiceOver", () => {
    let st = ensureProductionDraft(createInitialWorkflowState(), briefId);
    const firstSectionId = st.productionDrafts[briefId].script.sections[0].id;
    st = updateScriptSection(st, briefId, firstSectionId, "全新的一句话。第二句。");
    const draft = st.productionDrafts[briefId];
    const expected = deriveVoiceOvers(draft.script, draft.storyboard, "（无）");
    expect(draft.storyboard.map((s) => s.voiceOver)).toEqual(expected);
  });

  it("toggling silent recomputes, and voiceOver patch is ignored", () => {
    let st = ensureProductionDraft(createInitialWorkflowState(), briefId);
    const n = st.productionDrafts[briefId].storyboard[0].n;
    st = updateStoryboardShot(st, briefId, n, { silent: true, voiceOver: "HACK" });
    const draft = st.productionDrafts[briefId];
    expect(draft.storyboard.find((s) => s.n === n)!.silent).toBe(true);
    // voiceOver came from derivation, NOT the patch
    const expected = deriveVoiceOvers(draft.script, draft.storyboard, "（无）");
    expect(draft.storyboard.map((s) => s.voiceOver)).toEqual(expected);
    expect(draft.storyboard.find((s) => s.n === n)!.voiceOver).not.toBe("HACK");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/production/local-workflow-production.test.ts`
Expected: FAIL (voiceOver not recomputed; patch with voiceOver currently applied).

- [ ] **Step 3: Implement the helper + rewire**

In `lib/workflow/local-workflow.ts`:

Add import near the other production imports:

```ts
import { deriveVoiceOvers } from "@/lib/production/derive-voiceovers";
```

Add this helper (place it just above `updateScriptSection`):

```ts
/** Storyboard voice-over is always derived from the script (single source of truth). */
const VOICE_OVER_NONE = "（无）";
function recomputeStoryboardVoiceOvers(draft: ProductionPackage): ProductionPackage {
  const derived = deriveVoiceOvers(draft.script, draft.storyboard, VOICE_OVER_NONE);
  return {
    ...draft,
    storyboard: draft.storyboard.map((shot, i) => ({ ...shot, voiceOver: derived[i] })),
  };
}
```

Change `updateScriptSection`'s return to recompute:

```ts
export function updateScriptSection(
  state: LocalWorkflowState,
  briefId: string,
  sectionId: string,
  body: string,
): LocalWorkflowState {
  const draft = assertProductionDraftExists(state, briefId);
  const next = recomputeStoryboardVoiceOvers({
    ...draft,
    script: {
      ...draft.script,
      sections: draft.script.sections.map((section) => (section.id === sectionId ? { ...section, body } : section)),
    },
  });
  return withProductionDraft(state, briefId, next);
}
```

Change `updateStoryboardShot` to drop any `voiceOver` from the patch and recompute:

```ts
export function updateStoryboardShot(
  state: LocalWorkflowState,
  briefId: string,
  shotNumber: number,
  patch: Partial<Omit<StoryboardShot, "n">>,
): LocalWorkflowState {
  const draft = assertProductionDraftExists(state, briefId);
  // voiceOver is derived, never written from a shot patch.
  const { voiceOver: _ignored, ...safe } = patch;
  const next = recomputeStoryboardVoiceOvers({
    ...draft,
    storyboard: draft.storyboard.map((shot) => (shot.n === shotNumber ? { ...shot, ...safe } : shot)),
  });
  return withProductionDraft(state, briefId, next);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/production/local-workflow-production.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/workflow/local-workflow.ts tests/production/local-workflow-production.test.ts
git commit -m "feat(production): recompute storyboard voiceOver on script/silent change"
```

---

### Task 4: Mark silent + derive at generation time (TDD)

**Files:**
- Modify: `lib/production/deepseek-script.ts` (in `generateProduction`, after `parseProduction`)
- Test: `tests/production/deepseek-script.test.ts` (add a case)

- [ ] **Step 1: Write the failing test**

Append to `tests/production/deepseek-script.test.ts` (it already imports `generateProduction` and stubs `deps.complete`; follow its existing pattern for the brief/topicCard fixtures and the deps stub):

```ts
it("marks （无） shots silent and derives voiceOver from the script", async () => {
  const fake = {
    sections: [
      { id: "hook", label: "开场 · 钩子", duration: "0:00–0:12", body: "甲。乙。" },
      { id: "context", label: "背景", duration: "0:12–0:24", body: "丙。" },
      { id: "core", label: "核心 · 为什么重要", duration: "0:24–0:48", body: "丁。" },
      { id: "close", label: "收束", duration: "0:48–1:00", body: "戊。" },
    ],
    storyboard: [
      { n: 1, time: "0:00-0:06", shot: "标题卡", voiceOver: "（无）", visual: "v", notes: "" },
      { n: 2, time: "0:06-0:12", shot: "镜2", voiceOver: "甲。乙。", visual: "v", notes: "" },
      { n: 3, time: "0:12-0:24", shot: "镜3", voiceOver: "丙。", visual: "v", notes: "" },
      { n: 4, time: "0:24-0:36", shot: "镜4", voiceOver: "丁。", visual: "v", notes: "" },
      { n: 5, time: "0:36-0:48", shot: "镜5", voiceOver: "戊。", visual: "v", notes: "" },
      { n: 6, time: "0:48-1:00", shot: "镜6", voiceOver: "（无）", visual: "v", notes: "" },
    ],
  };
  const pkg = await generateProduction(
    { brief, topicCard: null },
    undefined,
    { complete: async () => ({ text: JSON.stringify(fake), usage: null }) },
  );
  const sb = pkg.storyboard;
  expect(sb[0].silent).toBe(true);   // title card
  expect(sb[5].silent).toBe(true);   // trailing （无）
  // derived voiceOver: non-（无） chunks concat == script
  const assigned = sb.filter((s) => s.voiceOver !== "（无）").map((s) => s.voiceOver).join("");
  expect(assigned).toBe("甲。乙。丙。丁。戊。");
});
```

(If `brief` isn't already defined in this test file, reuse the file's existing fixture; the other tests there already construct one.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/production/deepseek-script.test.ts`
Expected: FAIL — `silent` undefined and voiceOver not re-derived.

- [ ] **Step 3: Implement**

In `lib/production/deepseek-script.ts`, add import:

```ts
import { deriveVoiceOvers } from "@/lib/production/derive-voiceovers";
```

In `generateProduction`, after `parsed` is confirmed and before building `wordCount`, normalize the storyboard:

```ts
  // Storyboard voice-over is derived from the script. Mark AI's no-voice shots
  // (（无）/empty) silent, then overwrite every voiceOver from the script so the
  // package is consistent from the start.
  const NONE = "（无）";
  const withSilent = parsed.storyboard.map((shot) => ({
    ...shot,
    silent: shot.voiceOver.trim() === "" || shot.voiceOver.trim() === NONE,
  }));
  const derived = deriveVoiceOvers(
    { targetDuration, wordCount: 0, sections: parsed.sections },
    withSilent,
    NONE,
  );
  const storyboard = withSilent.map((shot, i) => ({ ...shot, voiceOver: derived[i] }));
```

Then change the returned package to use the normalized `storyboard`:

```ts
  const wordCount = parsed.sections.reduce((sum, s) => sum + s.body.length, 0);
  return {
    script: { targetDuration, wordCount, sections: parsed.sections },
    storyboard,
    task: buildTaskScaffold(opts.brief, topicCard),
  };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/production/deepseek-script.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/production/deepseek-script.ts tests/production/deepseek-script.test.ts
git commit -m "feat(production): derive voiceOver + mark silent shots at generation"
```

---

### Task 5: UI — read-only voice-over + silent toggle

**Files:**
- Modify: `components/workbench/production-studio.tsx` (`StoryboardPanel`, lines ~300-443)
- Modify: `lib/i18n/copy.ts` (studio namespace, en + zh)

- [ ] **Step 1: Add copy keys**

In `lib/i18n/copy.ts`, in BOTH the `en` and `zh` `studio` namespaces add (keep key parity — `tests/unit/i18n.test.ts` enforces it, and no CJK in `en`):

en:
```ts
    sbHelpDerived: "Voice-over is generated from the script and is read-only — edit the script to change it. Shot / visual / notes / time are editable. Mark a shot as no-voice (title or transition card).",
    sbSilentToggle: "No voice (title / transition card)",
    sbSilentMark: "Silent",
```

zh:
```ts
    sbHelpDerived: "旁白由脚本自动生成、只读——要改去改脚本；镜头描述/画面/备注/时长可编辑。可标记无人声镜头（标题卡/转场卡）。",
    sbSilentToggle: "无人声（标题卡/转场卡）",
    sbSilentMark: "无人声",
```

- [ ] **Step 2: Remove voiceOver from the editable shot draft**

In `production-studio.tsx`:

- Remove `voiceOver` from the `ShotDraft` interface (lines 300-306).
- In `beginEdit` (line 323), drop `voiceOver` from the `setDraft({...})` object.
- Remove the editing `<span className="c-vo">…textarea…</span>` block (lines 383-390); replace it in the editing row with a read-only cell:

```tsx
                <span className="c-vo">{shot.silent ? "（无）" : `“${shot.voiceOver}”`}</span>
```

- In the editing row, add a silent toggle (place inside the `c-shot` or a dedicated control near the time input):

```tsx
                <label className="sb-silent">
                  <input
                    type="checkbox"
                    checked={draft.silent ?? false}
                    onChange={(event) => patchDraft({ silent: event.target.checked })}
                  />
                  {s.sbSilentToggle}
                </label>
```

- Add `silent: boolean` to `ShotDraft` and initialize it in `beginEdit`: `silent: shot.silent ?? false`. `commitEdit` already spreads `{ ...draft }` into `onEditShot`; since `ShotDraft` no longer has `voiceOver`, the patch carries `silent` (and `voiceOver` is ignored by the reducer anyway).

- [ ] **Step 3: Make the read-only row reflect silent + show derived voiceOver**

Replace the non-editing `c-vo` cell (line 429):

```tsx
              <span className="c-vo">{shot.silent ? "（无）" : `“${shot.voiceOver}”`}</span>
```

- [ ] **Step 4: Swap the help text**

Change the help span (line 348) from `{s.sbHelp}` to `{s.sbHelpDerived}`.

- [ ] **Step 5: Type-check + build the component path**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add components/workbench/production-studio.tsx lib/i18n/copy.ts
git commit -m "feat(production): read-only voiceOver column + silent toggle in storyboard"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all pass (including the new production tests and the i18n parity guard).

- [ ] **Step 3: Production build**

Run: `npx next build`
Expected: compiles all routes, no errors.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin <feature-branch>
gh pr create --base main --title "feat(production): storyboard voice-over derived from script" --body "<summary + link to spec/plan>"
```

---

## Self-Review

- **Spec coverage:** §3 derivation rule → Task 2. §4 data model (`silent`) → Task 1. §5 write-time recompute (generation/script edit/shot edit) → Tasks 3 & 4. §6 UI (read-only voiceOver, silent toggle, help text) → Task 5. §7 i18n → Task 5 Step 1. §8 tests → Tasks 2/3/4 tests. §10 acceptance → Task 6. All covered.
- **Placeholder scan:** code blocks are complete; the only `<feature-branch>`/PR-body placeholders are intentional (filled at execution). Test files note "reuse existing fixture" where the target test file already defines `brief`/`createInitialWorkflowState` — verify those names at execution and adapt if the file uses different helpers.
- **Type consistency:** `deriveVoiceOvers(script, shots, noneLabel)` and `splitSentences(text)` signatures are identical across Tasks 2/3/4. `VOICE_OVER_NONE`/`NONE` = `"（无）"` everywhere. `silent?: boolean` consistent (Task 1 ↔ 3 ↔ 4 ↔ 5).
- **Note:** `b-cna-01` fixture in `lib/data/phase1-fixtures.ts` is also the few-shot exemplar in `deepseek-script.ts`; the plan does not run it through derivation (only runtime drafts go through reducers/generation), so the exemplar text is unchanged. If `local-workflow-production.test.ts` asserts exact pre-existing voiceOver values for `b-cna-01` after an edit, update those assertions to compare against `deriveVoiceOvers(...)` output (Task 3 tests already do this).
