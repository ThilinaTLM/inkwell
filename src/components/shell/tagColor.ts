// Deterministic tag colour (no server-side tag colours — plan sec. 2).
//
// PUBLIC CONTRACT
//   tagColor(name): string   – CSS colour (hsl) derived from a hash of the lowercased name;
//                              identical on every surface (sidebar dots, pills, palette).
//   tagHue(name): number     – 0–359

export function tagHue(name: string): number {
  let h = 2166136261;
  const s = name.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

export function tagColor(name: string): string {
  return `hsl(${tagHue(name)} 62% 58%)`;
}
