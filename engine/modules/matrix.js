// Rank + Damage Matrix (SRD v3.10.20 §5, §6 resolution order):
// break ties -> Mugged / Sabotage rotate -> read the matrix -> Bleeding. (Thumb 6 is core "settle".)
import { rankStat, rankEntries } from "../rank.js";
import { immune } from "../cast.js";

export function rotate(order) {
  return [...order.slice(1), order[0]]; // 1st drops to last, everyone else moves up 1
}

/** Mugged / Sabotage with immune crews (Bribe): they keep their place, the others rotate around them. None = rotate(). */
export function rotateExcept(order, skip) {
  if (!skip.length) return rotate(order);
  const at = order.map((id, i) => (skip.includes(id) ? -1 : i)).filter((i) => i >= 0);
  const out = [...order];
  at.forEach((i, k) => { out[i] = order[at[(k + 1) % at.length]]; });
  return out;
}

/** Rank on one stat. rankEntry (Smoke Bomb in Classic) may flag an entry to win ties; with no such module, rankStat as before. */
function rankBy(st, ctx, pids, stat) {
  if (!ctx.mods.some((m) => m.rankEntry)) return rankStat(st, pids, stat);
  const other = stat === "atk" ? "blk" : "atk";
  const entries = pids.map((pid) => ({ pid, val: st.res[pid][stat], len: st.res[pid].len, other: st.res[pid][other] }));
  for (const e of entries) for (const m of ctx.mods) m.rankEntry?.(st, ctx, e, stat);
  return rankEntries(st, entries, stat.toUpperCase());
}

export default {
  id: "matrix",
  steps: [
    {
      id: "matrix", phase: "RESOLVE", order: 10, kind: "auto",
      run(st, ctx) {
        // Run It Up: folded crews skip the ranking; the stake multiplies the matrix
        const pids = st.players.map((p) => p.id).filter((id) => !st.folded?.includes(id));
        if (pids.length < 2) { st.ranks = null; return; }
        let atkOrder = rankBy(st, ctx, pids, "atk");
        let blkOrder = rankBy(st, ctx, pids, "blk");
        // immune (Bribe): only asked on a curse, and nobody is immune unless a module says so
        const safe = st.fx === "rotateAtk" || st.fx === "rotateBlk" || st.fx === "bleeding" ? pids.filter((id) => immune(st, ctx, id, st.fx)) : [];
        if (safe.length) st.log.push({ r: st.round, k: "immune", text: `${safe.map((id) => st.players[id].name).join(", ")} ${safe.length === 1 ? "is" : "are"} immune to this round's curse.` });
        if (st.fx === "rotateAtk") atkOrder = rotateExcept(atkOrder, safe);
        if (st.fx === "rotateBlk") blkOrder = rotateExcept(blkOrder, safe);
        const M = ctx.data.matrices[ctx.p.matrixSet][String(pids.length)];
        const last = pids.length - 1;
        st.ranks = { atk: atkOrder, blk: blkOrder };
        for (const pid of pids) {
          const a = atkOrder.indexOf(pid), b = blkOrder.indexOf(pid);
          let d = M[a][b] * (st.stake || 1);
          if (st.fx === "bleeding" && !safe.includes(pid)) d += (a === last ? 1 : 0) + (b === last ? 1 : 0);
          st.rd[pid] += d;
        }
        const ord = (o) => o.map((id) => st.players[id].name).join(" > ");
        st.log.push({ r: st.round, k: "rank", ranks: { atk: atkOrder, blk: blkOrder }, m: M, stake: st.stake || 1, text: `ATK: ${ord(atkOrder)} · BLK: ${ord(blkOrder)}` });
      },
    },
  ],
};
