// Run: node --test tests/
// These checks double as the first "test vectors" for the Unity port: same inputs, same outputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineStats } from "../engine/line.js";
import { rankEntries } from "../engine/rank.js";
import { createGame, act, viewFor, replay, makeCtx, botChoice } from "../engine/game.js";
import { playOut } from "../engine/run.js";
import { castProblem } from "../engine/cast.js";
import { modifierProblems } from "../engine/registry.js";
import { roundSummary } from "../engine/summary.js";
import core from "../engine/modules/core.js";
import { loadData } from "../engine/load-node.js";
import matrix from "../engine/modules/matrix.js";
import corners from "../engine/modules/corners.js";
import holdTheBlock from "../engine/modules/holdTheBlock.js";
import postedUp from "../engine/modules/postedUp.js";
import runItUp from "../engine/modules/runItUp.js";

const { data, modes, modifiers } = loadData();
const C = (start, end, len, atk, blk) => ({ start, end, len, atk, blk });
const bots = (n) => Array.from({ length: n }, () => ({ kind: "bot" }));

test("72 cards, ATK+BLK = len+1", () => {
  assert.equal(data.cards.length, 72);
  for (const c of data.cards) assert.equal(c.atk + c.blk, c.len + 1, c.id);
});

test("line: SRD §4.1 examples", () => {
  assert.equal(lineStats([C("fire", "water", 4, 3, 2), C("earth", "wind", 4, 3, 2)]).len, 8);
  assert.equal(lineStats([C("fire", "fire", 4, 3, 2), C("fire", "water", 4, 3, 2), C("water", "wind", 2, 1, 2)]).len, 8);
  assert.equal(lineStats([C("fire", "wind", 3, 2, 2), C("wind", "earth", 3, 2, 2), C("fire", "fire", 3, 2, 2)]).len, 8);
  assert.equal(lineStats([C("fire", "fire", 4, 3, 2), C("fire", "fire", 4, 3, 2), C("fire", "fire", 4, 3, 2)]).len, 10);
  const s = lineStats([C("fire", "fire", 2, 3, 0), C("fire", "water", 2, 3, 0), C("water", "earth", 2, 0, 3)]);
  assert.deepEqual([s.atk, s.blk, s.seams.length], [7, 4, 2]);
});

test("rank ties: shorter line, then other total, then roll-off", () => {
  const st = { rng: 1, round: 1, log: [], players: [{ name: "a" }, { name: "b" }, { name: "c" }] };
  assert.deepEqual(rankEntries(st, [{ pid: 0, val: 5, len: 8, other: 1 }, { pid: 1, val: 5, len: 6, other: 1 }, { pid: 2, val: 6, len: 8, other: 0 }]), [2, 1, 0]);
  assert.deepEqual(rankEntries(st, [{ pid: 0, val: 5, len: 6, other: 1 }, { pid: 1, val: 5, len: 6, other: 3 }]), [1, 0]);
  const r = rankEntries(st, [{ pid: 0, val: 5, len: 6, other: 1 }, { pid: 1, val: 5, len: 6, other: 1 }]);
  assert.equal(r.length, 2);
  assert.ok(st.log.some((l) => l.k === "rolloff"));
});

// A hand-made mid-round state, so a resolver can be checked against known numbers.
function fakeState(modeId, res, extra = {}) {
  const st = createGame({ mode: modes[modeId], modifiers: (extra.mods || []).map((id) => modifiers[id]), seats: bots(Object.keys(res).length), seed: "fake" }, data);
  st.round = 1; st.fx = extra.fx ?? null;
  st.rd = st.players.map(() => 0);
  st.res = {};
  for (const [pid, r] of Object.entries(res)) {
    const lines = (r.lines || [{ zone: 0, atk: r.atk, blk: r.blk, len: r.len ?? 6 }]).map((l) => ({ len: 6, cards: [], seams: [], ...l }));
    st.res[pid] = { lines, rolls: [], six: 0, atk: lines.reduce((a, l) => a + l.atk, 0), blk: lines.reduce((a, l) => a + l.blk, 0), len: lines.reduce((a, l) => a + l.len, 0) };
  }
  Object.assign(st, extra.state || {});
  return st;
}
const run = (mod, id, st) => mod.steps.find((s) => s.id === id).run(st, makeCtx(st, data));

