// B6 Corner location cards (P1, Docs/Concept Rework/05_Pathways.md): at setup each corner is dealt a location
// with a small rule. Only the six named in DEVLOG §5 are here; the pathway doc lists ~12 (see
// modes/corners.md "Playtest guesses" for the readings).
import { shuffle } from "../rng.js";
import { lineStats } from "../line.js";

export const LOCATIONS = {
  laundromat: { name: "Laundromat", text: "Water seams here give +2 BLK instead of +1." },
  rooftop: { name: "Rooftop", text: "At most 1 card under this corner." },
  bodega: { name: "Bodega", text: "Pays 2 Rep a round instead of 1." },
  precinct: { name: "Precinct", text: "Every crew that loses a contest here loses 1 Rep." },
  subwayGrate: { name: "Subway Grate", text: "No seams here: no bonus and no length cut." },
  oldChurch: { name: "Old Church", text: "Ties here go to the challenger." },
};

const locOf = (st, zone) => st.zones.find((z) => z.i === zone)?.loc;
const gratePenalty = (st, ctx, v) =>
  v.lines.filter((l) => l.cards?.length && locOf(st, l.zone) === "subwayGrate").reduce((a, l) => a + lineStats(l.cards.map(ctx.card)).seams.length, 0);

export default {
  id: "locations",
  init(st) {
    const ids = shuffle(st, Object.keys(LOCATIONS));
    st.zones.forEach((z, k) => { z.loc = ids[k % ids.length]; });
    st.log.push({ r: 0, k: "zone", text: "Locations: " + st.zones.map((z) => `${z.name} = ${LOCATIONS[z.loc].name}`).join(" · ") });
  },
  validateCast(st, ctx, pid, v) {
    for (const l of v.lines) if (l.cards?.length > 1 && locOf(st, l.zone) === "rooftop") return "The Rooftop takes only 1 card";
    const fingers = v.lines.reduce((a, l) => a + (l.cards?.length ? lineStats(l.cards.map(ctx.card)).len : 0), 0) + gratePenalty(st, ctx, v);
    if (gratePenalty(st, ctx, v) && fingers > st.limits.line) return `Seams don't count at the Subway Grate: your lines are ${fingers} fingers (limit ${st.limits.line})`;
    return null;
  },
  adjustLine(st, ctx, pid, ln) {
    const loc = locOf(st, ln.zone);
    if (loc === "laundromat") ln.blk += ln.seams.filter((s) => s.elem === "water").length;
    if (loc === "subwayGrate") {
      for (const s of ln.seams) { if (s.bonus === "atk") ln.atk -= 1; else ln.blk -= 1; ln.len += 1; }
      ln.seams = [];
    }
  },
  zoneRep: (st, ctx, z) => (z.loc === "bodega" ? 1 : 0),
  challengerTies: (st, ctx, z) => z.loc === "oldChurch",
  contestLost(st, ctx, z, losers) {
    if (z.loc !== "precinct" || !losers.length) return;
    for (const id of losers) st.players[id].tracks.rep = Math.max(0, st.players[id].tracks.rep - 1);
    st.log.push({ r: st.round, k: "rep", text: `Precinct: ${losers.map((id) => st.players[id].name).join(", ")} −1 Rep.` });
  },
};
