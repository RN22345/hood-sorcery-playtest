// Controller: loads data, runs the lobby, and drives a game as one of three roles:
//   local  - everything on this device (hot-seat humans + bots)
//   host   - like local, plus online seats; this browser owns the state and sends each client
//            only viewFor(state, theirSeat)
//   client - joined someone's room; renders the views it receives, sends its answers
// No rules here: the engine decides everything.
import { prepareData, createGame, act, viewFor, botChoice, makeCtx, setSeatKind } from "../engine/game.js";
import { modifierProblems } from "../engine/registry.js";
import { castProblem, allowedZones } from "../engine/cast.js";
import { Host, Client } from "../net/peer.js";
import * as V from "./views.js";
import { md } from "./md.js";
import { Timer, computeStats, statsMarkdown, statsCsv, parseStatsFile, compareStats, compareMarkdown, compareCsv } from "./stats.js";
import { buildReplay } from "./replay.js";
import { statsPanel, statsImage } from "./statsView.js";

const root = document.getElementById("app");
const getJson = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); });
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("hsp:" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("hsp:" + k, JSON.stringify(v)); } catch {} },
};
const newSeed = () => Math.random().toString(36).slice(2, 8);

const app = {
  screen: "lobby", role: null, st: null, view: null, seat: null, setup: null,
  localSeats: [], localCount: 0, focus: null, cover: null, unlocked: null,
  draft: { key: "", zone: 0, lines: {}, thumbs: [], pick: [] }, allowedZones: [], castProblem: null,
  net: { code: null, status: "", seatNames: {}, conn2seat: {} },
  showLog: !window.matchMedia?.("(max-width: 900px)").matches, error: "", lobbyError: "", survey: { best: "", obvious: "", reads: "", fun: "" }, modal: null,
  botDelay: 220,
  reveal: { seen: 0, until: 0, fresh: false }, // the few seconds after a round's cards flip
  modProblem(mode, m) { return modifierProblems(mode, m)[0] || ""; },
  netSeats: () => netSeats(),
};
window.hsApp = app; // handy in the console while playtesting

async function boot() {
  try {
    const [cards, wheel, matrices, crews, modeIds, modifiers] = await Promise.all(
      ["data/cards.json", "data/wheel.json", "data/matrices.json", "data/crews.json", "data/modes/index.json", "data/modifiers.json"].map(getJson));
    app.data = prepareData({ cards, wheel, matrices, crews });
    app.modes = Object.fromEntries((await Promise.all(modeIds.map((id) => getJson(`data/modes/${id}.json`)))).map((m) => [m.id, m]));
    app.modifiers = Object.fromEntries(modifiers.map((m) => [m.id, m]));
  } catch (e) {
    root.innerHTML = `<p class="err">Could not load game data (${V.esc(e.message)}). Serve this folder over http, e.g. <code>npx http-server</code> or <code>python -m http.server</code>.</p>`;
    return;
  }
  const saved = store.get("lobby", {});
  app.lob = {
    modeId: app.modes[saved.modeId] ? saved.modeId : "corners",
    mods: saved.mods || [],
    seats: saved.seats || [{ kind: "human", name: "" }, { kind: "bot", name: "" }, { kind: "bot", name: "" }, { kind: "bot", name: "" }],
    seed: newSeed(), joinName: saved.joinName || "",
    joinCode: new URLSearchParams(location.search).get("join") || "",
  };
  render();
}

// ------------------------------------------------------------------ rendering
function currentView() {
  if (app.screen === "replay") return replayView();
  if (app.role === "client") { app.cover = null; app.localCount = 1; return app.view; }
  return viewFor(app.st, app.data, app.focus);
}

function prepareDraft(v) {
  const c = v.choice;
  const key = `${v.round}|${v.stepIdx}|${v.you}|${c?.step}|${v.log.length}`;
  if (key !== app.draft.key) {
    const zones = c?.type === "cast" ? allowedZones(v, makeCtx(v, app.data), v.you) : [];
    app.draft = { key, zone: zones[0] ?? 0, lines: {}, thumbs: [], pick: [] };
    app.allowedZones = zones;
    app.error = app.error && app.role === "client" ? app.error : "";
  }
  if (c?.type === "cast") app.castProblem = castProblem(v, makeCtx(v, app.data), v.you, draftCast());
}