test("classic matrix: SRD §5 table and Mugged rotation", () => {
  const st = fakeState("classic", { 0: { atk: 9, blk: 1 }, 1: { atk: 7, blk: 7 }, 2: { atk: 5, blk: 5 }, 3: { atk: 1, blk: 9 } });
  run(matrix, "matrix", st);
  // ATK ranks 0,1,2,3 ; BLK ranks 3,1,2,0
  assert.deepEqual(st.rd, [1, 0, 1, 1]);
  const st2 = fakeState("classic", { 0: { atk: 9, blk: 1 }, 1: { atk: 7, blk: 7 }, 2: { atk: 5, blk: 5 }, 3: { atk: 1, blk: 9 } }, { fx: "rotateAtk" });
  run(matrix, "matrix", st2);
  // ATK order becomes 1,2,3,0
  assert.deepEqual(st2.rd, [2, 0, 1, 0]);
});

test("corners: holder defends with BLK and wins ties; undefended corner falls", () => {
  const st = fakeState("corners", {
    0: { lines: [{ zone: 0, atk: 1, blk: 5 }] },
    1: { lines: [{ zone: 0, atk: 5, blk: 0 }, { zone: 1, atk: 2, blk: 1 }] },
    2: { lines: [{ zone: 2, atk: 0, blk: 4 }] },
  });
  st.zones[0].holder = 0; st.zones[1].holder = 2;
  run(corners, "corners", st);
  assert.equal(st.zones[0].holder, 0, "tie goes to holder");
  assert.equal(st.zones[1].holder, 1, "undefended corner taken");
  assert.equal(st.zones[2].holder, null, "ATK 0 can't take an empty corner");
  assert.deepEqual(st.players.map((p) => p.tracks.rep), [1, 1, 0]);
});

test("hold the block: hits both ways, heal", () => {
  const st = fakeState("hold-the-block", { 0: { atk: 6, blk: 4 }, 1: { atk: 5, blk: 7 }, 2: { atk: 3, blk: 2 } });
  st.zones[0].holder = 0;
  st.players[0].tracks.damage = 3;
  run(holdTheBlock, "blockHits", st);
  assert.deepEqual(st.rd, [1, 0, 1]); // P2 ATK 5 > BLK 4 hits holder; holder ATK 6 > P3 BLK 2
  run(holdTheBlock, "blockHeal", st);
  assert.equal(st.players[0].tracks.damage, 1);
});

test("posted up: highest ATK takes the Spot, rich Spot heals", () => {
  const st = fakeState("posted-up", { 0: { atk: 6, blk: 1 }, 1: { atk: 4, blk: 6 }, 2: { atk: 2, blk: 2 } });
  st.players[0].at = 1; st.players[1].at = 1; st.players[2].at = 2;
  st.zones.forEach((z) => (z.rich = z.i === 1));
  st.players[0].tracks.damage = 2;
  run(postedUp, "takeSpots", st);
  assert.deepEqual(st.zones.map((z) => z.holder), [null, 0, 2]);
  run(postedUp, "richHeal", st);
  assert.equal(st.players[0].tracks.damage, 1);
});

test("cast validation: line limit and hand", () => {
  const st = createGame({ mode: modes.classic, seats: bots(4), seed: "v" }, data);
  const ctx = makeCtx(st, data);
  const hand = st.players[0].hand;
  assert.match(castProblem(st, ctx, 0, { lines: [{ zone: 0, cards: ["HS3-P99"] }], thumbs: [] }), /hand/);
  assert.match(castProblem(st, ctx, 0, { lines: [{ zone: 0, cards: hand.slice(0, 4) }], thumbs: [] }) || "", /at most|limit/);
});

