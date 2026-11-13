// The three experiments (GP3_OVERHAUL_PLAN.md §0, §4a): The Plug, Turf Perks, Contraband, and the engine hooks they use.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, act, viewFor, replay, makeCtx, botChoice } from "../engine/game.js";
import { playOut } from "../engine/run.js";
import { castProblem, cleanCast, limitsFor, immune } from "../engine/cast.js";
import { modifierProblems, MODULES } from "../engine/registry.js";
import { lineStats } from "../engine/line.js";
import core, { applyLimits, spinWheel } from "../engine/modules/core.js";
import corners from "../engine/modules/corners.js";
import respin from "../engine/modules/respin.js";
import plug from "../engine/modules/plug.js";
import turfPerks from "../engine/modules/turfPerks.js";
import contraband, { ITEMS, ITEM_IDS } from "../engine/modules/contraband.js";
import { loadData } from "../engine/load-node.js";

const { data, modes, modifiers } = loadData();
const bots = (n) => Array.from({ length: n }, () => ({ kind: "bot" }));
const mk = (mods, { mode = "corners", n = 4, seed = "x" } = {}) =>
  createGame({ mode: modes[mode], modifiers: mods.map((id) => modifiers[id]), seats: bots(n), seed }, data);
const step = (mod, id) => mod.steps.find((s) => s.id === id);
const run = (mod, id, st) => step(mod, id).run(st, makeCtx(st, data));
const apply = (mod, id, st, answers) => step(mod, id).apply(st, makeCtx(st, data), answers);
const line = (zone, atk, blk, len = 6) => ({ zone, atk, blk, len, cards: [], seams: [] });
// a hand-made mid-round state (like fakeState in engine.test.js): lines already revealed
function resState(mods, res, extra = {}) {
  const st = mk(mods, { n: Object.keys(res).length, seed: "res" });
  st.round = 1; st.fx = extra.fx ?? null; st.rd = st.players.map(() => 0); st.res = {};
  for (const [pid, lines] of Object.entries(res)) {
    st.res[pid] = { lines, rolls: [], six: 0, atk: lines.reduce((a, l) => a + l.atk, 0), blk: lines.reduce((a, l) => a + l.blk, 0), len: lines.reduce((a, l) => a + l.len, 0) };
  }
  for (const z of st.zones) z.holder = null;
  Object.assign(st, extra.state || {});
  return st;
}
const reps = (st) => st.players.map((p) => p.tracks.rep);

// ------------------------------------------------------------------------------------------ hooks stay neutral
test("hooks are neutral: a game without experiments carries none of their state", () => {
  const st = playOut({ mode: modes.corners, modifiers: [modifiers.locations, modifiers["open-card"]], seats: bots(4), seed: "neutral" }, data);
  for (const key of ["usedOut", "plug", "plugLost", "perks", "look", "items", "used", "confessed"]) assert.ok(!(key in st), key);
  assert.ok(!st.log.some((e) => ["respin", "plug", "plugPick", "perk", "perks", "item", "immune"].includes(e.k)));
  const g = mk([]);
  assert.equal(limitsFor(g, makeCtx(g, data), 0), g.limits, "the same limits object when nothing changes");
  assert.deepEqual(cleanCast({ lines: [{ zone: 0, cards: ["a"] }], thumbs: [] }), { lines: [{ zone: 0, cards: ["a"] }], thumbs: [] });
  assert.equal("item" in cleanCast({ lines: [], thumbs: [] }), false);
  assert.deepEqual(cleanCast({ lines: [], thumbs: [], item: { id: "snitch", target: 1 } }).item, { id: "snitch", target: 1 });
});

test("requires: Turf Perks is Corners; Plug, Contraband, characters Corners or Classic; never with the physical deck", () => {
  const m = modifiers;
  for (const id of ["the-plug", "contraband", "characters"]) {
    assert.deepEqual(modifierProblems(modes.corners, m[id]), [], id);
    assert.deepEqual(modifierProblems(modes.classic, m[id]), [], id); // FIN-12 / D-42: Contraband in both modes
    assert.ok(modifierProblems(modes["hold-the-block"], m[id]).length, id);
    assert.ok(modifierProblems(modes["posted-up"], m[id]).length, id);
  }
  for (const id of ["turf-perks", "contraband", "characters"]) {
    assert.deepEqual(modifierProblems(modes.corners, m[id]), [], id);
    assert.ok(modifierProblems(modes.corners, m[id], [m["physical-deck"]]).length, id + " excludes the physical deck");
  }
  assert.ok(modifierProblems(modes.classic, m["turf-perks"]).length);
  assert.throws(() => mk(["the-plug", "physical-deck"]), /physical/i);
  assert.ok(mk(["turf-perks"]).mode.modules.includes("locations"), "Turf Perks pulls in locations");
  for (const id of ["the-plug", "turf-perks", "contraband"]) assert.equal(modifiers[id].group, "experiment");
});

