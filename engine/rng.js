// Seeded random numbers. The seed lives in the game state (st.rng), so a game can be replayed
// exactly from its seed and action list. Never use Math.random inside the engine.
// Algorithm: mulberry32 (easy to port to C#: uint arithmetic, same constants).

export function seedFrom(text) {
  // FNV-1a hash of any string/number -> uint32 seed
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function rand(st) {
  let t = (st.rng = (st.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const d6 = (st) => 1 + Math.floor(rand(st) * 6);
export const pick = (st, arr) => arr[Math.floor(rand(st) * arr.length)];

export function shuffle(st, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(st) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
