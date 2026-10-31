// Ranking with SRD v3.10.20 §5 ties: higher value first; ties -> shorter line -> higher other
// total -> d6 roll-off among the tied (repeat until every place is unique).
import { d6 } from "./rng.js";

/**
 * @param st game state (for the rng and the log)
 * @param {{pid:number,val:number,len:number,other:number}[]} entries
 * @param {string} label shown in the log for roll-offs
 * @returns {number[]} pids, 1st place first
 */
export function rankEntries(st, entries, label = "") {
  const sorted = [...entries].sort((a, b) => b.val - a.val || a.len - b.len || b.other - a.other);
  const same = (a, b) => a.val === b.val && a.len === b.len && a.other === b.other;
  const out = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && same(sorted[i], sorted[j])) j++;
    const group = sorted.slice(i, j);
    out.push(...(group.length > 1 ? rollOff(st, group, label) : group));
    i = j;
  }
  return out.map((e) => e.pid);
}

function rollOff(st, group, label) {
  const rolls = group.map((e) => ({ e, r: d6(st) }));
  st.log.push({
    r: st.round, k: "rolloff",
    text: `Roll-off${label ? " (" + label + ")" : ""}: ` + rolls.map((x) => `${st.players[x.e.pid].name} ${x.r}`).join(", "),
  });
  rolls.sort((a, b) => b.r - a.r);
  const out = [];
  for (let i = 0; i < rolls.length; ) {
    let j = i + 1;
    while (j < rolls.length && rolls[j].r === rolls[i].r) j++;
    const g = rolls.slice(i, j).map((x) => x.e);
    out.push(...(g.length > 1 ? rollOff(st, g, label) : g));
    i = j;
  }
  return out;
}

/** Ranks every player in `pids` on ATK (or BLK) using their revealed totals in st.res. */
export function rankStat(st, pids, stat, label) {
  const other = stat === "atk" ? "blk" : "atk";
  return rankEntries(st, pids.map((pid) => ({ pid, val: st.res[pid][stat], len: st.res[pid].len, other: st.res[pid][other] })), label || stat.toUpperCase());
}
