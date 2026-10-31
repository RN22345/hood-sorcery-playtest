// P12 Pass the Tab (Docs/Concept Rework/05_Pathways.md). After the matrix, the crew with the
// biggest damage number holds the Tab. It may pay 1 Thumb to swap numbers with the next-worst
// crew, who may pay to pass it on. Stops at the first crew that declines or can't pay.
// Order: damage this round (high first), then worse combined rank. Runs before Thumb 6 (settle).
import { botRng } from "../cast.js";

function canPass(st) {
  const t = st.ext.tab;
  if (!t || t.i >= t.order.length - 1) return false;
  const a = t.order[t.i], b = t.order[t.i + 1];
  return st.players[a].thumbs > 0 && st.rd[a] > st.rd[b];
}

export default {
  id: "passTheTab",
  steps: [
    {
      id: "openTab", phase: "RESOLVE", order: 15, kind: "auto",
      run(st) {
        const score = (pid) => st.ranks.atk.indexOf(pid) + st.ranks.blk.indexOf(pid);
        st.ext.tab = { order: st.players.map((p) => p.id).sort((a, b) => st.rd[b] - st.rd[a] || score(b) - score(a)), i: 0 };
      },
    },
    {
      id: "passTab", phase: "RESOLVE", order: 20, kind: "choice",
      when: (st) => canPass(st),
      who: (st) => [st.ext.tab.order[st.ext.tab.i]],
      spec(st) {
        const t = st.ext.tab, a = t.order[t.i], b = t.order[t.i + 1];
        return {
          type: "option",
          prompt: `You hold the Tab: ${st.rd[a]} damage. Pay 1 Thumb to swap with ${st.players[b].name} (${st.rd[b]})?`,
          options: [{ value: "pass", label: `Pay a Thumb, pass it to ${st.players[b].name}` }, { value: "keep", label: "Take it" }],
        };
      },
      validate: (st, ctx, pid, v) => (v === "pass" || v === "keep" ? null : "Pass or keep"),
      apply(st, ctx, answers) {
        const t = st.ext.tab, a = t.order[t.i], b = t.order[t.i + 1];
        if (answers[a] !== "pass") { st.log.push({ r: st.round, k: "tab", text: `${st.players[a].name} takes the Tab.` }); t.i = t.order.length; return; }
        st.players[a].thumbs -= 1;
        [st.rd[a], st.rd[b]] = [st.rd[b], st.rd[a]];
        st.log.push({ r: st.round, k: "tab", text: `${st.players[a].name} pays a Thumb and passes the Tab to ${st.players[b].name}.` });
        t.i += 1;
        return "repeat";
      },
      bot(st, ctx, pid) {
        const r = botRng(st, pid, "tab");
        const t = st.ext.tab, b = t.order[t.i + 1];
        const gap = st.rd[pid] - st.rd[b];
        return gap >= 2 || (gap >= 1 && (st.round >= ctx.p.rounds - 2 || r() < 0.4)) ? "pass" : "keep";
      },
    },
  ],
};