test("every mode and modifier plays to the end, deterministic, replayable", () => {
  for (const mode of Object.values(modes)) {
    const ok = Object.values(modifiers).filter((m) => !modifierProblems(mode, m).length);
    for (const mods of [[], ok]) {
      for (const n of mode.players) {
        const setup = { mode, modifiers: mods, seats: bots(n), seed: `t-${mode.id}-${n}` };
        const a = playOut(setup, data), b = playOut(setup, data);
        assert.equal(JSON.stringify(a), JSON.stringify(b), `${mode.id} deterministic`);
        assert.equal(JSON.stringify(replay(setup, a.actions, data).result), JSON.stringify(a.result), `${mode.id} replay`);
        for (const p of a.players) {
          assert.equal(p.hand.length, 8);
          assert.ok(p.thumbs >= 0 && p.tracks.damage >= 0 && p.tracks.rep >= 0);
        }
        assert.equal(a.result.order.length, n);
      }
    }
  }
});

test("views hide other hands, the rng and secret picks", () => {
  const st = createGame({ mode: modes.classic, seats: bots(4), seed: "view" }, data);
  const hand = st.players[1].hand;
  const r = act(st, data, { pid: st.pending.who[0], value: { lines: [{ zone: 0, cards: [st.players[st.pending.who[0]].hand[0]] }], thumbs: [] } });
  const v = viewFor(r.state, data, 1);
  assert.equal(v.rng, undefined);
  assert.equal(v.players[0].hand, null);
  assert.deepEqual(v.players[1].hand, hand);
  assert.deepEqual(v.pending.answers, {});
});

test("round end records held zones; round summary reports track changes and zones taken", () => {
  const st = fakeState("corners", { 0: { atk: 1, blk: 1 }, 1: { atk: 1, blk: 1 }, 2: { atk: 1, blk: 1 } });
  st.zones[0].holder = 1; st.zones[2].holder = 0;
  st.players[1].tracks.rep = 3;
  run(core, "roundEnd", st);
  assert.deepEqual(st.players.map((p) => p.hist[0].holds), [[st.zones[2].name], [st.zones[0].name], []]);
  // round 2: P3 takes corner 0 from P2, P1 drops corner 2 to nobody, P2 +1 Rep
  st.round = 2;
  st.zones[0].holder = 2; st.zones[2].holder = null;
  st.players[1].tracks.rep = 4;
  run(core, "roundEnd", st);
  const s = roundSummary(st);
  assert.equal(s.round, 2);
  assert.deepEqual(s.items.map((i) => [i.pid, i.kind, i.delta ?? i.zone]), [
    [0, "lose", st.zones[2].name], [1, "rep", 1], [2, "take", st.zones[0].name],
  ]);
  assert.equal(roundSummary(st, 1).text, `Round 1: ${st.players[0].name} took ${st.zones[2].name} · ${st.players[1].name} +3 Rep · ${st.players[1].name} took ${st.zones[0].name}`);
  assert.equal(roundSummary({ ...st, players: st.players.map((p) => ({ ...p, hist: [] })) }), null);
});

// ---------------------------------------------------------------- section B (playtest guesses, see modes/*.md)
const cardsBy = (pred, n) => data.cards.filter(pred).slice(0, n).map((c) => c.id);

