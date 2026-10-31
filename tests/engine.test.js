// Run: node --test tests/
// These checks double as the first "test vectors" for the Unity port: same inputs, same outputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineStats } from "../engine/line.js";
import { rankEntries } from "../engine/rank.js";
import { createGame, act, viewFor, replay, makeCtx } from "../engine/game.js";
import { playOut } from "../engine/run.js";
import { castProblem } from "../engine/cast.js";
import { loadData } from "../engine/load-node.js";
import matrix from "../engine/modules/matrix.js";
import corners from "../engine/modules/corners.js";
import holdTheBlock from "../engine/modules/holdTheBlock.js";
import postedUp from "../engine/modules/postedUp.js";

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
  const st = createGame({ mode: modes[modeId], seats: bots(Object.keys(res).length), seed: "fake" }, data);
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
    const ok = Object.values(modifiers).filter((m) => !(m.requires?.track && m.requires.track !== mode.win.track) && (m.requires?.modules || []).every((id) => mode.modules.includes(id)));
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
