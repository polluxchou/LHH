import type { ProductionScript, StoryboardShot } from "@/lib/domain/production";

/** Split prose into sentences, keeping terminators (。！？； and newlines). */
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
      result[i] = sentences.slice(cursor).join(""); // last shot collects remainder
      cursor = sentences.length;
      continue;
    }
    const target = Math.round((totalChars * weights[k]) / totalWeight);
    let taken = "";
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
