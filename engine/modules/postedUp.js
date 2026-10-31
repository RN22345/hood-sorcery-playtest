// P15 Posted Up (Docs/Concept Rework/10_Posted_Up.md, draft SRD v3.10.30). Classic plus:
// a d6 picks the rich Spot (1-2 Corner, 3-4 Tunnel, 5-6 Lot); everyone posts up at a Spot at
// once; after ranking, the highest ATK total at each Spot takes it (normal ties; alone = free;
// empty Spot keeps its marker); the rich Spot's holder heals; at the end each Spot held = -1 damage.
import { d6 } from "../rng.js";
import { rankStat } from "../rank.js";
import { bestLine, botThumbs, botRng } from "../cast.js";

export const richFromRoll = (r) => (r <= 2 ? 0 : r <= 4 ? 1 : 2);

export default {
  id: "postedUp",
  steps: [
    {
      id: "richSpot", phase: "ROUND_START", order: 20, kind: "auto",
      run(st) {
        const z = st.ext.nextRich ?? richFromRoll(d6(st));
        st.ext.nextRich = null;
        st.zones.forEach((x) => (x.rich = x.i === z));
        st.log.push({ r: st.round, k: "rich", text: `The Vein runs rich at the ${st.zones[z].name}.` });
      },
    },
    {
      id: "postUp", phase: "PRE_CAST", order: 5, kind: "choice",
      spec: (st) => ({
        type: "option", prompt: "Post up: where does your crew stand this round?",
        options: st.zones.map((z) => ({
          value: z.i, label: `${z.i + 1} finger${z.i ? "s" : ""}: ${z.name}`,
          hint: [z.rich ? "rich this round" : "", z.holder != null ? `held by ${st.players[z.holder].name}` : "unclaimed"].filter(Boolean).join(" · "),
        })),
      }),
      validate: (st, ctx, pid, v) => (st.zones.some((z) => z.i === v) ? null : "Pick a Spot"),
      apply(st, ctx, answers) {
        for (const pl of st.players) pl.at = answers[pl.id];
        st.log.push({ r: st.round, k: "post", text: "Posted up: " + st.zones.map((z) => `${z.name}: ${st.players.filter((p) => p.at === z.i).map((p) => p.name).join(", ") || "—"}`).join(" · ") });
      },
      bot(st, ctx, pid) {
        const r = botRng(st, pid, "post");
        const rich = st.zones.find((z) => z.rich).i;
        const mine = st.zones.find((z) => z.holder === pid && !z.rich);
        const x = r();
        if (x < 0.5) return rich;
        if (mine && x < 0.8) return mine.i;
        return Math.floor(r() * st.zones.length);
      },
    },
    {
      id: "takeSpots", phase: "RESOLVE", order: 30, kind: "auto",
      run(st) {
        for (const z of st.zones) {
          const here = st.players.filter((p) => p.at === z.i).map((p) => p.id);
          if (!here.length) continue;
          const w = here.length === 1 ? here[0] : rankStat(st, here, "atk", z.name)[0];
          const before = z.holder;
          z.holder = w;
          st.log.push({ r: st.round, k: "spot", text: `${z.name}: ${st.players[w].name} ${before === w ? "keeps it" : "takes it"}${here.length > 1 ? " (" + here.map((id) => `${st.players[id].name} ATK ${st.res[id].atk}`).join(", ") + ")" : " (alone)"}.` });
        }
      },
    },
    {
      id: "richHeal", phase: "POST_RESOLVE", order: 10, kind: "auto",
      run(st, ctx) {
        const z = st.zones.find((x) => x.rich);
        if (!z || z.holder == null) return;
        const pl = st.players[z.holder];
        const before = pl.tracks.damage;
        pl.tracks.damage = Math.max(0, before - ctx.p.richHeal);
        st.log.push({ r: st.round, k: "heal", pid: pl.id, text: `${pl.name} holds the rich ${z.name}: −${before - pl.tracks.damage} damage.` });
      },
    },
  ],

  gameEnd(st, ctx) {
    for (const pl of st.players) {
      const held = st.zones.filter((z) => z.holder === pl.id).length;
      if (!held) continue;
      const before = pl.tracks.damage;
      pl.tracks.damage = Math.max(0, before - held * ctx.p.endPayout);
      st.log.push({ r: st.round, k: "payout", pid: pl.id, text: `The Vein closes: ${pl.name} holds ${held} Spot${held > 1 ? "s" : ""}, −${before - pl.tracks.damage} damage.` });
    }
  },

  botCast(st, ctx, pid) {
    const me = st.players[pid];
    const shared = st.players.some((p) => p.id !== pid && p.at === me.at);
    const l = bestLine(st, ctx, pid, (l) => (shared ? l.atk * 1.3 + l.blk * 0.8 : l.atk + l.blk));
    return { lines: [{ zone: me.at, cards: l.cards }], thumbs: botThumbs(st, ctx, pid, me.at) };
  },
};