// A round's lines become visible either mid-round (v.revealed, e.g. before Flip the Script) or, when
// nothing is left to decide, only as last round's lines (v.lastRes). Either way: flip once, highlight a while.
const REVEAL_MS = 6000;
function trackReveal(v) {
  const r = v.revealed ? v.round : v.lastRes ? v.round - 1 : 0;
  if (r > app.reveal.seen) {
    app.reveal = { seen: r, until: Date.now() + REVEAL_MS, fresh: true };
    clearTimeout(app.revealTimer);
    app.revealTimer = setTimeout(() => (app.screen === "game" || app.screen === "replay") && render(), REVEAL_MS + 50);
  }
  app.revealing = Date.now() < app.reveal.until ? r : 0;
}

function draftCast() {
  return { lines: Object.entries(app.draft.lines).map(([z, cards]) => ({ zone: +z, cards })), thumbs: [...app.draft.thumbs] };
}

function render() {
  let html;
  if (app.screen === "stats") {
    const panels = app.statsList.map((s, i) => statsPanel(s, i, app.statsLogs?.[i]?.actions ? `<button class="primary" data-act="replay" data-i="${i}">Replay this game</button>` : "")).join("");
    const cmp = app.statsList.length > 1 ? compareStats(app.statsList) : null;
    html = V.statsScreen(app, panels, cmp && md(compareMarkdown(cmp)));
  } else if (app.screen === "replay") {
    const v = replayView();
    if (app.reveal.seen > (v.revealed ? v.round : v.round - 1)) app.reveal.seen = 0; // stepping back: flip again later
    trackReveal(v);
    html = V.game(app, v, { panel: V.replayPanel(app, v, app.rp) });
    app.reveal.fresh = false;
  } else if (app.screen === "lobby") {
    app.recentStats = store.get("recentStats", []);
    html = app.role === "client" ? V.clientLobby(app) : V.lobby(app);
    if (app.role === "host") broadcastLobby();
  } else {
    const v = currentView();
    if (!v) { root.innerHTML = "<p class='muted'>Waiting for the host…</p>"; return; }
    prepareDraft(v);
    trackReveal(v);
    (app.timer ||= new Timer(Date.now())).observe(v, Date.now());
    if (v.over && !app.statsSaved) { app.statsSaved = true; rememberStats(computeStats(gameRecord())); }
    html = V.game(app, v);
    app.reveal.fresh = false; // the flip animates once; later renders keep only the highlights
  }
  if (app.modal) html += V.rulesModal(app, app.modal);
  root.innerHTML = html;
  const log = root.querySelector(".log");
  if (log) log.scrollTop = log.scrollHeight;
}

// ------------------------------------------------------------------ game flow (local / host)
function startGame() {
  const { lob, data } = app;
  const mode = app.modes[lob.modeId];
  const mods = lob.mods.map((id) => app.modifiers[id]).filter((m) => m && !app.modProblem(mode, m));
  const seats = lob.seats.map((s, i) => ({
    kind: s.kind === "bot" ? "bot" : "human",
    name: s.kind === "online" ? app.net.seatNames[i] : s.name.trim() || data.crews[i].name,
  }));
  try {
    app.st = createGame({ mode, modifiers: mods, seats, seed: lob.seed }, data);
  } catch (e) { app.lobbyError = e.message; render(); return; }
  app.setup = { modeId: mode.id, modifiers: mods.map((m) => m.id), seats, seed: lob.seed };
  app.localSeats = lob.seats.map((s, i) => (s.kind === "human" ? i : -1)).filter((i) => i >= 0);
  app.role = lob.seats.some((s) => s.kind === "online") ? "host" : "local";
  app.onlineSeats = lob.seats.map((s, i) => (s.kind === "online" ? i : -1)).filter((i) => i >= 0);
  app.screen = "game";
  app.unlocked = null;
  app.survey = { best: "", obvious: "", reads: "", fun: "" };
  app.lobbyError = "";
  app.reveal = { seen: 0, until: 0, fresh: false };
  app.timer = new Timer(Date.now()); app.statsSaved = false;
  changed();
}