test("locations: Laundromat, Subway Grate, Rooftop, Bodega, Old Church, Precinct", () => {
  const water = data.cards.find((c) => c.end === "water" && c.start !== "water");
  const water2 = data.cards.find((c) => c.start === "water" && c.id !== water.id);
  const reveal = core.steps.find((s) => s.id === "reveal");
  const mk = () => {
    const st = createGame({ mode: modes.corners, modifiers: [modifiers.locations], seats: bots(2), seed: "loc" }, data);
    st.limits = { line: 20, maxCards: 3 };
    return st;
  };
  // Laundromat: a water seam gives +2 BLK; Subway Grate: no seam at all
  for (const [loc, dBlk, dLen] of [["laundromat", 1, 0], ["subwayGrate", -1, 1]]) {
    const st = mk();
    st.zones[0].loc = loc;
    const plain = lineStats([water, water2]);
    st.casts = { 0: { lines: [{ zone: 0, cards: [water.id, water2.id] }], thumbs: [] }, 1: { lines: [{ zone: 1, cards: [st.players[1].hand[0]] }], thumbs: [] } };
    st.players[0].hand.push(water.id, water2.id);
    reveal.run(st, makeCtx(st, data));
    assert.equal(st.res[0].lines[0].blk, plain.blk + dBlk, loc);
    assert.equal(st.res[0].lines[0].len, plain.len + dLen, loc);
  }
  const st = mk();
  st.zones[0].loc = "rooftop";
  const h = st.players[0].hand;
  assert.match(castProblem(st, makeCtx(st, data), 0, { lines: [{ zone: 0, cards: h.slice(0, 2) }], thumbs: [] }) || "", /Rooftop/);
  // Bodega pays 2, Old Church gives ties to the challenger, Precinct costs the loser 1 Rep
  const st2 = fakeState("corners", { 0: { lines: [{ zone: 0, atk: 0, blk: 4 }, { zone: 1, atk: 0, blk: 4 }] }, 1: { lines: [{ zone: 0, atk: 4, blk: 0 }, { zone: 1, atk: 4, blk: 0 }, { zone: 2, atk: 1, blk: 0 }] }, 2: { lines: [{ zone: 2, atk: 3, blk: 0 }] } }, { mods: ["locations"] });
  st2.zones[0].loc = "bodega"; st2.zones[1].loc = "oldChurch"; st2.zones[2].loc = "precinct";
  st2.zones[0].holder = 0; st2.zones[1].holder = 0; st2.zones[2].holder = 1;
  st2.players[1].tracks.rep = 3;
  run(corners, "corners", st2);
  assert.deepEqual(st2.zones.slice(0, 3).map((z) => z.holder), [0, 1, 2]);
  assert.deepEqual(st2.players.map((p) => p.tracks.rep), [2, 3, 1]); // P1 Bodega 2; P2 3 −1 lost at the Precinct +1 Old Church; P3 +1
});

test("block corner pays +1; Rep upkeep from the third corner", () => {
  const st = fakeState("corners", { 0: { lines: [{ zone: 0, atk: 3, blk: 3 }, { zone: 1, atk: 3, blk: 3 }, { zone: 2, atk: 3, blk: 3 }] }, 1: { atk: 0, blk: 0, lines: [] } }, { mods: ["block-corner", "rep-upkeep"] });
  assert.equal(st.zones[0].name, "The Block");
  run(corners, "corners", st);
  assert.deepEqual(st.zones.map((z) => z.holder), [0, 0, 0]);
  assert.equal(st.players[0].tracks.rep, 3 + 1 - 1); // 3 corners, +1 Block, −1 upkeep
});

test("open first card: the opened card must lead the line at its corner", () => {
  let st = createGame({ mode: modes.corners, modifiers: [modifiers["open-card"]], seats: bots(2), seed: "open" }, data);
  assert.equal(st.pending.step, "openCard");
  const [a, b] = st.players[0].hand;
  assert.match(act(st, data, { pid: 0, value: { lines: [{ zone: 1, cards: [a, b] }], thumbs: [] } }).error, /exactly 1/);
  st = act(st, data, { pid: 0, value: { lines: [{ zone: 1, cards: [a] }], thumbs: [] } }).state;
  st = act(st, data, { pid: 1, value: botChoice(st, data, 1) }).state;
  assert.equal(st.pending.step, "cast");
  assert.deepEqual(st.open[0], { zone: 1, card: a });
  assert.match(act(st, data, { pid: 0, value: { lines: [{ zone: 1, cards: [b] }], thumbs: [] } }).error, /must lead/);
  assert.equal(act(st, data, { pid: 0, value: { lines: [{ zone: 1, cards: [a] }], thumbs: [] } }).error, undefined);
  assert.equal(castProblem(st, makeCtx(st, data), 1, botChoice(st, data, 1)), null, "bot cast keeps its opened card first");
});

