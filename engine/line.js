// The line: SRD v3.10.20 §4.1. Cards read left to right. A seam matches when one card's end
// element equals the next card's start element: fire/wind +1 ATK, water/earth +1 BLK, -1 length.

export const ATK_SEAM = new Set(["fire", "wind"]);
export const BLK_SEAM = new Set(["water", "earth"]);
export const clamp = (v) => Math.max(0, Math.min(15, v));

/** @param {{start:string,end:string,len:number,atk:number,blk:number}[]} cards in order */
export function lineStats(cards) {
  let len = 0, atk = 0, blk = 0;
  const seams = [];
  cards.forEach((c, i) => {
    len += c.len; atk += c.atk; blk += c.blk;
    if (i > 0 && cards[i - 1].end === c.start) {
      len -= 1;
      if (ATK_SEAM.has(c.start)) atk += 1; else blk += 1;
      seams.push({ at: i, elem: c.start, bonus: ATK_SEAM.has(c.start) ? "atk" : "blk" });
    }
  });
  return { len, atk, blk, seams };
}

/** Every ordered line of 1..maxCards distinct cards from the hand whose length fits the limit. */
export function enumerateLines(hand, limit, maxCards) {
  const out = [];
  const walk = (seq, used) => {
    if (seq.length) {
      const s = lineStats(seq);
      if (s.len > limit) return;
      out.push({ cards: seq.map((c) => c.id), ...s });
    }
    if (seq.length >= maxCards) return;
    hand.forEach((c, i) => {
      if (!used.has(i)) {
        used.add(i);
        walk([...seq, c], used);
        used.delete(i);
      }
    });
  };
  walk([], new Set());
  return out;
}
