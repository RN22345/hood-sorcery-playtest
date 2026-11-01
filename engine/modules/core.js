// Core round (SRD v3.10.20 §4): spin, Swap Meet, cast, flip + Thumbs, Flip the Script, settle
// damage (Thumb 6), refill, end of game. Every mode includes this module.
import { rand, d6 } from "../rng.js";
import { lineStats, clamp } from "../line.js";
import { castProblem, cleanCast, bestLine, botThumbs, botRng, repairCast } from "../cast.js";

const names = (st, pids) => pids.map((id) => st.players[id].name).join(", ");

export function applyLimits(st, ctx) {
  st.limits = { line: ctx.p.line, maxCards: ctx.p.maxCards };
  for (const m of ctx.mods) {
    const e = m.effects?.[st.fx];
    if (e) Object.assign(st.limits, e);
  }
}

export function zoneLabel(st, z) {
  return st.zones.find((x) => x.i === z)?.name ?? `zone ${z}`;
}

export default {
  id: "core",
  effects: { turf: { line: 10, maxCards: 4 }, cuffed: { line: 6 } },
  steps: [
    {
      id: "roundStart", phase: "ROUND_START", order: 0, kind: "auto",
      run(st, ctx) {
        st.round += 1;
        st.lastRes = st.revealed ? st.res : null; // shown dimmed until this round's flip
        st.casts = {}; st.res = {}; st.revealed = false; st.ranks = null;
        st.rd = st.players.map(() => 0);
        st.fx = null; st.wheel = null;
        applyLimits(st, ctx);
        st.log.push({ r: st.round, k: "round", text: `Round ${st.round} of ${ctx.p.rounds}` });
      },
    },
    {
      id: "spin", phase: "ROUND_START", order: 10, kind: "auto",
      run(st, ctx) {
        // Cooldown (team decision 2026-11-01): a sector that landed sits out the next `wheelCooldown` spins,
        // so repeats can't cluster. 0 = every sector every spin (the physical Wheel).
        const hist = (st.wheelHist ||= []);
        const cool = ctx.p.wheelCooldown ? hist.slice(-ctx.p.wheelCooldown) : [];
        const pool = ctx.data.wheel.filter((w) => !cool.includes(w.id));
        const sector = pool[Math.floor(rand(st) * pool.length)];
        st.wheelHist.push(sector.id);
        st.wheel = sector.id;
        st.fx = ctx.cfg.wheel[sector.id] || sector.effect;
        applyLimits(st, ctx);
        st.log.push({ r: st.round, k: "wheel", id: sector.id, text: `The Wheel lands on ${sector.name}.` });
      },
    },
    {
      id: "swapMeet", phase: "PRE_CAST", order: 10, kind: "choice",
      when: (st) => st.fx === "swapPass",
      spec: (st) => ({ type: "pickCards", count: 2, prompt: "Swap Meet: pick 2 cards to pass to the left." }),
      validate(st, ctx, pid, v) {
        const hand = st.players[pid].hand;
        if (!Array.isArray(v) || v.length !== 2 || v[0] === v[1] || !v.every((id) => hand.includes(id))) return "Pick 2 different cards from your hand";
      },
      apply(st, ctx, answers) {
        const n = st.players.length;
        for (const pl of st.players) pl.hand = pl.hand.filter((id) => !answers[pl.id].includes(id));
        for (const pl of st.players) st.players[(pl.id + 1) % n].hand.push(...answers[pl.id]);
        st.log.push({ r: st.round, k: "swap", text: "Everyone passed 2 cards to the left." });
      },
      bot(st, ctx, pid) {
        return [...st.players[pid].hand].sort((a, b) => ctx.card(a).atk + ctx.card(a).blk - ctx.card(b).atk - ctx.card(b).blk).slice(0, 2);
      },
    },
    {
      id: "cast", phase: "CAST", order: 50, kind: "choice",
      spec(st, ctx, pid) {
        // a module may pre-place cards the crew must cast (e.g. the opened card)
        const prefill = ctx.mods.map((m) => m.castPrefill?.(st, ctx, pid)).find(Boolean) || null;
        return { type: "cast", prompt: "Build your line and lock it in.", limits: st.limits, prefill };
      },
      validate: (st, ctx, pid, v) => castProblem(st, ctx, pid, v),
      apply(st, ctx, answers) {
        for (const pid in answers) st.casts[pid] = cleanCast(answers[pid]);
        st.log.push({ r: st.round, k: "cast", text: "Everyone has cast." });
      },
      bot(st, ctx, pid) {
        let c = null;
        for (const m of ctx.mods) if (m.botCast) { c = m.botCast(st, ctx, pid); break; }
        if (!c) {
          const l = bestLine(st, ctx, pid, (l) => l.atk + l.blk - l.len * 0.05);
          c = { lines: [{ zone: 0, cards: l.cards }], thumbs: botThumbs(st, ctx, pid, 0) };
        }
        for (const m of ctx.mods) c = m.adjustBotCast?.(st, ctx, pid, c) || c;
        return repairCast(st, ctx, pid, c);
      },
    },
    {
      id: "reveal", phase: "REVEAL", order: 0, kind: "auto",
      run(st, ctx) {
        st.revealed = true;
        for (const pl of st.players) {
          const cast = st.casts[pl.id];
          const lines = cast.lines.map((ln) => ({ zone: ln.zone, cards: ln.cards, ...lineStats(ln.cards.map(ctx.card)) }));
          for (const ln of lines) for (const m of ctx.mods) m.adjustLine?.(st, ctx, pl.id, ln); // location cards etc.
          const rolls = [];
          let six = 0;
          for (const z of cast.thumbs) {
            const r = d6(st);
            rolls.push({ zone: z, r });
            const ln = lines.find((l) => l.zone === z);
            if (r === 1 && st.fx !== "cleanKit") { ln.atk -= 1; ln.blk -= 1; }
            else if (r === 3 || r === 4) { ln.atk += 1; ln.blk += 1; }
            else if (r === 5) { ln.atk += 2; ln.blk += 2; }
            else if (r === 6) six += 1;
          }
          pl.thumbs -= cast.thumbs.length;
          for (const ln of lines) { ln.atk = clamp(ln.atk); ln.blk = clamp(ln.blk); }
          const sum = (k) => lines.reduce((a, l) => a + l[k], 0);
          st.res[pl.id] = { lines, rolls, six, atk: clamp(sum("atk")), blk: clamp(sum("blk")), len: sum("len") };
          const thumbTxt = rolls.length ? ` · Thumbs ${rolls.map((x) => x.r).join(", ")}` : "";
          st.log.push({ r: st.round, k: "reveal", pid: pl.id, text: `${pl.name}: ATK ${st.res[pl.id].atk} / BLK ${st.res[pl.id].blk}, ${st.res[pl.id].len} fingers${thumbTxt}` });
        }
      },
    },
    {
      id: "flipScript", phase: "REVEAL", order: 10, kind: "choice",
      when: (st) => st.fx === "flipScript",
      spec: (st, ctx, pid) => ({
        type: "option", prompt: `Flip the Script: you have ATK ${st.res[pid].atk} / BLK ${st.res[pid].blk}. Keep or swap?`,
        options: [{ value: "keep", label: "Thumb up: keep" }, { value: "swap", label: "Thumb down: swap ATK and BLK" }],
      }),
      validate: (st, ctx, pid, v) => (v === "keep" || v === "swap" ? null : "Choose keep or swap"),
      apply(st, ctx, answers) {
        const swapped = [];
        for (const pid in answers) {
          if (answers[pid] !== "swap") continue;
          const r = st.res[pid];
          [r.atk, r.blk] = [r.blk, r.atk];
          for (const ln of r.lines) [ln.atk, ln.blk] = [ln.blk, ln.atk];
          swapped.push(+pid);
        }
        st.log.push({ r: st.round, k: "flip", text: swapped.length ? `Swapped ATK/BLK: ${names(st, swapped)}` : "Nobody swapped." });
      },
      bot(st, ctx, pid) {
        const r = st.res[pid];
        const others = st.players.filter((p) => p.id !== pid).map((p) => st.res[p.id]);
        const beatsNow = others.filter((o) => r.atk > o.atk).length + others.filter((o) => r.blk > o.blk).length;
        const beatsSwap = others.filter((o) => r.blk > o.atk).length + others.filter((o) => r.atk > o.blk).length;
        return beatsSwap > beatsNow ? "swap" : "keep";
      },
    },
    {
      // Thumb 6: -1 damage this round, never below 0 for the round (SRD §6 resolution order, last step).
      id: "settle", phase: "RESOLVE", order: 50, kind: "auto",
      run(st, ctx) {
        if (ctx.cfg.win.track !== "damage") return;
        for (const pl of st.players) {
          let d = st.rd[pl.id];
          const six = st.res[pl.id].six;
          if (six) d = Math.max(0, d - six);
          st.rd[pl.id] = d;
          pl.tracks.damage += d;
          if (d || six) st.log.push({ r: st.round, k: "dmg", pid: pl.id, d, text: `${pl.name} takes ${d} damage${six ? " (Thumb 6: −" + six + ")" : ""}.` });
        }
      },
    },
    {
      id: "refill", phase: "REFILL", order: 0, kind: "auto",
      run(st, ctx) {
        for (const pl of st.players) {
          const cast = st.casts[pl.id];
          const used = cast ? cast.lines.flatMap((l) => l.cards) : [];
          pl.hand = pl.hand.filter((id) => !used.includes(id));
          st.discard.push(...used);
        }
        for (const pl of st.players) {
          while (pl.hand.length < ctx.p.hand) {
            if (!st.deck.length) {
              if (!st.discard.length) break;
              st.deck = st.discard.splice(0);
              for (let i = st.deck.length - 1; i > 0; i--) {
                const j = Math.floor(rand(st) * (i + 1));
                [st.deck[i], st.deck[j]] = [st.deck[j], st.deck[i]];
              }
              st.log.push({ r: st.round, k: "shuffle", text: "The deck ran out: discards shuffled back in." });
            }
            pl.hand.push(st.deck.shift());
          }
        }
      },
    },
    {
      id: "roundEnd", phase: "ROUND_END", order: 90, kind: "auto",
      run(st, ctx) {
        for (const pl of st.players) {
          const r = st.res[pl.id] || { atk: 0, blk: 0, len: 0, lines: [], rolls: [] };
          pl.hist.push({ r: st.round, wheel: st.wheel, dmg: st.rd[pl.id], damage: pl.tracks.damage, rep: pl.tracks.rep, atk: r.atk, blk: r.blk, len: r.len, at: pl.at,
            holds: st.zones.filter((z) => z.holder === pl.id).map((z) => z.name),
            cards: r.lines.reduce((a, l) => a + l.cards.length, 0), rolls: r.rolls.map((x) => x.r) });
        }
        if (st.round < ctx.p.rounds) return;
        for (const m of ctx.mods) m.gameEnd?.(st, ctx);
        st.result = standings(st, ctx);
        st.over = true;
        const w = st.players[st.result.order[0]];
        st.log.push({ r: st.round, k: "end", pid: w.id, text: `The Vein closes. ${w.name} (${w.crew}) takes it.` });
      },
    },
  ],
};

