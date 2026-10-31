// B7 Run It Up (P4): after casting, before the flip, every crew picks at once: Fold, Call or Raise.
// Stakes: one raise doubles the matrix damage this round, two or more raises make it ×4. Folders skip the
// ranking (the matrix for the crews still in is used: 3- and 2-player matrices exist) and take a flat
// fold cost (1). If only one crew stays in, it takes nothing. Playtest guesses, see modes/classic.md.
import { lineStats } from "../line.js";
import { botRng } from "../cast.js";

export default {
  id: "runItUp",
  steps: [
    {
      id: "runReset", phase: "ROUND_START", order: 1, kind: "auto",
      run(st) { st.stake = 1; st.folded = []; },
    },
    {
      id: "runItUp", phase: "PRE_REVEAL", order: 20, kind: "choice",
      spec: (st, ctx) => ({
        type: "option", prompt: "Run It Up: your line is set. Fold, call, or raise the stakes?",
        options: [
          { value: "fold", label: "Fold", hint: `Skip the ranking, take ${ctx.p.foldCost ?? 1} damage` },
          { value: "call", label: "Call", hint: "Play the round as it stands" },
          { value: "raise", label: "Raise", hint: "One raise: matrix damage ×2; two or more: ×4" },
        ],
      }),
      validate: (st, ctx, pid, v) => (["fold", "call", "raise"].includes(v) ? null : "Fold, call or raise"),
      apply(st, ctx, answers) {
        const ids = Object.keys(answers).map(Number);
        const raises = ids.filter((id) => answers[id] === "raise").length;
        st.folded = ids.filter((id) => answers[id] === "fold");
        st.stake = raises >= 2 ? 4 : raises === 1 ? 2 : 1;
        const say = (v) => ids.filter((id) => answers[id] === v).map((id) => st.players[id].name).join(", ") || "nobody";
        st.log.push({ r: st.round, k: "stake", text: `Run It Up: fold ${say("fold")} · raise ${say("raise")} · stakes ×${st.stake}` });
      },
      bot(st, ctx, pid) {
        const r = botRng(st, pid, "run");
        const s = st.casts[pid] ? st.casts[pid].lines.reduce((a, l) => { const x = lineStats(l.cards.map(ctx.card)); return a + x.atk + x.blk; }, 0) : 0;
        const v = s + r() * 4 - 2;
        return v < 7 ? "fold" : v > 15 ? "raise" : "call"; // raising is rare: two raises make the round ×4
      },
    },
    {
      id: "foldCost", phase: "RESOLVE", order: 11, kind: "auto",
      when: (st) => st.folded?.length > 0,
      run(st, ctx) {
        for (const id of st.folded) st.rd[id] += ctx.p.foldCost ?? 1;
        st.log.push({ r: st.round, k: "stake", text: `Folded: ${st.folded.map((id) => st.players[id].name).join(", ")} +${ctx.p.foldCost ?? 1} damage.` });
      },
    },
  ],
};
