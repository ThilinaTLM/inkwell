// Small scoring fuzzy matcher for the command palette.
//
// PUBLIC CONTRACT
//   fuzzyMatch(query, text): { score: number; positions: number[] } | null
//     - case-insensitive subsequence match; null when not all query chars occur in order
//     - bonuses: exact/prefix match, consecutive runs, word starts (after space, /, -, _, .,
//       camelCase humps), shorter texts; penalty for gaps
//   fuzzyFilter(query, items, getText, limit?): Array<{ item, score, positions }>
//     - sorted by score desc (stable); empty query returns all items with score 0
//   highlightSegments(text, positions): Array<{ text: string; match: boolean }>

export interface FuzzyResult {
  score: number;
  positions: number[];
}

function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  const cur = text[i];
  if (/[\s/\-_.#:·]/.test(prev)) return true;
  return prev === prev.toLowerCase() && cur !== cur.toLowerCase();
}

export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, positions: [] };
  const t = text.toLowerCase();

  // Fast paths: exact / prefix / substring matches get large, ordered scores.
  if (t === q) return { score: 1000, positions: [...q].map((_, i) => i) };
  let sub = t.indexOf(q);
  if (sub >= 0) {
    // Prefer an occurrence that starts a word ("OAuth / auth" → the 2nd).
    for (let j = sub; j >= 0; j = t.indexOf(q, j + 1)) {
      if (isWordStart(text, j)) {
        sub = j;
        break;
      }
    }
    const positions = [...q].map((_, i) => sub + i);
    const base = sub === 0 ? 800 : isWordStart(text, sub) ? 600 : 200;
    return { score: base - Math.min(sub, 50) - Math.min(t.length, 100) * 0.5, positions };
  }

  // Greedy subsequence with a preference for word starts: for each
  // query char, prefer the next word-start occurrence if one exists
  // before the next occurrence would force a skip past it.
  const positions: number[] = [];
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    let firstAny = -1;
    for (let j = ti; j < t.length; j++) {
      if (t[j] !== ch) continue;
      if (firstAny < 0) firstAny = j;
      if (isWordStart(text, j) || (positions.length && j === positions[positions.length - 1] + 1)) {
        found = j;
        break;
      }
    }
    if (found < 0) found = firstAny;
    if (found < 0) return null;
    positions.push(found);
    ti = found + 1;
  }

  let score = 100;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (isWordStart(text, p)) score += 12;
    if (i > 0) {
      const gap = p - positions[i - 1] - 1;
      if (gap === 0) score += 8;
      else score -= Math.min(gap, 10);
    }
  }
  // Acronym-style matches (every char starts a word) beat mid-word substrings.
  if (positions.every((p) => isWordStart(text, p))) score += 150;
  score -= positions[0] * 0.5;
  score -= Math.min(t.length, 100) * 0.3;
  return { score, positions };
}

export function fuzzyFilter<T>(
  query: string,
  items: readonly T[],
  getText: (item: T) => string,
  limit = Number.POSITIVE_INFINITY,
): Array<{ item: T; score: number; positions: number[] }> {
  const out: Array<{ item: T; score: number; positions: number[]; idx: number }> = [];
  items.forEach((item, idx) => {
    const r = fuzzyMatch(query, getText(item));
    if (r) out.push({ item, score: r.score, positions: r.positions, idx });
  });
  out.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return out.slice(0, limit).map(({ item, score, positions }) => ({ item, score, positions }));
}

export function highlightSegments(
  text: string,
  positions: number[],
): Array<{ text: string; match: boolean }> {
  if (!positions.length) return [{ text, match: false }];
  const set = new Set(positions);
  const segs: Array<{ text: string; match: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const match = set.has(i);
    const last = segs[segs.length - 1];
    if (last && last.match === match) last.text += text[i];
    else segs.push({ text: text[i], match });
  }
  return segs;
}
