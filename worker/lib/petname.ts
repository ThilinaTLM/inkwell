// Petname label generator for share links.
//
// Used as the default `shares.label` when the owner doesn't type one,
// so each link has a memorable display identity ("amber-fox-37")
// instead of falling back to "Untitled link" in the dialog. The label
// is purely cosmetic; the URL token (`shares.token`) remains a
// cryptographically random 144-bit value — do NOT confuse the two.
//
// Word lists are curated to fit the Inkwell aesthetic (warm,
// paper-and-ink, nature) and avoid negative/loaded vocabulary. ~30
// adjectives × ~30 nouns × 100 numeric suffixes = ~90k unique
// combinations — plenty to keep two shares on the same target visually
// distinct, without needing per-account uniqueness checks.
const PETNAME_ADJECTIVES = [
  "amber",
  "ashen",
  "brass",
  "calm",
  "cedar",
  "copper",
  "dusty",
  "ember",
  "faded",
  "gentle",
  "hazy",
  "indigo",
  "ivory",
  "linen",
  "lush",
  "mellow",
  "misty",
  "mossy",
  "ochre",
  "paper",
  "plum",
  "quiet",
  "rustic",
  "sable",
  "sepia",
  "silken",
  "sunny",
  "umber",
  "vellum",
  "warm",
  "willow",
];
const PETNAME_NOUNS = [
  "arc",
  "birch",
  "brook",
  "cedar",
  "cove",
  "dale",
  "dune",
  "fern",
  "fox",
  "glade",
  "glen",
  "harbor",
  "heath",
  "hill",
  "isle",
  "lark",
  "lily",
  "marsh",
  "meadow",
  "moon",
  "oak",
  "owl",
  "pine",
  "pond",
  "reed",
  "river",
  "rose",
  "stone",
  "stream",
  "vine",
  "wren",
];

export function generateShareLabel(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const adj = PETNAME_ADJECTIVES[bytes[0] % PETNAME_ADJECTIVES.length];
  const noun = PETNAME_NOUNS[bytes[1] % PETNAME_NOUNS.length];
  const num = (bytes[2] % 100).toString().padStart(2, "0");
  return `${adj}-${noun}-${num}`;
}