/** Final order using the mode's win rule: track + best + tie-breaks (SRD §7 for damage modes). */
export function standings(st, ctx) {
  const { track, best, ties = [] } = ctx.cfg.win;
  const sign = best === "lowest" ? 1 : -1;
  const last = (pl) => pl.hist[pl.hist.length - 1] || { dmg: 0, atk: 0, blk: 0, rep: 0 };
  const lastRep = (pl) => last(pl).rep - (pl.hist[pl.hist.length - 2]?.rep ?? 0);
  const zonesHeld = (pl) => st.zones.filter((z) => z.holder === pl.id).length;
  const keyFns = {
    lastRound: (pl) => (track === "damage" ? last(pl).dmg : -lastRep(pl)),
    lastTotal: (pl) => -(last(pl).atk + last(pl).blk),
    zones: (pl) => -zonesHeld(pl),
  };
  const cmp = (a, b) => {
    const d = sign * (a.tracks[track] - b.tracks[track]);
    if (d) return d;
    for (const t of ties) if (keyFns[t]) { const x = keyFns[t](a) - keyFns[t](b); if (x) return x; }
    return 0;
  };
  const sorted = [...st.players].sort(cmp);
  // remaining exact ties: roll-off
  const order = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && cmp(sorted[i], sorted[j]) === 0) j++;
    let g = sorted.slice(i, j);
    if (g.length > 1 && ties.includes("rolloff")) {
      const rolls = g.map((pl) => ({ pl, r: d6(st) * 10 + Math.floor(rand(st) * 10) }));
      st.log.push({ r: st.round, k: "rolloff", text: `Final tie roll-off: ${rolls.map((x) => `${x.pl.name} ${Math.floor(x.r / 10)}`).join(", ")}` });
      g = rolls.sort((a, b) => b.r - a.r).map((x) => x.pl);
    }
    order.push(...g.map((pl) => pl.id));
    i = j;
  }
  return { track, order, scores: st.players.map((pl) => pl.tracks[track]) };
}

export { names, botRng };