function updateFocus() {
  const st = app.st, locals = app.localSeats;
  app.localCount = locals.length;
  if (!locals.length) { app.focus = null; app.cover = null; return; }
  if (locals.length === 1) { app.focus = locals[0]; app.cover = null; return; }
  const waiting = st.pending && !st.over ? st.pending.who.filter((id) => locals.includes(id) && !(id in st.pending.answers)) : [];
  if (!waiting.length) { app.focus = null; app.cover = null; return; }
  if (waiting.includes(app.unlocked)) { app.focus = app.unlocked; app.cover = null; return; }
  app.focus = null; app.cover = waiting[0];
}

function changed() {
  updateFocus();
  if (app.role === "host") broadcastViews();
  render();
  scheduleBots();
}

function scheduleBots() {
  clearTimeout(app.botTimer);
  const st = app.st;
  if (!st || st.over || !st.pending) return;
  const bot = st.pending.who.find((id) => st.players[id].kind === "bot" && !(id in st.pending.answers));
  if (bot == null) return;
  app.botTimer = setTimeout(() => {
    if (app.st !== st) return;
    const r = act(st, app.data, { pid: bot, value: botChoice(st, app.data, bot) });
    if (r.error) { console.error("bot", bot, r.error); return; }
    app.st = r.state;
    changed();
  }, app.botDelay);
}

function submit(value) {
  app.error = "";
  if (app.role === "client") { app.net.client.act(value); return; }
  const r = act(app.st, app.data, { pid: app.focus, value });
  if (r.error) { app.error = r.error; render(); return; }
  app.st = r.state;
  if (app.localCount > 1) app.unlocked = null;
  changed();
}

function leave() {
  if (app.screen === "game" && app.st && !app.st.over && app.role !== "client" && !confirm("Leave this game?")) return;
  clearTimeout(app.botTimer); clearTimeout(app.revealTimer);
  app.reveal = { seen: 0, until: 0, fresh: false };
  app.timer = null; app.statsSaved = false;
  app.net.host?.close(); app.net.client?.close();
  Object.assign(app, { screen: "lobby", role: null, st: null, view: null, seat: null, remoteLobby: null, remoteNet: null, onlineSeats: [], error: "" });
  app.net = { code: null, status: "", seatNames: {}, conn2seat: {} };
  app.lob.seed = newSeed();
  render();
}

// ------------------------------------------------------------------ online
async function openHost() {
  app.role = "host";
  const host = new Host({
    onHello(connId, name) {
      const { lob, net } = app;
      const connected = Object.values(net.conn2seat);
      let seat = Object.keys(net.seatNames).map(Number).find((i) => net.seatNames[i] === name && !connected.includes(i));
      if (seat == null && app.screen === "lobby") {
        seat = lob.seats.findIndex((s, i) => s.kind === "online" && !net.seatNames[i]);
        if (seat < 0) seat = null;
        else net.seatNames[seat] = name;
      }
      net.conn2seat[connId] = seat ?? null;
      queueMicrotask(() => {
        if (app.screen !== "game") { render(); return; }
        // a dropped player who comes back takes their seat back from the bot
        if (seat != null && app.onlineSeats.includes(seat) && app.st.players[seat].kind === "bot") app.st = setSeatKind(app.st, seat, "human");
        app.net.status = seat != null ? `${name} is connected.` : app.net.status;
        changed();
      });
      return seat ?? null;
    },
    onAct(connId, value) {
      const seat = app.net.conn2seat[connId];
      if (seat == null || !app.st) return;
      const r = act(app.st, app.data, { pid: seat, value });
      if (r.error) { host.send(connId, { t: "error", text: r.error }); return; }
      app.st = r.state;
      changed();
    },
    onLeave(connId) {
      const seat = app.net.conn2seat[connId];
      delete app.net.conn2seat[connId];
      if (app.screen === "lobby" && seat != null) delete app.net.seatNames[seat];
      app.net.status = seat != null ? `${app.net.seatNames[seat] || app.data.crews[seat].seat} disconnected${app.screen === "game" ? ": they can rejoin with the same name, or a bot can take over" : ""}` : app.net.status;
      if (app.screen === "game") broadcastViews();
      render();
    },
    onStatus(s) { app.net.status = s; render(); },
  });
  app.net.host = host;
  try { app.net.code = await host.open(); } catch (e) { app.net.status = `Couldn't open a room: ${e.message || e.type}. Try again, or play on one device.`; app.role = null; }
  render();
}

