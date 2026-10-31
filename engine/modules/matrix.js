// Rank + Damage Matrix (SRD v3.10.20 §5, §6 resolution order):
// break ties -> Mugged / Sabotage rotate -> read the matrix -> Bleeding. (Thumb 6 is core "settle".)
import { rankStat } from "../rank.js";

export function rotate(order) {
  return [...order.slice(1), order[0]]; // 1st drops to last, everyone else moves up 1
}

export default {
  id: "matrix",
  steps: [
    {
      id: "matrix", phase: "RESOLVE", order: 10, kind: "auto",
      run(st, ctx) {
        const pids = st.players.map((p) => p.id);
        let atkOrder = rankStat(st, pids, "atk");
        let blkOrder = rankStat(st, pids, "blk");
        if (st.fx === "rotateAtk") atkOrder = rotate(atkOrder);
        if (st.fx === "rotateBlk") blkOrder = rotate(blkOrder);
        const M = ctx.data.matrices[ctx.p.matrixSet][String(pids.length)];
        const last = pids.length - 1;
        st.ranks = { atk: atkOrder, blk: blkOrder };
        for (const pid of pids) {
          const a = atkOrder.indexOf(pid), b = blkOrder.indexOf(pid);
          let d = M[a][b];
          if (st.fx === "bleeding") d += (a === last ? 1 : 0) + (b === last ? 1 : 0);
          st.rd[pid] += d;
        }
        const ord = (o) => o.map((id) => st.players[id].name).join(" > ");
        st.log.push({ r: st.round, k: "rank", text: `ATK: ${ord(atkOrder)} · BLK: ${ord(blkOrder)}` });
      },
    },
  ],
};
