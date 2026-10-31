// The narrator: plays what just happened at the table as a paced sequence of "beats" instead of a wall of
// log text. It reads only NEW log entries (the engine already decided everything) and keeps a *displayed*
// copy of the scores, holders, round and Wheel that lags behind the real state until each beat plays.
//
//   beats come from log entries:  round -> banner · wheel -> reel · reveal -> cards flip (+ Thumb dice) ·
//   corner/spot/block -> a zone changes hands · rank -> rank badges · dmg/rep/heal/payout/callout -> floating
//   numbers and the score counter moves · end -> winner banner · anything else -> a caption.
// No rules here; the structured fields (d, ds, zone, holder, ranks, id) come from the engine's log.
import { banner, wheelReel, floatText, flash, dice, sound } from "./fx.js";
import { buildBeats, resFor } from "./beats.js";

const SPEED = { slow: 1.5, normal: 1, fast: 0.5 };

/**
 * Runs beats one after another. hooks: { view(), render(), data, speed(): "slow"|"normal"|"fast"|"instant",
 * pace(): "each"|"together", onIdle() }. disp = what the table currently *shows*.
 */
export class Presenter {
  constructor(hooks) { this.h = hooks; this.reset(); }
  reset(v = null) {
    clearTimeout(this.timer);
    this.queue = []; this.cur = null; this.busy = false; this.fresh = false;
    this.pos = v ? v.log.length : 0;
    this.disp = null;
    if (v) this.sync(v);
  }
  /** Make the displayed state equal to the real one. */
  sync(v) {
    const track = v.mode.win.track;
    this.disp = {
      scores: Object.fromEntries(v.players.map((p) => [p.id, p.tracks[track]])),
      holders: Object.fromEntries(v.zones.map((z) => [z.name, z.holder])),
      round: v.round, wheel: v.wheel, shownRound: v.revealed ? v.round : v.round - 1, ranks: null,
    };
  }
  /** Start from a given log position (e.g. the first "round" entry at game start). */
  startAt(v, pos) { this.reset(); this.pos = pos; this.sync(v); this.disp.round = 0; this.disp.wheel = null; this.disp.shownRound = 0; }
  /** Called on every render with the current view: queue beats for log entries we haven't shown. */
  feed(v) {
    if (!this.disp) { this.sync(v); this.pos = v.log.length; return; } // nothing shown yet: start from now
    if (v.log.length < this.pos) { this.reset(v); return; } // went back in a replay
    if (v.log.length === this.pos) { if (!this.busy) this.sync(v); return; }
    const fresh = v.log.slice(this.pos);
    this.pos = v.log.length;
    if (this.h.speed() === "instant") { this.sync(v); return; }
    this.queue.push(...buildBeats(fresh, v, this.h.pace()));
    // start on the next tick, not inside the render that fed us
    if (!this.busy && this.queue.length) { this.busy = true; this.timer = setTimeout(() => this.next(), 0); }
  }
  skip() {
    clearTimeout(this.timer);
    this.queue = []; this.cur = null; this.busy = false;
    const v = this.h.view();
    if (v) this.sync(v);
    this.h.render();
    this.h.onIdle();
  }
  next() {
    const b = this.queue.shift();
    if (!b) {
      this.busy = false; this.cur = null;
      const v = this.h.view();
      if (v) this.sync(v);
      this.h.render();
      this.h.onIdle();
      return;
    }
    this.busy = true; this.cur = b; this.fresh = true;
    this.apply(b);
    this.h.render();
    this.fresh = false;
    this.effects(b);
    const k = SPEED[this.h.speed()] ?? 1;
    this.timer = setTimeout(() => this.next(), b.type === "wheel" ? Math.max(2300, b.dur * k) : b.dur * k); // the reel needs its time
  }
  apply(b) {
    const d = this.disp;
    if (b.type === "round") { d.round = b.round; d.ranks = null; }
    if (b.type === "reveal") d.shownRound = b.round;
    if (b.type === "rank") d.ranks = b.ranks;
    if (b.type === "claim") d.holders[b.zone] = b.holder;
    if (b.type === "score") for (const x of b.deltas) d.scores[x.pid] = (d.scores[x.pid] ?? 0) + x.d;
  }
  effects(b) {
    const v = this.h.view(), data = this.h.data;
    const box = (pid) => document.querySelector(`.pbox[data-pid="${pid}"]`);
    const zone = (nm) => document.querySelector(`.zone[data-zone="${CSS.escape(nm)}"]`);
    if (b.type === "round") { banner(`Round ${b.round}`, `of ${v.mode.params.rounds}`, { ms: 1100, cls: "small" }); sound("whoosh"); }
    if (b.type === "wheel") {
      const s = data.wheel.find((w) => w.id === b.id);
      if (s) wheelReel(data.wheel, s, 1400);
      // the side panel shows the new sector only when the reel lands
      setTimeout(() => { if (this.cur === b) { this.disp.wheel = b.id; this.h.render(); } }, 1550);
    }
    if (b.type === "say" && b.sfx) sound(b.sfx);
    if (b.type === "reveal") { sound("flip"); setTimeout(() => sound("flip", { rate: 1.1 }), 260); setTimeout(() => sound("flip", { rate: 0.95 }), 520); }
    if (b.type === "dice") for (const pid of b.pids) dice(box(pid), (resFor(v, b.round)?.[pid]?.rolls || []).map((x) => x.r));
    if (b.type === "totals") sound("chip");
    if (b.type === "rank") sound("select");
    if (b.type === "claim") {
      const holder = b.holder != null ? v.players[b.holder] : null;
      flash(zone(b.zone), holder?.color || "#888");
      sound(holder ? "chips" : "back");
    }
    if (b.type === "score") {
      const track = v.mode.win.track;
      for (const x of b.deltas) {
        const bad = track === "damage" ? x.d > 0 : x.d < 0;
        const txt = `${x.d > 0 ? "+" : "−"}${Math.abs(x.d)}${track === "rep" ? " Rep" : ""}`;
        floatText(box(x.pid), txt, bad ? "bad" : "good");
        flash(box(x.pid), bad ? "var(--red)" : "var(--ok)", 900);
      }
      const anyBad = b.deltas.some((x) => (track === "damage" ? x.d > 0 : x.d < 0));
      sound(anyBad ? "hit" : track === "rep" ? "chips" : "heal");
    }
    if (b.type === "end") {
      const w = v.players[b.pid];
      if (w) { banner(`${w.name} takes it`, "The Vein closes", { color: w.color, ms: 3000, cls: "final" }); sound("win"); }
    }
  }
}
