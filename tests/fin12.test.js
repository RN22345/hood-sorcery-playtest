// FIN-12 (D-39, D-42): Contraband in Classic, and the optional character cards (Classic and Corners).
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createGame, act, viewFor, replay, makeCtx, botChoice } from "../engine/game.js";
import { playOut } from "../engine/run.js";
import { castProblem, limitsFor, immune } from "../engine/cast.js";
import { rankEntries } from "../engine/rank.js";
import matrix, { rotate, rotateExcept } from "../engine/modules/matrix.js";
import core from "../engine/modules/core.js";
import contraband, { ITEMS, ITEM_IDS, CLASSIC, itemDef } from "../engine/modules/contraband.js";
import characters, { CHARACTERS, CHARACTER_IDS, isLast } from "../engine/modules/characters.js";
import { loadData } from "../engine/load-node.js";

const { data, modes, modifiers } = loadData();
const bots = (n) => Array.from({ length: n }, () => ({ kind: "bot" }));
const mk = (mods, { mode = "classic", n = 4, seed = "f12" } = {}) =>
  createGame({ mode: modes[mode], modifiers: mods.map((id) => modifiers[id]), seats: bots(n), seed }, data);
const step = (mod, id) => mod.steps.find((s) => s.id === id);
const line = (zone, atk, blk, len = 6) => ({ zone, atk, blk, len, cards: [], seams: [] });
// a Classic state right after the flip: totals set by hand, then the matrix and settle steps run for real
function classicRes(mods, totals, { fx = null, used = {}, dmg = null } = {}) {
  const st = mk(mods, { n: totals.length, seed: "res" });
  st.round = 1; st.fx = fx; st.rd = st.players.map(() => 0); st.res = {}; st.used = used;
  totals.forEach(([atk, blk, len = 6], pid) => { st.res[pid] = { lines: [line(0, atk, blk, len)], rolls: [], six: 0, atk, blk, len }; });
  if (dmg) st.players.forEach((p, i) => (p.tracks.damage = dmg[i]));
  return st;
}
const resolve = (st) => { const ctx = makeCtx(st, data); step(matrix, "matrix").run(st, ctx); step(core, "settle").run(st, ctx); return st; };
const dmgs = (st) => st.players.map((p) => p.tracks.damage);

// ------------------------------------------------------------------------------------------ neutral hooks
test("neutral: rankEntries without `win`, rotateExcept with nobody immune, and every recorded vector replays", () => {
  const st = mk([]);
  const e = [{ pid: 0, val: 5, len: 6, other: 3 }, { pid: 1, val: 5, len: 6, other: 3 }, { pid: 2, val: 7, len: 6, other: 1 }];
  const a = structuredClone(st), b = structuredClone(st);
  assert.deepEqual(rankEntries(a, e), rankEntries(b, e.map((x) => ({ ...x, win: 0 }))));
  assert.equal(a.rng, b.rng, "same roll-offs");
  assert.deepEqual(rankEntries(structuredClone(st), [...e.slice(0, 2).map((x, i) => ({ ...x, win: i })), e[2]]), [2, 1, 0], "the flagged tie wins without a roll-off");
  assert.deepEqual(rotateExcept([0, 1, 2, 3], []), rotate([0, 1, 2, 3]));
  assert.deepEqual(rotateExcept([0, 1, 2, 3], [0]), [0, 2, 3, 1]);
  assert.deepEqual(rotateExcept([0, 1, 2, 3], [1]), [2, 1, 3, 0]);
  // every vector (old and new) replays to its recorded wheel, scores and order
  const dir = new URL("./vectors/", import.meta.url);
  let n = 0;
  for (const f of readdirSync(dir)) {
    const v = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    const setup = { ...v.setup, mode: modes[v.setup.mode], modifiers: v.setup.modifiers.map((id) => modifiers[id]) };
    const end = replay(setup, v.actions, data);
    assert.deepEqual(end.log.filter((x) => x.k === "wheel").map((x) => x.id), v.expect.wheel, v.id);
    assert.deepEqual(end.result.scores, v.expect.scores, v.id);
    assert.deepEqual(end.result.order, v.expect.order, v.id);
    n++;
  }
  assert.ok(n >= 316, `${n} vectors`);
});