// ------------------------------------------------------------------------------------------ re-spin
test("spinWheel: a re-spin replaces this round's history entry and can't land the same sector", () => {
  for (let g = 0; g < 30; g++) {
    const st = mk(["contraband"], { seed: `spin-${g}` });
    const ctx = makeCtx(st, data);
    const first = st.wheel, hist = [...st.wheelHist];
    spinWheel(st, ctx, { respin: true });
    assert.notEqual(st.wheel, first);
    assert.equal(st.wheelHist.length, hist.length);
    assert.equal(st.wheelHist.at(-1), st.wheel, "history holds the re-spin, not the first sector");
    assert.ok(!st.wheelHist.slice(-4, -1).includes(st.wheel), "cooldown still holds");
    assert.deepEqual(st.log.filter((e) => e.k === "wheel").length, 1);
    assert.equal(st.log.at(-1).k, "respin");
    assert.equal(st.log.at(-1).id, st.wheel);
  }
});

test("respin step: Lucky Charm and Confession, one re-spin a round, Lucky Charm first, Confession once a game", () => {
  const st = mk(["turf-perks", "contraband"], { seed: "respin" });
  const ctx = makeCtx(st, data);
  st.items[0] = ["luckyCharm", "fakeId"]; st.items[1] = ["luckyCharm"]; st.items[2] = []; st.items[3] = []; st.used = {};
  st.perks = { oldChurch: 2 };
  const opts = (pid) => step(respin, "respin").spec(st, ctx, pid).options.map((o) => o.value);
  assert.deepEqual(opts(0), ["keep", "luckyCharm"]);
  assert.deepEqual(opts(2), ["keep", "confession"]);
  assert.deepEqual(opts(3), ["keep"]);
  assert.match(step(respin, "respin").validate(st, ctx, 3, "luckyCharm"), /can't/);
  // P2 (Confession) and P1 (Lucky Charm) both ask: the Lucky Charm goes first, the Confession stays unspent
  const was = st.wheel;
  step(respin, "respin").apply(st, ctx, { 0: "keep", 1: "luckyCharm", 2: "confession", 3: "keep" });
  assert.notEqual(st.wheel, was);
  assert.deepEqual(st.items[1], []);
  assert.deepEqual(st.used[1], { id: "luckyCharm" });
  assert.equal(st.confessed?.[2], undefined, "Confession not spent");
  // Confession alone is used and can't be used twice
  step(respin, "respin").apply(st, ctx, { 0: "keep", 1: "keep", 2: "confession", 3: "keep" });
  assert.equal(st.confessed[2], true);
  assert.deepEqual(opts(2), ["keep"], "once per game");
  // a crew that already used an item this round can't play Lucky Charm
  st.used[0] = { id: "sprayCan" };
  assert.deepEqual(opts(0), ["keep"]);
});

// ------------------------------------------------------------------------------------------ The Plug
test("The Plug (Corners): 4 face up after the used cards leave, lowest Rep picks first, ties by contests lost then roll-off", () => {
  let st = mk(["the-plug"], { seed: "plug" });
  const ctx = makeCtx(st, data);
  // finish round 1 up to the refill by hand
  st.round = 1;
  st.casts = Object.fromEntries(st.players.map((p) => [p.id, { lines: [{ zone: 0, cards: [p.hand[0]] }], thumbs: [] }]));
  st.players.forEach((p, i) => { p.tracks.rep = [2, 0, 0, 5][i]; });
  st.plugLost = { 1: 2, 2: 1 };
  const deckBefore = st.deck.length;
  run(plug, "plugReveal", st);
  assert.equal(st.plug.cards.length, 4);
  assert.equal(st.deck.length, deckBefore - 4);
  assert.ok(st.players.every((p) => p.hand.length === 7), "used cards left the hands first");
  assert.equal(st.usedOut, true);
  assert.deepEqual(st.plug.order, [1, 2, 0, 3], "Rep 0 (more lost first), Rep 0, Rep 2, Rep 5");
  // picks in order, one choice at a time
  const pending = (s) => ({ step: "plugPick", who: step(plug, "plugPick").who(s, ctx), answers: {} });
  assert.deepEqual(pending(st).who, [1]);
  const take = st.plug.cards[1];
  assert.match(step(plug, "plugPick").validate(st, ctx, 1, "HS3-NOPE"), /isn't on the Plug/);
  assert.equal(step(plug, "plugPick").apply(st, ctx, { 1: take }), "repeat");
  assert.ok(st.players[1].hand.includes(take));
  assert.equal(st.plug.cards.length, 3);
  assert.deepEqual(pending(st).who, [2]);
  step(plug, "plugPick").apply(st, ctx, { 2: "pass" });
  step(plug, "plugPick").apply(st, ctx, { 0: "pass" });
  assert.equal(step(plug, "plugPick").apply(st, ctx, { 3: "pass" }), undefined, "after the last crew the step is done");
  assert.equal(st.plug.cards.length, 0);
  assert.equal(st.discard.length, 4 + 3 , "4 used cards + 3 unpicked go to the discard");
  // then the core refill draws blind up to 8 and does not discard twice
  run(core, "refill", st);
  assert.ok(st.players.every((p) => p.hand.length === 8));
  assert.equal(st.usedOut, undefined);
  assert.equal(st.discard.length, 7);
});

test("The Plug (Classic): most damage picks first; the last round has no market", () => {
  const st = mk(["the-plug"], { mode: "classic", seed: "plugc" });
  st.round = 1;
  st.casts = Object.fromEntries(st.players.map((p) => [p.id, { lines: [{ zone: 0, cards: [p.hand[0]] }], thumbs: [] }]));
  st.players.forEach((p, i) => { p.tracks.damage = [1, 4, 4, 0][i]; });
  st.rd = [0, 1, 2, 0];
  run(plug, "plugReveal", st);
  assert.deepEqual(st.plug.order, [2, 1, 0, 3], "damage 4 (more this round first), damage 4, 1, 0");
  const last = mk(["the-plug"], { mode: "classic", seed: "plugc2" });
  last.round = last.mode.params.rounds;
  assert.equal(step(plug, "plugReveal").when(last, makeCtx(last, data)), false);
  assert.equal(step(plug, "plugPick").when(last, makeCtx(last, data)), false);
});

test("The Plug: afterContests counts contests lost after Mugged, bots take a card only if it helps", () => {
  const st = resState(["the-plug"], { 0: [line(0, 6, 0)], 1: [line(0, 0, 4)], 2: [line(1, 3, 0), line(0, 2, 0)] });
  st.zones[0].holder = 1;
  run(corners, "corners", st);
  assert.equal(st.plugLost[1], 1, "the old holder lost its contest");
  assert.equal(st.plugLost[2], 1, "so did the second challenger");
  assert.equal(st.plugLost[0] ?? 0, 0);
  // a bot passes when nothing on the Plug beats what it holds
  const g = mk(["the-plug"], { seed: "plugbot" });
  g.round = 1; g.plug = { cards: [], order: [0], i: 0, picks: [] };
  assert.equal(step(plug, "plugPick").bot(g, makeCtx(g, data), 0), "pass");
});

// ------------------------------------------------------------------------------------------ Turf Perks
test("Turf Perks: the holder at the start of the round gets the perk; Bodega has none", () => {
  const st = mk(["turf-perks"], { seed: "perks" });
  st.zones.forEach((z, i) => { z.loc = ["laundromat", "bodega", "oldChurch"][i]; z.holder = null; });
  st.zones[0].holder = 2; st.zones[1].holder = 1; st.zones[2].holder = 3;
  run(turfPerks, "perkSnapshot", st);
  assert.deepEqual(st.perks, { laundromat: 2, oldChurch: 3 });
  assert.match(st.log.at(-1).text, /Perks this round/);
});

test("Turf Perks: Wash puts a hand card on the bottom of the deck (after the used cards left)", () => {
  const st = mk(["turf-perks"], { seed: "wash" });
  const ctx = makeCtx(st, data);
  st.round = 1; st.perks = { laundromat: 1 };
  st.casts = Object.fromEntries(st.players.map((p) => [p.id, { lines: [{ zone: 0, cards: [p.hand[0]] }], thumbs: [] }]));
  assert.deepEqual(step(turfPerks, "wash").who(st, ctx), [1]);
  run(turfPerks, "washPrep", st);
  assert.equal(st.players[1].hand.length, 7);
  const c = st.players[1].hand[3];
  assert.match(step(turfPerks, "wash").validate(st, ctx, 1, "HS3-NOPE"), /isn't in your hand/);
  apply(turfPerks, "wash", st, { 1: c });
  assert.equal(st.deck.at(-1), c);
  assert.ok(!st.players[1].hand.includes(c));
  run(core, "refill", st);
  assert.equal(st.players[1].hand.length, 8);
  assert.ok(!st.players[1].hand.includes(c) || st.deck.length === 0, "the washed card is the last to be drawn");
  const none = mk(["turf-perks"], { seed: "wash2" }); none.round = none.mode.params.rounds; none.perks = { laundromat: 0 };
  assert.equal(step(turfPerks, "wash").when(none, makeCtx(none, data)), false, "no Wash in the last round");
});

test("Turf Perks: Lookout shows the looker one rival's hand, and nobody else", () => {
  const st = mk(["turf-perks"], { seed: "look" });
  st.perks = { rooftop: 0 };
  const ctx = makeCtx(st, data);
  assert.deepEqual(step(turfPerks, "lookout").who(st, ctx), [0]);
  assert.match(step(turfPerks, "lookout").validate(st, ctx, 0, 0), /rival/);
  apply(turfPerks, "lookout", st, { 0: 2 });
  assert.deepEqual(st.look.hand, st.players[2].hand);
  assert.deepEqual(viewFor(st, data, 0).look, { pid: 0, target: 2, hand: st.players[2].hand });
  for (const other of [1, 2, 3]) assert.deepEqual(viewFor(st, data, other).look, { pid: 0, target: 2 }, "others only learn who looked at whom");
  assert.equal(viewFor(st, data, null).look.hand, undefined);
});

test("Turf Perks: Badge shrugs off Cuffed and Mugged, Back Way is +1 finger, Confession re-spins once", () => {
  const st = mk(["turf-perks"], { seed: "badge" });
  const ctx = makeCtx(st, data);
  st.perks = { precinct: 0, subwayGrate: 1, oldChurch: 2 };
  st.fx = "cuffed"; applyLimits(st, ctx);
  assert.equal(st.limits.line, 6);
  assert.equal(limitsFor(st, ctx, 0).line, 8, "Badge: Cuffed doesn't touch you");
  assert.equal(limitsFor(st, ctx, 1).line, 7, "Back Way on top of Cuffed");
  assert.equal(limitsFor(st, ctx, 3).line, 6);
  st.fx = null; applyLimits(st, ctx);
  assert.equal(limitsFor(st, ctx, 1).line, 9);
  assert.equal(limitsFor(st, ctx, 0), st.limits);
  assert.ok(immune(st, ctx, 0, "muggedCorner") && immune(st, ctx, 0, "cuffed") && !immune(st, ctx, 0, "bleedingRep") && !immune(st, ctx, 1, "cuffed"));
  // Mugged: the corner won with the highest total goes to its runner-up, unless that crew has the Badge (nothing happens, no fallback)
  const res = { 0: [line(0, 9, 0)], 1: [line(0, 4, 0), line(1, 0, 0)], 2: [line(1, 3, 0)] };
  const plain = resState(["turf-perks"], res, { fx: "muggedCorner" });
  run(corners, "corners", plain);
  assert.equal(plain.zones[0].holder, 1, "Mugged hands the corner to the runner-up");
  const badge = resState(["turf-perks"], res, { fx: "muggedCorner" });
  badge.perks = { precinct: 0 };
  run(corners, "corners", badge);
  assert.equal(badge.zones[0].holder, 0, "Badge: the corner stays");
  assert.ok(badge.log.some((e) => e.k === "immune"));
  // Sabotage: ties go to the challenger, unless Badge/Bribe... (Badge doesn't cover Sabotage)
});

// ------------------------------------------------------------------------------------------ Contraband
test("Contraband: 2 distinct items per crew from the 12, hidden in other views; the 72 cards are untouched", () => {
  const st = mk(["contraband"], { seed: "deal" });
  const all = Object.values(st.items).flat();
  assert.equal(ITEM_IDS.length, 12);
  assert.ok(Object.values(st.items).every((l) => l.length === 2));
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every((id) => ITEMS[id]));
  assert.equal(data.cards.length, 72);
  const v = viewFor(st, data, 1);
  assert.deepEqual(Object.keys(v.items), ["1"]);
  assert.deepEqual(v.items[1], st.items[1]);
  assert.deepEqual(v.itemCounts, { 0: 2, 1: 2, 2: 2, 3: 2 });
  assert.deepEqual(viewFor(st, data, null).items, {});
});

test("Contraband: cast validation (own item, one a round, needs a corner / a rival, no Lucky Charm in a cast)", () => {
  const st = mk(["contraband"], { seed: "cv" });
  const ctx = makeCtx(st, data);
  const hand = st.players[0].hand;
  st.items[0] = ["fakeId", "snitch", "luckyCharm"];
  const cast = (item, zone = 0) => ({ lines: [{ zone, cards: [hand[0]] }], thumbs: [], item });
  assert.equal(castProblem(st, ctx, 0, cast({ id: "fakeId", zone: 0 })), null);
  assert.match(castProblem(st, ctx, 0, cast({ id: "fakeId", zone: 1 })), /pick a corner where you have a line/);
  assert.match(castProblem(st, ctx, 0, cast({ id: "snitch", target: 0 })), /name a rival/);
  assert.equal(castProblem(st, ctx, 0, cast({ id: "snitch", target: 3 })), null);
  assert.match(castProblem(st, ctx, 0, cast({ id: "luckyCharm" })), /after the spin/);
  assert.match(castProblem(st, ctx, 0, cast({ id: "kevlarHoodie", zone: 0 })), /don't have/);
  assert.match(castProblem(st, ctx, 0, cast({ id: "nope" })), /Unknown item/);
  st.used[0] = { id: "luckyCharm" };
  assert.match(castProblem(st, ctx, 0, cast({ id: "fakeId", zone: 0 })), /One item a round/);
  // the spec lists only the castable items, with their limits
  st.used = {};
  const spec = step(core, "cast").spec(st, ctx, 0);
  assert.deepEqual(spec.items.map((i) => i.id).sort(), ["fakeId", "snitch"]);
  assert.equal(spec.limitsByItem.fakeId, undefined);
});

test("Contraband: Burner Phone (+1 card), Extra Hand (+2 fingers), Bribe (Cuffed doesn't touch you)", () => {
  const st = mk(["contraband"], { seed: "limits" });
  const ctx = makeCtx(st, data);
  const four = st.players[0].hand.slice(0, 4);
  st.items[0] = ["burnerPhone", "extraHand"];
  const c4 = (item) => ({ lines: [{ zone: 0, cards: four }], thumbs: [], item });
  assert.match(castProblem(st, ctx, 0, c4(null)) || "", /at most 3|limit/);
  const short = st.players[0].hand.map((id) => data.cardMap[id]).sort((a, b) => a.len - b.len).slice(0, 4).map((c) => c.id);
  assert.ok(!/at most/.test(castProblem(st, ctx, 0, { lines: [{ zone: 0, cards: short }], thumbs: [], item: { id: "burnerPhone" } }) || ""), "Burner Phone allows a 4th card");
  assert.match(castProblem(st, ctx, 0, { lines: [{ zone: 0, cards: short }], thumbs: [] }) || "", /at most 3/);
  assert.deepEqual(limitsFor(st, ctx, 0, { item: { id: "burnerPhone" } }), { line: 8, maxCards: 4 });
  assert.deepEqual(limitsFor(st, ctx, 0, { item: { id: "extraHand" } }), { line: 10, maxCards: 3 });
  assert.equal(limitsFor(st, ctx, 0, { item: { id: "snitch" } }), st.limits, "other items change nothing");
  st.fx = "cuffed"; applyLimits(st, ctx);
  assert.equal(limitsFor(st, ctx, 0).line, 6);
  assert.equal(limitsFor(st, ctx, 0, { item: { id: "bribe" } }).line, 8);
  assert.equal(limitsFor(st, ctx, 0, { item: { id: "extraHand" } }).line, 8, "Extra Hand +2 on Cuffed");
  assert.ok(immune(st, ctx, 0, "cuffed", { item: { id: "bribe" } }));
  assert.ok(!immune(st, ctx, 0, "cuffed"));
});

test("Contraband: items are revealed with the flip and are gone; Pickpocket takes a random unused item", () => {
  const st = mk(["contraband"], { seed: "reveal" });
  st.round = 1;
  st.items = { 0: ["pickpocket", "sprayCan"], 1: ["snitch", "bribe"], 2: ["fakeId"], 3: [] };
  st.casts = { 0: { lines: [{ zone: 0, cards: [st.players[0].hand[0]] }], thumbs: [], item: { id: "pickpocket" } },
    1: { lines: [{ zone: 0, cards: [st.players[1].hand[0]] }], thumbs: [], item: { id: "snitch", target: 0 } },
    2: { lines: [{ zone: 0, cards: [st.players[2].hand[0]] }], thumbs: [] }, 3: { lines: [{ zone: 0, cards: [st.players[3].hand[0]] }], thumbs: [] } };
  run(contraband, "itemReveal", st);
  assert.deepEqual(st.used, { 0: { id: "pickpocket" }, 1: { id: "snitch", target: 0 } });
  assert.deepEqual(st.items[0].length, 2, "spent Pickpocket, took one");
  const taken = st.items[0].find((id) => id !== "sprayCan");
  assert.ok(["bribe", "fakeId"].includes(taken), "from a rival's unused items (not the Snitch that was just played)");
  assert.equal(st.items[1].length + st.items[2].length, 1, "the victim lost it");
  assert.ok(st.log.some((e) => e.k === "item" && e.stolen != null));
  assert.ok(!st.log.some((e) => /bribe|fake/i.test(e.text) && e.stolen != null), "the log doesn't name the stolen item");
  // nothing to take: it fizzles
  const e = mk(["contraband"], { seed: "reveal2" }); e.round = 1; e.items = { 0: ["pickpocket"], 1: [], 2: [], 3: [] };
  e.casts = Object.fromEntries(e.players.map((p) => [p.id, { lines: [{ zone: 0, cards: [p.hand[0]] }], thumbs: [], ...(p.id === 0 ? { item: { id: "pickpocket" } } : {}) }]));
  run(contraband, "itemReveal", e);
  assert.match(e.log.at(-1).text, /finds nothing/);
});

test("Contraband: Brass Knuckles +2 ATK and Kevlar Hoodie +2 BLK on the named line only", () => {
  const st = mk(["contraband"], { seed: "kn" });
  st.round = 1; st.limits = { line: 20, maxCards: 3 };
  const [a, b, c, d] = st.players[0].hand;
  st.casts = { 0: { lines: [{ zone: 0, cards: [a] }, { zone: 1, cards: [b] }], thumbs: [] }, 1: { lines: [{ zone: 0, cards: [c] }], thumbs: [] }, 2: { lines: [{ zone: 1, cards: [st.players[2].hand[0]] }], thumbs: [] }, 3: { lines: [{ zone: 2, cards: [st.players[3].hand[0]] }], thumbs: [] } };
  st.players[1].hand.push(c); st.used = { 0: { id: "brassKnuckles", zone: 1 }, 1: { id: "kevlarHoodie", zone: 0 } };
  const plain = (id) => lineStats([data.cardMap[id]]);
  run(core, "reveal", st);
  const l0 = st.res[0].lines, l1 = st.res[1].lines;
  assert.equal(l0[0].atk, plain(a).atk, "zone 0 line untouched");
  assert.equal(l0[1].atk, plain(b).atk + 2, "knuckles on zone 1");
  assert.equal(l1[0].blk, plain(c).blk + 2 > 15 ? 15 : plain(c).blk + 2);
  assert.ok(d);
});

test("Contraband (corners): Fake ID makes you the holder, Smoke Bomb wins ties, Spray Can pays, Snitch costs, Getaway Car moves", () => {
  // Fake ID: P0 casts BLK 5 at zone 0 held by P1; P1 attacks with ATK 4 and loses
  let st = resState(["contraband"], { 0: [line(0, 0, 5)], 1: [line(0, 4, 0)], 2: [] });
  st.zones[0].holder = 1; st.used = { 0: { id: "fakeId", zone: 0 } };
  run(corners, "corners", st);
  assert.equal(st.zones[0].holder, 0, "the real holder fought as a challenger and lost to the Fake ID's BLK");
  st = resState(["contraband"], { 0: [line(0, 0, 5)], 1: [line(0, 4, 0)], 2: [] });
  st.zones[0].holder = 1;
  run(corners, "corners", st);
  assert.equal(st.zones[0].holder, 1, "without it the holder wins");
  // Smoke Bomb: a tie goes to the challenger who played it
  st = resState(["contraband"], { 0: [line(0, 4, 0)], 1: [line(0, 0, 4)], 2: [] });
  st.zones[0].holder = 1; st.used = { 0: { id: "smokeBomb" } };
  run(corners, "corners", st);
  assert.equal(st.zones[0].holder, 0);
  st.used = {}; const plain = resState(["contraband"], { 0: [line(0, 4, 0)], 1: [line(0, 0, 4)], 2: [] }); plain.zones[0].holder = 1;
  run(corners, "corners", plain);
  assert.equal(plain.zones[0].holder, 1);
  // Spray Can: +1 for each corner you hold at the end
  st = resState(["contraband"], { 0: [line(0, 3, 0), line(1, 3, 0)], 1: [], 2: [] }); st.used = { 0: { id: "sprayCan" } };
  run(corners, "corners", st);
  assert.deepEqual(reps(st), [4, 0, 0], "2 corners × (1 + 1)");
  // Snitch: P1 wins a contested corner and loses 1 Rep for it
  st = resState(["contraband"], { 0: [line(0, 2, 0)], 1: [line(0, 5, 0)], 2: [] }); st.used = { 0: { id: "snitch", target: 1 } };
  st.players[1].tracks.rep = 3;
  run(corners, "corners", st);
  assert.equal(st.zones[0].holder, 1);
  assert.equal(st.players[1].tracks.rep, 3, "+1 for the corner, −1 Snitch");
  assert.ok(st.log.some((e) => e.k === "rep" && e.d === -1));
  // Getaway Car: P0's line lost at zone 0; it moves to the empty zone 2 and takes it (ATK 1+)
  st = resState(["contraband"], { 0: [line(0, 3, 0)], 1: [line(0, 0, 6)], 2: [] }); st.zones[0].holder = 1; st.used = { 0: { id: "getawayCar" } };
  run(corners, "corners", st);
  assert.equal(st.zones[0].holder, 1);
  assert.equal(st.zones[1].holder, 0, "the first empty corner");
  assert.equal(st.res[0].lines[0].zone, 1, "the line now sits at the new corner");
  assert.equal(st.players[0].tracks.rep, 1);
  // ... and with ATK 0 it takes nothing
  st = resState(["contraband"], { 0: [line(0, 0, 0)], 1: [line(0, 0, 6)], 2: [] }); st.zones[0].holder = 1; st.used = { 0: { id: "getawayCar" } };
  run(corners, "corners", st);
  assert.equal(st.zones[1].holder, null);
});

test("Contraband: Bribe makes you immune to Bleeding and Sabotage", () => {
  // Bleeding: lost a contest, holds nothing: −1 Rep, unless Bribe
  const res = () => ({ 0: [line(0, 1, 0)], 1: [line(0, 0, 5)], 2: [] });
  let st = resState(["contraband"], res(), { fx: "bleedingRep" }); st.zones[0].holder = 1; st.players[0].tracks.rep = 2;
  run(corners, "corners", st);
  assert.equal(st.players[0].tracks.rep, 1);
  st = resState(["contraband"], res(), { fx: "bleedingRep" }); st.zones[0].holder = 1; st.players[0].tracks.rep = 2; st.used = { 0: { id: "bribe" } };
  run(corners, "corners", st);
  assert.equal(st.players[0].tracks.rep, 2, "Bribe: no Rep loss");
  // Sabotage: ties go to challengers; a holder with a Bribe keeps its ties
  const tie = () => ({ 0: [line(0, 4, 0)], 1: [line(0, 0, 4)], 2: [] });
  st = resState(["contraband"], tie(), { fx: "challengerTies" }); st.zones[0].holder = 1;
  run(corners, "corners", st);
  assert.equal(st.zones[0].holder, 0);
  st = resState(["contraband"], tie(), { fx: "challengerTies" }); st.zones[0].holder = 1; st.used = { 1: { id: "bribe" } };
  run(corners, "corners", st);
  assert.equal(st.zones[0].holder, 1, "immune holder: ties stay with the holder");
});

test("Contraband: Lucky Charm is the round's item and re-spins", () => {
  const st = mk(["contraband"], { seed: "lucky" });
  const ctx = makeCtx(st, data);
  st.items[2] = ["luckyCharm", "sprayCan"]; st.used = {};
  const was = st.wheel, hist = st.wheelHist.length;
  step(respin, "respin").apply(st, ctx, { 0: "keep", 1: "keep", 2: "luckyCharm", 3: "keep" });
  assert.notEqual(st.wheel, was);
  assert.equal(st.wheelHist.length, hist);
  assert.deepEqual(st.items[2], ["sprayCan"]);
  assert.match(castProblem(st, ctx, 2, { lines: [{ zone: 0, cards: [st.players[2].hand[0]] }], thumbs: [], item: { id: "sprayCan" } }), /One item a round/);
});

// ------------------------------------------------------------------------------------------ whole games
const EXPERIMENTS = { "the-plug": ["corners", "classic"], "turf-perks": ["corners"], contraband: ["corners"] };

test("200 seeded bot games per experiment finish with no stuck step, and replay exactly", () => {
  for (const [id, modeIds] of Object.entries(EXPERIMENTS)) for (const mode of modeIds) {
    const hit = new Set();
    for (let g = 0; g < 200; g++) {
      const n = [2, 3, 4][g % 3];
      const setup = { mode: modes[mode], modifiers: [modifiers[id]], seats: bots(n), seed: `exp-${id}-${mode}-${g}` };
      const st = playOut(setup, data);
      assert.ok(st.over, `${id} ${mode} #${g}`);
      for (const p of st.players) assert.equal(p.hand.length, 8, "hands refilled");
      for (const e of st.log) hit.add(e.k);
      if (g % 40 === 0) assert.equal(JSON.stringify(replay({ ...setup, mode: modes[mode] }, st.actions, data).result), JSON.stringify(st.result), "replay");
    }
    if (id === "the-plug") assert.ok(hit.has("plug") && hit.has("plugPick"));
    if (id === "turf-perks") assert.ok(hit.has("perks") && hit.has("perk"));
    if (id === "contraband") assert.ok(hit.has("item"));
  }
});

test("combo: Plug + Turf Perks + Contraband + four corners + open card (and the other house rules) play out, deterministic, hidden info safe", () => {
  const ids = ["the-plug", "turf-perks", "contraband", "four-corners", "open-card"];
  for (const extra of [[], ["block-corner", "hot-corner", "rep-upkeep"], ["wheel-no-cooldown", "three-thumbs"]]) for (let g = 0; g < 25; g++) {
    const n = [2, 3, 4][g % 3];
    const setup = { mode: modes.corners, modifiers: [...ids, ...extra].map((id) => modifiers[id]), seats: bots(n), seed: `combo-${g}` };
    const a = playOut(setup, data), b = playOut(setup, data);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(JSON.stringify(replay(setup, a.actions, data).result), JSON.stringify(a.result));
    assert.ok(a.over);
  }
});

test("views never leak items or the Lookout hand mid-game", () => {
  const setup = { mode: modes.corners, modifiers: ["turf-perks", "contraband"].map((id) => modifiers[id]), seats: bots(4), seed: "leak" };
  let st = createGame(setup, data);
  for (let guard = 0; !st.over && guard < 400; guard++) {
    for (const pid of [0, 1, 2, 3]) {
      const v = viewFor(st, data, pid);
      assert.deepEqual(Object.keys(v.items), [String(pid)]);
      if (v.look?.hand) assert.equal(v.look.pid, pid);
      if (!st.revealed) for (const [id, c] of Object.entries(v.casts)) assert.equal(+id, pid, "casts (and the items in them) stay hidden until the flip");
    }
    const pid = st.pending.who.find((id) => !(id in st.pending.answers));
    st = act(st, data, { pid, value: botChoice(st, data, pid) }).state;
  }
  assert.ok(st.over);
});

test("modules are registered", () => {
  for (const id of ["respin", "plug", "turfPerks", "contraband"]) assert.ok(MODULES[id], id);
});
