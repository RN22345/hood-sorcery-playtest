// Post-game stats (ui/stats.js, no DOM) and the host's seat hand-over (engine setSeatKind).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData } from "../engine/load-node.js";
import { createGame, act, botChoice, viewFor, replay, setSeatKind } from "../engine/game.js";
import { Timer, computeStats, statsMarkdown, statsCsv, parseStatsFile, compareStats, compareMarkdown, compareCsv } from "../ui/stats.js";
import { buildReplay } from "../ui/replay.js";
import { playOut } from "../engine/run.js";

const { data, modes, modifiers } = loadData();
const bots = (n) => Array.from({ length: n }, () => ({ kind: "bot" }));

// Plays a game with bots, one second per answer, watching every view like the UI does.
function timedGame(modeId, n, seed, onAct) {
  const setup = { mode: modes[modeId], seats: bots(n), seed };
  let st = createGame(setup, data), now = 0;
  const timer = new Timer(now);
  timer.observe(viewFor(st, data, 0), now);
  for (let k = 0; !st.over; k++) {
    const pid = st.pending.who.find((id) => !(id in st.pending.answers));
    now += 1000;
    st = act(st, data, { pid, value: botChoice(st, data, pid) }).state;
    if (onAct) st = onAct(st, k);
    timer.observe(viewFor(st, data, 0), now);
  }
  const rec = { kind: "hood-sorcery-playtest-log", mode: st.mode, players: st.players, log: st.log, result: st.result, seed, timing: timer.t, wheelNames: Object.fromEntries(data.wheel.map((w) => [w.id, w.name])) };
  return { st, setup, timer, rec };
}

test("setSeatKind hands a seat to a bot and back without changing the replay", () => {
  const { st, setup } = timedGame("corners", 3, "seat-swap", (s, k) => (k === 4 ? setSeatKind(s, 1, "human") : k === 9 ? setSeatKind(s, 1, "bot") : s));
  assert.ok(st.log.some((e) => e.k === "seat" && /back in control/.test(e.text)));
  assert.ok(st.log.some((e) => e.k === "seat" && /a bot plays/.test(e.text)));
  assert.equal(JSON.stringify(replay(setup, st.actions, data).result), JSON.stringify(st.result));
  const s0 = createGame(setup, data);
  assert.equal(setSeatKind(s0, 0, "bot"), s0, "no change, same object");
  assert.equal(s0.players[0].kind, "bot");
});

test("timer: every decision is timed once, rounds have start times", () => {
  const { st, timer } = timedGame("classic", 4, "timer");
  assert.equal(timer.t.decisions.length, st.actions.length);
  assert.ok(timer.t.decisions.every((d) => d.ms >= 0));
  assert.deepEqual(Object.keys(timer.t.rounds).map(Number), Array.from({ length: st.mode.params.rounds }, (_, i) => i + 1));
  assert.equal(timer.t.end, st.actions.length * 1000);
});

test("stats: numbers match the game, and the .md and log both load back", () => {
  for (const [modeId, n] of [["classic", 4], ["corners", 3], ["hold-the-block", 4], ["posted-up", 2]]) {
    const { st, rec } = timedGame(modeId, n, `stats-${modeId}`);
    const s = computeStats(rec);
    const track = st.mode.win.track;
    assert.equal(s.roundsPlayed, st.mode.params.rounds);
    assert.equal(s.winner, st.players[st.result.order[0]].name);
    s.players.forEach((p, i) => {
      assert.equal(p.final, st.players[i].tracks[track], `${modeId} final`);
      assert.equal(p.deltas.reduce((a, b) => a + b, 0) + p.endAdjust, p.final, `${modeId} deltas add up`);
      assert.equal(p.place, st.result.order.indexOf(i) + 1);
      assert.equal(p.decisions, st.actions.filter((a) => a.pid === i).length);
    });
    assert.equal(s.economy.thumbsUsed, st.players.reduce((a, p) => a + st.mode.params.thumbs - p.thumbs, 0));
    assert.equal(s.time.durationSec, st.actions.length);
    assert.deepEqual(parseStatsFile(statsMarkdown(s)), s, "md round-trip");
    assert.deepEqual(parseStatsFile(JSON.stringify(rec)), s, "log -> same stats");
    const csv = statsCsv(s).trim().split("\n");
    assert.equal(csv.length, 1 + n * s.roundsPlayed);
  }
  assert.throws(() => parseStatsFile("hello"), /Not a Hood Sorcery/);
});

test("replay: a log rebuilds the same game, with stops at each finished step", () => {
  const mods = [modifiers["call-out"]];
  const setup = { mode: modes["posted-up"], modifiers: mods, seats: bots(3), seed: "replay" };
  const st = playOut(setup, data);
  const log = { setup: { modeId: "posted-up", modifiers: ["call-out"], seats: setup.seats, seed: "replay" }, actions: st.actions, result: st.result };
  const rp = buildReplay(log, data, modes, modifiers);
  assert.equal(rp.states.length, st.actions.length + 1);
  assert.equal(JSON.stringify(rp.states.at(-1).result), JSON.stringify(st.result));
  assert.equal(rp.diverged, false);
  assert.equal(rp.stops[0], 0);
  assert.equal(rp.stops.at(-1), st.actions.length);
  assert.ok(rp.stops.every((k, i) => !i || k > rp.stops[i - 1]));
  assert.deepEqual(Object.keys(rp.rounds).map(Number), Array.from({ length: st.mode.params.rounds }, (_, i) => i + 1));
  assert.equal(buildReplay({ ...log, result: { ...st.result, order: [...st.result.order].reverse() } }, data, modes, modifiers).diverged, true);
  assert.throws(() => buildReplay({ ...log, actions: null }, data, modes, modifiers), /no moves/);
  assert.throws(() => buildReplay({ ...log, actions: [{ ...st.actions[0], value: "nonsense" }] }, data, modes, modifiers), /don't fit/);
});

test("compare: one row per game, averages and seat wins per mode", () => {
  const list = [["classic", 4, "c1"], ["classic", 4, "c2"], ["corners", 3, "k1"]].map(([m, n, seed]) => computeStats({ ...timedGame(m, n, seed).rec, survey: { fun: "4" } }));
  const c = compareStats(list);
  assert.equal(c.games.length, 3);
  assert.deepEqual(c.modes.map((m) => [m.mode, m.games]), [["Classic", 2], ["Corners", 1]]);
  assert.equal(c.modes[0].seatWins.reduce((a, b) => a + b, 0), 2);
  assert.equal(c.modes[0].fun, 4);
  assert.match(compareMarkdown(c), /## By mode/);
  assert.equal(compareCsv(c).trim().split("\n").length, 4);
  assert.match(statsMarkdown(list[0]), /## Survey[\s\S]*Fun \(1–5\):\*\* 4/);
});
