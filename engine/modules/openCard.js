// B9 Open first card (P1 signal): before casting, every crew shows one card and the corner it goes to.
// Everyone sees all of them, then casts; that card must lead the line under that corner.
import { castProblem, cleanCast } from "../cast.js";

const openLimits = (st) => ({ line: st.limits.line, maxCards: 1 });

export default {
  id: "openCard",
  steps: [
    {
      id: "openReset", phase: "ROUND_START", order: 1, kind: "auto",
      run(st) { st.open = {}; },
    },
    {
      id: "openCard", phase: "PRE_CAST", order: 40, kind: "choice",
      spec: (st) => ({ type: "cast", step: "openCard", prompt: "Open your first card: put 1 card under a corner. Everyone sees it before casting.", limits: openLimits(st), noThumbs: true }),
      validate(st, ctx, pid, v) {
        const c = v && Array.isArray(v.lines) ? v.lines.filter((l) => l?.cards?.length) : [];
        if (c.length !== 1 || c[0].cards.length !== 1) return "Open exactly 1 card under 1 corner";
        if (v.thumbs?.length) return "No Thumbs when opening a card";
        return castProblem(st, ctx, pid, { lines: c, thumbs: [] }, openLimits(st));
      },
      apply(st, ctx, answers) {
        for (const pid in answers) {
          const l = cleanCast(answers[pid]).lines[0];
          st.open[pid] = { zone: l.zone, card: l.cards[0] };
        }
        st.log.push({ r: st.round, k: "open", text: "Opened: " + st.players.map((p) => `${p.name} ${ctx.card(st.open[p.id].card).name} at ${st.zones.find((z) => z.i === st.open[p.id].zone)?.name}`).join(" · ") });
      },
      bot(st, ctx, pid) {
        // open the first card of the cast the bot would make anyway
        const castStep = ctx.mods[0].steps.find((s) => s.id === "cast");
        const plan = castStep.bot(st, ctx, pid);
        const l = plan.lines[0];
        return { lines: [{ zone: l.zone, cards: [l.cards[0]] }], thumbs: [] };
      },
    },
  ],
  castPrefill(st, ctx, pid) {
    const o = st.open?.[pid];
    return o ? { zone: o.zone, cards: [o.card] } : null;
  },
  validateCast(st, ctx, pid, v) {
    const o = st.open?.[pid];
    if (!o || st.pending?.step !== "cast") return null;
    const l = v.lines.find((x) => x.zone === o.zone && x.cards?.length);
    if (!l || l.cards[0] !== o.card) return `Your opened card must lead your line at ${st.zones.find((z) => z.i === o.zone)?.name}`;
    return null;
  },
  adjustBotCast(st, ctx, pid, c) {
    const o = st.open?.[pid];
    if (!o) return c;
    const lines = c.lines.map((l) => ({ zone: l.zone, cards: l.cards.filter((id) => id !== o.card) })).filter((l) => l.cards.length || l.zone === o.zone);
    let at = lines.find((l) => l.zone === o.zone);
    if (!at) lines.push((at = { zone: o.zone, cards: [] }));
    at.cards.unshift(o.card);
    return { lines, thumbs: c.thumbs.filter((z) => lines.some((l) => l.zone === z)) };
  },
};