test("run it up: folders skip the ranking and pay 1; one raise doubles the matrix", () => {
  const st = fakeState("classic", { 0: { atk: 9, blk: 1 }, 1: { atk: 7, blk: 7 }, 2: { atk: 5, blk: 5 }, 3: { atk: 1, blk: 9 } }, { mods: ["run-it-up"] });
  const step = runItUp.steps.find((s) => s.id === "runItUp");
  step.apply(st, makeCtx(st, data), { 0: "call", 1: "raise", 2: "call", 3: "fold" });
  assert.equal(st.stake, 2);
  run(matrix, "matrix", st);
  run(runItUp, "foldCost", st);
  // 3-player matrix for P1-P3: ATK ranks 0,1,2 ; BLK ranks 2,0,1 -> [0][2]=1, [1][0]=0, [2][1]=1 ; ×2 ; P4 folded +1
  assert.deepEqual(st.rd, [2, 0, 2, 1]);
});

test("lead card: only the first card of each line is visible during the Run It Up pick, and only then", () => {
  const { data, modes, modifiers } = loadData();
  for (const [ids, hide] of [[["lead-card"], false], [["lead-card-art"], true], [["lead-card", "lead-card-art"], true]]) {
    let st = createGame({ mode: modes.classic, modifiers: ids.map((id) => modifiers[id]), seats: Array.from({ length: 4 }, (_, i) => ({ kind: i ? "bot" : "human" })), seed: "lead" }, data);
    let seen = 0;
    for (let k = 0; !st.over && k < 400; k++) {
      const pid = st.pending.who.find((id) => !(id in st.pending.answers));
      const v = viewFor(st, data, 0);
      if (st.pending.step === "runItUp") {
        seen++;
        assert.deepEqual(Object.keys(v.lead).sort(), ["0", "1", "2", "3"]);
        assert.equal(v.leadHide, hide);
        for (const [id, c] of Object.entries(v.lead)) assert.equal(c, st.casts[id].lines[0].cards[0], "the lead card is the first card of the line");
        assert.deepEqual(Object.keys(v.casts), ["0"], "other casts stay hidden");
      } else assert.equal(v.lead, undefined, `no lead outside the pick (${st.pending.step})`);
      st = act(st, data, { pid, value: botChoice(st, data, pid) }).state;
    }
    assert.ok(seen >= 4, "ran through the Run It Up pick every round");
  }
  // off by default and for other modes
  const plain = createGame({ mode: modes.classic, modifiers: [modifiers["run-it-up"]], seats: Array.from({ length: 4 }, () => ({ kind: "bot" })), seed: "lead" }, data);
  assert.equal(viewFor(plain, data, 0).lead, undefined);
  assert.ok(modifierProblems(modes.corners, modifiers["lead-card"]).length, "Classic only");
});

test("wheel cooldown: a sector sits out the next 3 spins; 0 turns it off", () => {
  for (let g = 0; g < 40; g++) {
    const st = playOut({ mode: modes.classic, seats: bots(4), seed: `cool-${g}` }, data);
    const spins = st.log.filter((e) => e.k === "wheel").map((e) => e.id);
    assert.equal(spins.length, 8);
    spins.forEach((id, i) => assert.ok(!spins.slice(Math.max(0, i - 3), i).includes(id), `${spins} at ${i}`));
  }
  let repeats = 0;
  for (let g = 0; g < 40; g++) {
    const spins = playOut({ mode: modes.classic, modifiers: [modifiers["wheel-no-cooldown"]], seats: bots(4), seed: `cool-${g}` }, data)
      .log.filter((e) => e.k === "wheel").map((e) => e.id);
    repeats += spins.some((id, i) => i && spins[i - 1] === id) ? 1 : 0;
  }
  assert.ok(repeats > 0, "without cooldown, back-to-back repeats happen");
});