function broadcastLobby() {
  const { host, seatNames } = app.net;
  if (!host) return;
  const lobby = {
    modeId: app.lob.modeId, mods: app.lob.mods,
    seats: app.lob.seats.map((s, i) => (s.kind === "online" ? seatNames[i] || "(open seat)" : s.kind === "bot" ? "Bot" : s.name || app.data.crews[i].name)),
  };
  host.each((id) => host.send(id, { t: "lobby", lobby }));
}

// Online seats and who is connected right now, for the in-game connection strip (host and clients).
function netSeats() {
  const on = Object.values(app.net.conn2seat);
  return (app.onlineSeats || []).map((i) => ({ seat: i, name: app.net.seatNames[i] || app.data.crews[i].seat, on: on.includes(i), bot: app.st?.players[i].kind === "bot" }));
}
const sendView = (connId) => app.net.host.send(connId, { t: "view", view: viewFor(app.st, app.data, app.net.conn2seat[connId] ?? null), net: netSeats() });
function broadcastViews() { app.net.host?.each((id) => sendView(id)); }

function reconnect() {
  app.net.client?.close();
  app.net.lost = false;
  joinRoom();
}

async function joinRoom() {
  const { joinName, joinCode } = app.lob;
  if (!joinName.trim() || !joinCode.trim()) { app.lobbyError = "Enter your name and the room code."; render(); return; }
  store.set("lobby", { ...store.get("lobby", {}), joinName });
  app.role = "client";
  app.net.code = joinCode.trim().toUpperCase();
  const client = new Client({
    onMessage(m) {
      if (m.t === "welcome") { app.seat = m.seat; app.net.lost = false; app.net.status = `Connected to room ${app.net.code}.`; }
      else if (m.t === "lobby") app.remoteLobby = m.lobby;
      else if (m.t === "view") { app.view = m.view; app.remoteNet = m.net || []; app.screen = "game"; app.error = ""; }
      else if (m.t === "error") app.error = m.text;
      render();
    },
    onStatus(s) { app.net.status = s; render(); },
    onClose() { app.net.lost = true; app.net.status = "Lost the connection to the host. Press Reconnect: you get your seat back."; render(); },
  });
  app.net.client = client;
  render();
  try { await client.join(app.net.code, joinName.trim()); } catch (e) { app.net.lost = true; app.net.status = `Couldn't join: ${e.type || e.message}. Check the code, or try Reconnect.`; render(); }
}

// ------------------------------------------------------------------ misc actions
async function openRules() {
  const modeId = app.screen === "game" ? (app.role === "client" ? app.view.mode.id : app.st.mode.id) : app.lob.modeId;
  let text = "";
  try { text = await fetch(`modes/${modeId}.md`).then((r) => r.text()); } catch { text = "Rules page missing."; }
  const mods = Object.values(app.modifiers).map((m) => `- **${m.name}**: ${m.desc}`).join("\n");
  app.modal = md(text) + md(`## Modifiers\n\n${mods}\n\nThe printed rules are SRD v3.10.20; every mode here is a playtest variant.`);
  render();
}