// ------------------------------------------------------------------------------------------ Contraband in Classic
test("commonality: 8 of 12 items are word for word in Classic; the 4 that change keep name and pick type", () => {
  const changedText = ITEM_IDS.filter((id) => itemDef(id, "classic").text !== ITEMS[id].text);
  assert.deepEqual(changedText.sort(), ["fakeId", "getawayCar", "snitch", "sprayCan"]);
  for (const id of ITEM_IDS) {
    assert.equal(itemDef(id, "classic").name, ITEMS[id].name);
    assert.equal(itemDef(id, "corners"), ITEMS[id], "Corners = the base entry");
    assert.notEqual(itemDef(id, "classic").needs, "zone", `${id}: Classic has one line, no corner to pick`);
  }
  assert.equal(itemDef("snitch", "classic").needs, "rival");
  assert.ok(Object.keys(CLASSIC).every((id) => ITEMS[id]));
  const st = mk(["contraband"]);
  assert.equal(new Set(Object.values(st.items).flat()).size, 8, "Classic deals from all 12, no repeats");
  const spec = viewFor(st, data, 0).choice;
  assert.equal(spec.type, "cast");
  for (const it of spec.items) assert.equal(it.text, itemDef(it.id, "classic").text, "the tray shows the Classic text");
});

test("Classic: Brass Knuckles / Kevlar Hoodie need no corner; validation still checks ownership and the rival", () => {
  const st = mk(["contraband"]);
  const ctx = makeCtx(st, data);
  st.items[0] = ["brassKnuckles", "snitch"];
  const cast = { lines: [{ zone: 0, cards: [st.players[0].hand[0]] }], thumbs: [] };
  assert.equal(castProblem(st, ctx, 0, { ...cast, item: { id: "brassKnuckles" } }), null);
  assert.match(castProblem(st, ctx, 0, { ...cast, item: { id: "snitch" } }), /name a rival/);
  assert.equal(castProblem(st, ctx, 0, { ...cast, item: { id: "snitch", target: 2 } }), null);
  assert.match(castProblem(st, ctx, 0, { ...cast, item: { id: "kevlarHoodie" } }), /don't have/);
  st.used = { 0: { id: "brassKnuckles" } };
  const ln = line(0, 3, 3);
  contraband.adjustLine(st, ctx, 0, ln);
  assert.deepEqual([ln.atk, ln.blk], [5, 3]);
});

test("Classic: Fake ID swaps ATK and BLK after the Thumbs; nothing in Corners", () => {
  const st = mk(["contraband"]);
  st.used = { 1: { id: "fakeId" } };
  const lines = [line(0, 9, 2)];
  contraband.adjustRolled(st, makeCtx(st, data), 1, lines);
  assert.deepEqual([lines[0].atk, lines[0].blk], [2, 9]);
  const c = mk(["contraband"], { mode: "corners" });
  c.used = { 1: { id: "fakeId", zone: 0 } };
  const cl = [line(0, 9, 2)];
  contraband.adjustRolled(c, makeCtx(c, data), 1, cl);
  assert.deepEqual([cl[0].atk, cl[0].blk], [9, 2]);
});

test("Classic: Smoke Bomb wins rank ties on ATK and BLK (no roll-off)", () => {
  // P0 and P1 tie on everything; P1 plays the Smoke Bomb
  const st = resolve(classicRes(["contraband"], [[6, 6], [6, 6], [2, 2], [1, 1]], { used: { 1: { id: "smokeBomb" } } }));
  assert.deepEqual(st.ranks.atk.slice(0, 2), [1, 0]);
  assert.deepEqual(st.ranks.blk.slice(0, 2), [1, 0]);
  assert.ok(!st.log.some((e) => e.k === "rolloff"));
});

test("Classic: Bribe sits out Mugged / Sabotage (the rest rotate around it) and Bleeding", () => {
  const mug = resolve(classicRes(["contraband"], [[9, 9], [7, 7], [5, 5], [3, 3]], { fx: "rotateAtk", used: { 0: { id: "bribe" } } }));
  assert.deepEqual(mug.ranks.atk, [0, 2, 3, 1], "1st keeps its place; the others rotate");
  assert.ok(mug.log.some((e) => e.k === "immune"));
  const plain = resolve(classicRes(["contraband"], [[9, 9], [7, 7], [5, 5], [3, 3]], { fx: "rotateAtk" }));
  assert.deepEqual(plain.ranks.atk, [1, 2, 3, 0]);
  const bleed = resolve(classicRes(["contraband"], [[9, 9], [7, 7], [5, 5], [3, 3]], { fx: "bleeding", used: { 3: { id: "bribe" } } }));
  assert.equal(bleed.players[3].tracks.damage, 2, "matrix 2, no Bleeding +2");
  const bleed0 = resolve(classicRes(["contraband"], [[9, 9], [7, 7], [5, 5], [3, 3]], { fx: "bleeding" }));
  assert.equal(bleed0.players[3].tracks.damage, 4);
  const st = mk(["contraband"]);
  st.used = { 2: { id: "bribe" } };
  for (const fx of ["cuffed", "bleeding", "rotateAtk", "rotateBlk"]) assert.ok(immune(st, makeCtx(st, data), 2, fx), fx);
  assert.ok(!immune(st, makeCtx(st, data), 2, "swapPass"));
});

test("Classic: Snitch +1 per ranking the named rival tops; Getaway Car −1 from 2+; Spray Can cuts then heals", () => {
  const sn = resolve(classicRes(["contraband"], [[9, 9], [7, 7], [5, 5], [3, 3]], { used: { 3: { id: "snitch", target: 0 } } }));
  assert.equal(sn.players[0].tracks.damage, 2, "tops both: 0 + 2");
  const ga = resolve(classicRes(["contraband"], [[9, 9], [7, 7], [5, 5], [3, 3]], { used: { 3: { id: "getawayCar" }, 1: { id: "getawayCar" } } }));
  assert.deepEqual(dmgs(ga), [0, 0, 1, 1], "4th: 2 → 1; 2nd takes 0 anyway");
  assert.ok(ga.log.some((e) => /wasn't needed/.test(e.text)));
  const sp = resolve(classicRes(["contraband"], [[9, 9], [7, 7], [5, 5], [3, 3]], { used: { 0: { id: "sprayCan" } }, dmg: [3, 0, 0, 0] }));
  assert.equal(sp.players[0].tracks.damage, 1, "tops both, takes 0: heals 2");
  const sp2 = resolve(classicRes(["contraband"], [[9, 1], [7, 7], [5, 5], [3, 3]], { used: { 0: { id: "sprayCan" } }, dmg: [0, 0, 0, 0] }));
  assert.equal(sp2.players[0].tracks.damage, 0, "1st ATK, 4th BLK = 1 damage, cut by the tag");
  assert.ok(sp2.log.some((e) => /Spray Can/.test(e.text) && e.d === undefined), "a cut only: no track delta on the item line");
  assert.ok(sp.log.some((e) => e.k === "heal" && e.d === -2), "a heal carries the track delta");
});

test("Classic bots play items, and Corners bots still pick exactly as before (vector test covers the bytes)", () => {
  const seen = new Set();
  for (let g = 0; g < 60; g++) {
    const st = playOut({ mode: modes.classic, modifiers: [modifiers.contraband], seats: bots(4), seed: `cb-${g}` }, data);
    for (const e of st.log) if (e.k === "item") { if (e.item) seen.add(e.item); if (/Lucky Charm/.test(e.text)) seen.add("luckyCharm"); }
  }
  for (const id of ITEM_IDS) assert.ok(seen.has(id), `bots never played ${id}`);
});

// ------------------------------------------------------------------------------------------ character cards
test("characters: 8 cards, 2 distinct per crew, one kept at the same time; offers hidden, picks public after", () => {
  assert.equal(CHARACTER_IDS.length, 8);
  for (const mode of ["classic", "corners"]) {
    let st = mk(["characters"], { mode });
    assert.equal(st.pending.step, "charPick", "asked before the first spin");
    assert.ok(!st.log.some((e) => e.k === "wheel"));
    const all = Object.values(st.chars.offer).flat();
    assert.equal(new Set(all).size, 8);
    const v0 = viewFor(st, data, 0);
    assert.deepEqual(Object.keys(v0.chars.offer), ["0"], "only your own offer");
    assert.equal(v0.choice.options.length, 2);
    assert.match(act(st, data, { pid: 0, value: st.chars.offer[1][0] }).error, /Pick one/);
    st = act(st, data, { pid: 0, value: st.chars.offer[0][1] }).state;
    assert.deepEqual(viewFor(st, data, 1).chars.pick, {}, "your pick stays hidden until all have picked");
    for (const pid of [1, 2, 3]) st = act(st, data, { pid, value: botChoice(st, data, pid) }).state;
    assert.ok(st.chars.done);
    assert.equal(viewFor(st, data, 2).chars.pick[0], st.chars.offer[0][1]);
    assert.ok(st.log.some((e) => e.k === "chars"));
    assert.equal(st.pending.step, "cast");
  }
  const one = createGame({ mode: modes.classic, modifiers: [{ ...modifiers.characters, params: { charDeal: 1 } }], seats: bots(3), seed: "deal1" }, data);
  assert.ok(one.chars.done && Object.keys(one.chars.pick).length === 3 && one.pending.step === "cast", "charDeal 1: dealt, no pick");
});

function charState(mode, card, castLines) {
  const st = mk(["characters"], { mode });
  st.chars = { offer: {}, pick: { 0: card }, done: true };
  st.casts = { 0: { lines: castLines, thumbs: [] } };
  return st;
}
const byElem = (e, notElem = []) => data.cards.filter((c) => (c.start === e || c.end === e) && !notElem.some((n) => c.start === n || c.end === n)).map((c) => c.id);

test("characters: element cards need 2+ cards of the element in one line (+1 ATK +1 BLK there); Tailor doubles the first seam", () => {
  const fire = byElem("fire", ["water"]), noFire = byElem("water", ["fire"]);
  const st = charState("corners", "arsonist", [{ zone: 0, cards: [fire[0], noFire[0]] }, { zone: 1, cards: [fire[1], fire[2]] }]);
  const ctx = makeCtx(st, data);
  const l0 = { zone: 0, atk: 1, blk: 1 }, l1 = { zone: 1, atk: 1, blk: 1 };
  characters.adjustLine(st, ctx, 0, l0); characters.adjustLine(st, ctx, 0, l1);
  assert.deepEqual([l0.atk, l0.blk, l1.atk, l1.blk], [1, 1, 2, 2], "only the line with two Fire cards");
  const one = charState("classic", "arsonist", [{ zone: 0, cards: [fire[0], noFire[0], noFire[1]] }]);
  const ln = { zone: 0, atk: 1, blk: 1 };
  characters.adjustLine(one, makeCtx(one, data), 0, ln);
  assert.deepEqual([ln.atk, ln.blk], [1, 1], "one Fire card is not enough");
  // Tailor: a seam card pair (end of the first = start of the second)
  const a = data.cards.find((c) => c.end === "earth"), b = data.cards.find((c) => c.start === "earth" && c.id !== a.id);
  const t = charState("classic", "tailor", [{ zone: 0, cards: [a.id, b.id] }]);
  const tl = { zone: 0, atk: 0, blk: 0 };
  characters.adjustLine(t, makeCtx(t, data), 0, tl);
  assert.deepEqual([tl.atk, tl.blk], [0, 1], "an Earth seam is a BLK seam: +1 more");
});

test("characters: Big Hands +1 card, Underdog when last (ties count, from round 2), Loaded Dice +1 Thumb and rolls twice", () => {
  const st = charState("classic", "bigHands", []);
  const lim = limitsFor(st, makeCtx(st, data), 0);
  assert.deepEqual([lim.maxCards, lim.line], [st.limits.maxCards + 1, st.limits.line]);
  assert.equal(limitsFor(st, makeCtx(st, data), 1), st.limits, "others unchanged");
  const u = charState("classic", "underdog", [{ zone: 0, cards: [data.cards[0].id] }]);
  const uctx = makeCtx(u, data);
  u.round = 1;
  assert.equal(isLast(u, uctx, 0), false, "round 1: nobody");
  u.round = 2;
  assert.equal(isLast(u, uctx, 0), true, "round 2, everyone on 0: tied for last counts");
  u.players[1].tracks.damage = 1;
  assert.equal(isLast(u, uctx, 0), false);
  u.players[0].tracks.damage = 3;
  const ul = { zone: 0, atk: 2, blk: 2 };
  characters.adjustLine(u, uctx, 0, ul);
  assert.deepEqual([ul.atk, ul.blk], [3, 3]);
  const c = charState("corners", "underdog", []);
  c.round = 3; c.players.forEach((p, i) => (p.tracks.rep = [0, 2, 2, 1][i]));
  assert.equal(isLast(c, makeCtx(c, data), 0), true, "Corners: least Rep");
  const d = charState("classic", "loadedDice", []);
  const before = d.rng;
  const r = characters.thumbRoll(d, makeCtx(d, data), 0, 2);
  assert.ok(r >= 2 && d.rng !== before, "one more game-rng roll, the higher kept");
  assert.equal(characters.thumbRoll(d, makeCtx(d, data), 1, 2), 2, "only the holder");
  const g = createGame({ mode: modes.classic, modifiers: [{ ...modifiers.characters, params: { charDeal: 1 } }], seats: bots(4), seed: "ld" }, data);
  for (const p of g.players) assert.equal(p.thumbs, g.mode.params.thumbs + (g.chars.pick[p.id] === "loadedDice" ? 1 : 0));
});

// ------------------------------------------------------------------------------------------ whole games
test("200 seeded bot games each: Classic + Contraband, characters in both modes, both together; replay exactly", () => {
  const sets = [["classic", ["contraband"]], ["classic", ["characters"]], ["corners", ["characters"]], ["classic", ["contraband", "characters"]], ["corners", ["contraband", "characters"]]];
  for (const [mode, ids] of sets) {
    const picked = {};
    for (let g = 0; g < 200; g++) {
      const n = 2 + (g % 3);
      const setup = { mode: modes[mode], modifiers: ids.map((id) => modifiers[id]), seats: bots(n), seed: `f12-${g}` };
      const st = playOut(setup, data);
      assert.ok(st.over, `${mode} ${ids} game ${g}`);
      if (g % 40 === 0) assert.deepEqual(replay(setup, st.actions, data).result, st.result);
      for (const id of Object.values(st.chars?.pick || {})) picked[id] = (picked[id] || 0) + 1;
    }
    if (ids.includes("characters")) for (const id of CHARACTER_IDS) assert.ok(picked[id] > 4, `${mode}: bots keep ${id} sometimes (${picked[id]})`);
  }
});

test("views never leak another crew's items or unkept character cards", () => {
  let st = mk(["contraband", "characters"], { seed: "leak" });
  for (let i = 0; i < 40 && !st.over; i++) {
    for (let pid = 0; pid < 4; pid++) {
      const v = viewFor(st, data, pid);
      assert.deepEqual(Object.keys(v.items), [String(pid)]);
      assert.deepEqual(Object.keys(v.chars.offer), [String(pid)]);
      if (!st.revealed) assert.deepEqual(Object.keys(v.casts).filter((id) => +id !== pid), []);
    }
    const who = st.pending.who.find((id) => !(id in st.pending.answers));
    st = act(st, data, { pid: who, value: botChoice(st, data, who) }).state;
  }
});