// The game as a record: the downloaded log, and the input to the stats (ui/stats.js).
function gameRecord() {
  const v = currentView();
  return {
    kind: "hood-sorcery-playtest-log", version: 2, date: new Date().toISOString(),
    setup: app.screen === "replay" ? app.rp.log.setup : app.setup, role: app.role, viewer: v.you, seed: v.seed,
    mode: v.mode, result: v.result, survey: app.survey,
    players: v.players.map((p) => ({ seat: p.seat, crew: p.crew, color: p.color, name: p.name, kind: p.kind, thumbs: p.thumbs, tracks: p.tracks, hist: p.hist })),
    actions: app.screen === "replay" ? null : app.st?.actions ?? null, log: v.log,
    timing: app.timer && app.screen !== "replay" ? { ...app.timer.t, last: Date.now() } : null,
    wheelNames: Object.fromEntries(app.data.wheel.map((w) => [w.id, w.name])),
    modifierNames: Object.fromEntries(Object.values(app.modifiers).map((m) => [m.id, m.name])),
  };
}

function saveFile(name, body, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(body instanceof Blob ? body : new Blob([body], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function download() {
  const rec = gameRecord();
  saveFile(`hood-sorcery-${rec.mode.id}-${rec.seed}-${Date.now()}.json`, JSON.stringify(rec, null, 1), "application/json");
}

// ------------------------------------------------------------------ stats
const statsAt = (i) => (i === "cur" ? app.curStats : app.statsList[+i]);
const statsName = (s, ext) => `hood-sorcery-${s.mode.id}-${s.seed ?? "game"}-stats.${ext}`;

function openStats() {
  app.curStats = computeStats(gameRecord());
  app.modal = statsPanel(app.curStats, "cur");
  render();
}

function rememberStats(s) {
  const list = store.get("recentStats", []).filter((x) => !(x.seed === s.seed && x.mode.id === s.mode.id));
  store.set("recentStats", [s, ...list].slice(0, 8));
}

async function loadStatsFiles(files) {
  const list = [], logs = [], bad = [];
  for (const f of files) {
    try {
      const text = await f.text();
      const st = parseStatsFile(text);
      let log = null;
      try { const o = JSON.parse(text); if (o.kind === "hood-sorcery-playtest-log") log = o; } catch {}
      // the same game loaded twice (its log and its .md report) counts once; keep the log for the replay
      const key = (x) => `${x.mode.id}|${x.seed}|${x.players.map((p) => p.name + ":" + p.final).join(",")}`;
      const dup = list.findIndex((x) => key(x) === key(st));
      if (dup >= 0) { logs[dup] ||= log; continue; }
      list.push(st); logs.push(log);
    } catch { bad.push(f.name); }
  }
  app.lobbyError = bad.length ? `Couldn't read ${bad.join(", ")}: load a stats .md or a game log .json.` : "";
  if (list.length) showStats(list, logs); else render();
}

function showStats(list, logs = []) {
  app.statsList = list;
  app.statsLogs = logs;
  app.screen = "stats";
  app.modal = null;
  render();
  scrollTo(0, 0);
}

// ------------------------------------------------------------------ replay (A4)
function openReplay(log, back) {
  try {
    app.rp = { ...buildReplay(log, app.data, app.modes, app.modifiers), at: 0, back, log, playing: false };
  } catch (e) { alert(e.message); return; }
  app.modal = null;
  app.cover = null; app.localCount = 0;
  app.reveal = { seen: 0, until: 0, fresh: false };
  app.screen = "replay";
  render();
  scrollTo(0, 0);
}

// Everything visible: the replay is for after the game, so every hand is shown in the replay panel.
function replayView() {
  const st = app.rp.states[app.rp.stops[app.rp.at]];
  const v = viewFor(st, app.data, null);
  v.players.forEach((p) => (p.hand = st.players[p.id].hand));
  const prev = app.rp.at ? app.rp.states[app.rp.stops[app.rp.at - 1]] : null;
  v.replayNew = prev ? st.log.slice(prev.log.length) : st.log;
  return v;
}

function replayGo(to) {
  const rp = app.rp, last = rp.stops.length - 1;
  const round = rp.states[rp.stops[rp.at]].round;
  const at = {
    start: 0, end: last, prev: rp.at - 1, next: rp.at + 1,
    prevRound: rp.rounds[round] < rp.at ? rp.rounds[round] : rp.rounds[round - 1] ?? 0,
    nextRound: rp.rounds[round + 1] ?? last,
  }[to] ?? +to;
  rp.at = Math.max(0, Math.min(last, at));
  if (rp.at === last) replayPlay(false);
  render();
}

function replayPlay(on = !app.rp?.playing) {
  clearInterval(app.replayTimer);
  if (!app.rp) return;
  app.rp.playing = on;
  if (on) app.replayTimer = setInterval(() => replayGo("next"), 900);
}

function closeReplay() {
  replayPlay(false);
  const back = app.rp?.back || "lobby";
  app.rp = null;
  app.screen = back;
  if (back === "game") updateFocus();
  render();
}

async function statsDownload(act, el) {
  if (act === "compareMd" || act === "compareCsv") {
    const c = compareStats(app.statsList), name = `hood-sorcery-compare-${app.statsList.length}-games`;
    if (act === "compareMd") saveFile(`${name}.md`, `# Hood Sorcery: ${app.statsList.length} games compared\n\n${compareMarkdown(c)}`, "text/markdown");
    else saveFile(`${name}.csv`, compareCsv(c), "text/csv");
    return;
  }
  const s = statsAt(el.dataset.i);
  if (!s) return;
  if (act === "statsMd") saveFile(statsName(s, "md"), statsMarkdown(s), "text/markdown");
  else if (act === "statsCsv") saveFile(statsName(s, "csv"), statsCsv(s), "text/csv");
  else {
    const type = el.dataset.type || "image/png";
    try { saveFile(statsName(s, type.split("/")[1].replace("jpeg", "jpg")), await statsImage(s, type)); }
    catch (e) { alert(e.message); }
  }
}

function saveLobby() { store.set("lobby", { modeId: app.lob.modeId, mods: app.lob.mods, seats: app.lob.seats.map((s) => ({ kind: s.kind, name: s.name })), joinName: app.lob.joinName }); }

function fitSeats() {
  const allowed = app.modes[app.lob.modeId].players;
  const seats = app.lob.seats;
  while (seats.length > Math.max(...allowed)) seats.pop();
  while (seats.length < Math.min(...allowed)) seats.push({ kind: "bot", name: "" });
}

// ------------------------------------------------------------------ events
root.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]");
  const stop = e.target.closest("[data-stop]");
  if (stop && !(t && stop.contains(t))) return; // clicks inside a modal only count on its own buttons
  const cardEl = e.target.closest("[data-card]");
  if (cardEl && app.screen === "game" && !stop) return clickCard(cardEl.dataset.card, cardEl);
  if (!t || t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
  const d = app.draft, v = app.screen === "game" ? currentView() : null;
  switch (t.dataset.act) {
    case "seatAdd": app.lob.seats.push({ kind: "bot", name: "" }); break;
    case "seatDel": app.lob.seats.pop(); break;
    case "host": openHost(); return;
    case "start": saveLobby(); startGame(); return;
    case "join": joinRoom(); return;
    case "copyLink": navigator.clipboard?.writeText(`${location.origin}${location.pathname}?join=${app.net.code}`); app.net.status = "Invite link copied."; break;
    case "rules": openRules(); return;
    case "closeModal": app.modal = null; break;
    case "toggleLog": app.showLog = !app.showLog; break;
    case "leave": leave(); return;
    case "unlock": app.unlocked = +t.dataset.pid; updateFocus(); break;
    case "opt": submit(v.choice.options[+t.dataset.i].value); return;
    case "pickDone": submit([...d.pick]); return;
    case "zone": d.zone = +t.dataset.zone; break;
    case "thumbAdd": d.thumbs.push(d.zone); break;
    case "thumbDel": d.thumbs.pop(); break;
    case "clear": d.lines = {}; d.thumbs = []; break;
    case "lock": submit(draftCast()); return;
    case "download": download(); return;
    case "reconnect": reconnect(); return;
    case "stats": openStats(); return;
    case "statsMd": case "statsCsv": case "statsImg": case "compareMd": case "compareCsv": statsDownload(t.dataset.act, t); return;
    case "replay": openReplay(t.dataset.i === "cur" ? gameRecord() : app.statsLogs[+t.dataset.i], t.dataset.i === "cur" ? "game" : "stats"); return;
    case "replayGo": replayGo(t.dataset.to); return;
    case "replayPlay": replayPlay(); render(); return;
    case "replayClose": closeReplay(); return;
    case "recentStats": showStats([app.recentStats[+t.dataset.i]]); return;
    case "recentAll": showStats(app.recentStats); return;
    case "statsBack": app.screen = "lobby"; app.statsList = []; break;
    case "seatBot": case "seatHuman":
      if (app.role !== "host") return;
      app.st = setSeatKind(app.st, +t.dataset.i, t.dataset.act === "seatBot" ? "bot" : "human");
      changed(); return;
    default: return;
  }
  render();
});

function clickCard(id, elx) {
  const v = currentView();
  const c = v?.choice;
  const d = app.draft;
  if (!c) return;
  if (c.type === "pickCards" && elx.closest(".hand-cards")) {
    d.pick = d.pick.includes(id) ? d.pick.filter((x) => x !== id) : d.pick.length < c.count ? [...d.pick, id] : d.pick;
  } else if (c.type === "cast") {
    const slot = elx.closest(".slot");
    if (slot) {
      const z = +slot.dataset.zone;
      d.lines[z] = d.lines[z].filter((x) => x !== id);
      if (!d.lines[z].length) { delete d.lines[z]; d.thumbs = d.thumbs.filter((t) => t !== z); }
    } else if (elx.closest(".hand-cards") && !Object.values(d.lines).flat().includes(id)) {
      (d.lines[d.zone] ||= []).push(id);
    }
  } else return;
  render();
}

root.addEventListener("change", (e) => {
  const t = e.target, a = t.dataset.act, lob = app.lob;
  if (a === "statsFile") { loadStatsFiles([...t.files]); return; }
  if (a === "replaySeek") { replayGo(t.value); return; }
  if (a === "mode") { lob.modeId = t.value; fitSeats(); }
  else if (a === "mod") lob.mods = t.checked ? [...lob.mods, t.value] : lob.mods.filter((x) => x !== t.value);
  else if (a === "seatKind") lob.seats[+t.dataset.i].kind = t.value;
  else return;
  saveLobby();
  render();
});

// replay: arrow keys step, shift+arrow jumps a round, space plays/pauses
document.addEventListener("keydown", (e) => {
  if (app.screen !== "replay" || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === "ArrowRight") replayGo(e.shiftKey ? "nextRound" : "next");
  else if (e.key === "ArrowLeft") replayGo(e.shiftKey ? "prevRound" : "prev");
  else if (e.key === " ") { replayPlay(); render(); }
  else return;
  e.preventDefault();
});

// drop stats reports / game logs anywhere on the lobby
root.addEventListener("dragover", (e) => { if (app.screen !== "game") e.preventDefault(); });
root.addEventListener("drop", (e) => {
  if (app.screen === "game" || !e.dataTransfer?.files.length) return;
  e.preventDefault();
  loadStatsFiles([...e.dataTransfer.files]);
});

root.addEventListener("input", (e) => {
  const t = e.target, a = t.dataset.act, lob = app.lob;
  if (a === "seatName") lob.seats[+t.dataset.i].name = t.value;
  else if (a === "seed") lob.seed = t.value;
  else if (a === "joinName") lob.joinName = t.value;
  else if (a === "joinCode") lob.joinCode = t.value;
  else if (a === "survey") app.survey[t.dataset.k] = t.value;
});

boot();
