// HTML for every screen. Pure functions: (data, view/ui state) -> string. No game rules here:
// anything rule-shaped comes from the engine (view, castProblem, lineStats).
//
// Layout: every screen is drawn on one 1920×1080 "stage" that ui/stage.js scales to fit the window
// (letterboxed), like a Unity Canvas Scaler with a 1920×1080 reference. Screens return the stage's inner
// HTML; app.js wraps it. Narrow/portrait windows (phones) get the same markup in a scrolling flow layout.
// During a round's resolution the narrator (ui/show.js) owns what the table *shows*: scores, zone holders,
// the round and the Wheel come from app.show.disp until each beat has played.
import { lineStats } from "../engine/line.js";
import { roundSummary } from "../engine/summary.js";
import { LOCATIONS } from "../engine/modules/locations.js";
import { audioSettings } from "./fx.js";
import { resFor } from "./beats.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const el = (e) => `<img class="el" src="assets/elements/${e}.png" alt="${e}">`;
const dots = (n, max) => Array.from({ length: Math.max(n, max) }, (_, i) => `<span class="dot ${i < n ? "on" : ""}"></span>`).join("");
const chip = (p) => `<span class="chip" style="--c:${p.color}">${esc(p.name)}</span>`;
const unitOf = (track) => (track === "rep" ? "Rep" : "damage");
const MODE_ART = { classic: "line", corners: "corner", "hold-the-block": "block", "posted-up": "tunnel" };

export function card(c, { cls = "", tag = "button", style = "", hide = false } = {}) {
  // hide: the lead-card "art only" option covers the ATK/BLK strip, so the tooltip must not give them away either
  const title = hide ? `${c.name}: ${c.start} → ${c.end}, length ${c.len}` : `${c.name}: ${c.start} → ${c.end}, length ${c.len}, ATK ${c.atk}, BLK ${c.blk}`;
  if (hide) cls += " lead-hide";
  const face = c.img
    ? `<img src="${c.img}" alt="${esc(c.name)}" draggable="false" onerror="if(!this.dataset.r){this.dataset.r=1;this.src='${c.img}?r='+Date.now()}">`
    : `<div class="card-text"><b>${esc(c.name)}</b>${el(c.start)}→${el(c.end)}<span>L${c.len} · A${c.atk} · B${c.blk}</span></div>`;
  return `<${tag} class="card ${cls}" data-card="${c.id}" title="${esc(title)}" ${style ? `style="${style}"` : ""}>${face}<span class="card-stats">${el(c.start)}${el(c.end)} L${c.len}${hide ? "" : ` <b class="a">${c.atk}</b>/<b class="b">${c.blk}</b>`}</span></${tag}>`;
}
const back = (cls = "mini") => `<span class="card ${cls} facedown"><img src="assets/card_back.webp" alt="" draggable="false"></span>`;
const backs = (n) => `<span class="backs">${Array.from({ length: n }, (_, i) => `<img src="assets/card_back.webp" alt="" style="--i:${i}">`).join("")}</span>`;

export function topbar(app, sub) {
  const inGame = app.screen === "game" || app.screen === "replay";
  return `<header class="top">
    <div class="brand"><b>Hood Sorcery</b> <span class="muted">${esc(sub)}</span></div>
    <nav>
      <button class="icon" data-act="sound" title="Sound on/off">${audioSettings().muted ? "🔇" : "🔊"}</button>
      <button class="icon" data-act="settings" title="Settings">⚙</button>
      <button data-act="rules">Rules</button>
      ${inGame ? `<button data-act="stats">Stats</button><button data-act="toggleLog" class="${app.showLog ? "on" : ""}">Log</button>` : ""}
      ${app.screen === "game" ? `<button data-act="leave">Leave</button>` : ""}
      ${app.screen === "replay" ? `<button data-act="replayClose">Close replay</button>` : ""}
    </nav></header>`;
}

// ------------------------------------------------------------------ main menu (title screen)
export function menu(app) {
  const { data } = app;
  const recent = app.recentStats?.[0];
  return `<div class="menu">
    <div class="menu-bg"></div><div class="rain"></div>
    <div class="menu-left">
      <div class="vein-sigil"></div>
      <h1 class="logo"><span>Hood</span><span>Sorcery</span></h1>
      <div class="tagline">Four crews · one Vein · cast your line</div>
      <nav class="menu-nav">
        <button class="neon" data-act="go" data-to="setup" style="--i:0">Play</button>
        <button class="neon" data-act="go" data-to="online" style="--i:1">Play online</button>
        <button class="neon" data-act="go" data-to="statsMenu" style="--i:2">Game stats</button>
        <button class="neon" data-act="howto" style="--i:3">How to play</button>
        <button class="neon" data-act="settings" style="--i:4">Settings</button>
      </nav>
      ${recent ? `<p class="menu-recent muted small">Last game: ${esc(recent.mode.name)} · ${esc(recent.winner || "?")} won</p>` : ""}
    </div>
    <div class="lineup">${data.crews.map((c, i) => `<div class="crew-stand" style="--c:${c.color};--i:${i}"><img src="${c.img}" alt=""><b>${esc(c.name)}</b></div>`).join("")}</div>
    <div class="menu-foot muted small">Playtest build · SRD v3.10.20 rules · <button class="link" data-act="credits">Credits</button></div>
    <div class="menu-top"><button class="icon" data-act="sound" title="Sound on/off">${audioSettings().muted ? "🔇" : "🔊"}</button></div>
  </div>`;
}

// ------------------------------------------------------------------ setup wizard: mode → crews → house rules
const STEPS = ["Mode", "Crews", "House rules"];
export function setup(app) {
  const step = app.setupStep || 0;
  const body = [setupMode, setupCrews, setupRules][step](app);
  const online = app.lob.seats.some((s) => s.kind === "online");
  const missing = app.lob.seats.filter((s, i) => s.kind === "online" && !app.net.seatNames?.[i]).length;
  const canStart = !online || (app.net.code && !missing);
  return `<div class="setup">
    <div class="setup-head">
      <button class="ghost" data-act="${step ? "step" : "go"}" data-to="${step ? step - 1 : "menu"}">← ${step ? "Back" : "Menu"}</button>
      <ol class="steps">${STEPS.map((s, i) => `<li class="${i === step ? "on" : i < step ? "done" : ""}" data-act="step" data-to="${i}"><i>${i + 1}</i>${s}</li>`).join("")}</ol>
      <div class="setup-actions">
        ${step < 2 ? `<button class="primary big" data-act="step" data-to="${step + 1}">Next →</button>` : ""}
        <button class="${step === 2 ? "primary big" : "big"}" data-act="start" ${canStart ? "" : "disabled"}>${online ? "Start online game" : "Start game"}</button>
      </div>
    </div>
    <div class="setup-body step${step}">${body}</div>
    ${app.lobbyError ? `<p class="err setup-err">${esc(app.lobbyError)}</p>` : ""}
  </div>`;
}

function setupMode(app) {
  return `<h2 class="step-title">Pick a game mode</h2>
  <div class="mode-row">${Object.values(app.modes).map((m, i) => `
    <label class="mode-card ${m.id === app.lob.modeId ? "sel" : ""}" style="--i:${i}">
      <input type="radio" name="mode" value="${m.id}" ${m.id === app.lob.modeId ? "checked" : ""} data-act="mode">
      <div class="mode-art art-${MODE_ART[m.id] || "corner"}"></div>
      <div class="mode-text">
        <span class="mode-name">${esc(m.name)}</span> <span class="tag">${esc(m.pathway)}</span>
        <p>${esc(m.blurb)}</p>
        <div class="mode-meta"><span>👥 ${m.players.join("/")} crews</span><span>${m.win.best === "lowest" ? "🩸 least damage wins" : "⭐ most Rep wins"}</span></div>
      </div>
      <button class="link" data-act="rulesFor" data-id="${m.id}">Rules</button>
    </label>`).join("")}</div>`;
}

function setupCrews(app) {
  const { lob, data, net } = app;
  const mode = app.modes[lob.modeId];
  const seats = lob.seats.map((s, i) => {
    const crew = data.crews[i];
    const taken = net.seatNames?.[i];
    const kinds = [["human", "🙂 Human"], ["bot", "🤖 Bot"], ["online", "🌐 Online"]].map(([v, l]) => `<button class="seg ${s.kind === v ? "on" : ""}" data-act="seatKind" data-i="${i}" data-v="${v}">${l}</button>`).join("");
    return `<div class="crew-card" style="--c:${crew.color};--i:${i}">
      <div class="crew-glow"></div><img src="${crew.img}" alt="">
      <div class="crew-name">${esc(crew.name)}</div><small class="muted">${crew.seat} · ${["fire", "water", "earth", "wind"][i]}</small>
      <div class="segs">${kinds}</div>
      ${s.kind === "online" ? `<span class="muted small">${taken ? "✔ " + esc(taken) : net.code ? "waiting to join…" : "joins with the room code"}</span>` : `<input data-act="seatName" data-i="${i}" placeholder="${s.kind === "bot" ? "Bot name" : "Player name"}" value="${esc(s.name)}" maxlength="24">`}
      ${lob.seats.length > Math.min(...mode.players) && i === lob.seats.length - 1 ? `<button class="x" data-act="seatDel" title="Remove this crew">×</button>` : ""}
    </div>`;
  }).join("");
  const add = lob.seats.length < Math.max(...mode.players)
    ? `<button class="crew-card add" data-act="seatAdd"><span>+</span>Add ${esc(data.crews[lob.seats.length].name)}</button>` : "";
  return `<h2 class="step-title">Who's at the table? <small class="muted">${esc(mode.name)} plays with ${mode.players.join("/")} crews</small></h2>
    <div class="crew-row">${seats}${add}</div>`;
}

const RULE_GROUPS = [["twist", "Round twists", "change what happens when lines flip"], ["length", "Game length and Thumbs", ""], ["mode", "Only for this mode", "tied to the corner, block or spot rules"]];

function setupRules(app) {
  const { lob, modes, modifiers, net, data } = app;
  const mode = modes[lob.modeId];
  const all = Object.values(modifiers);
  const row = (m) => {
    const on = lob.mods.includes(m.id);
    return `<label class="rule ${on ? "on" : ""}">
      <input type="checkbox" data-act="mod" value="${m.id}" ${on ? "checked" : ""}>
      <span class="switch"></span><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></label>`;
  };
  const groups = RULE_GROUPS.map(([g, title, sub]) => {
    const list = all.filter((m) => (m.group || "twist") === g && !app.modProblem(mode, m));
    return list.length ? `<section class="rgroup"><h3>${title}${sub ? ` <small class="muted">${sub}</small>` : ""}</h3><div class="rule-list">${list.map(row).join("")}</div></section>` : "";
  }).join("");
  const hidden = all.filter((m) => app.modProblem(mode, m));
  const online = lob.seats.some((s) => s.kind === "online");
  const missing = lob.seats.filter((s, i) => s.kind === "online" && !net.seatNames?.[i]).length;
  const ticked = lob.mods.filter((id) => modifiers[id] && !app.modProblem(mode, modifiers[id]));
  const kindIcon = (k) => (k === "bot" ? "🤖 Bot" : k === "online" ? "🌐 Online" : "🙂 Human");
  return `<div class="rules-grid">
    <div class="rules-main"><h2 class="step-title">House rules <small class="muted">optional twists from the rework pathways</small></h2>
      <div class="rules-scroll">${groups || '<p class="muted">No house rules fit this mode.</p>'}
      ${hidden.length ? `<p class="muted small rhidden">Not used with ${esc(mode.name)}: ${hidden.map((m) => esc(m.name)).join(", ")}.</p>` : ""}</div></div>
    <aside class="summary-card">
      <div class="mode-art art-${MODE_ART[mode.id] || "corner"}"></div>
      <h3>${esc(mode.name)} <span class="tag">${esc(mode.pathway)}</span></h3>
      <div class="sum-block"><h4>Crews</h4>
        ${lob.seats.map((s, i) => `<div class="sum-crew" style="--c:${data.crews[i].color}"><i></i><b>${esc(s.kind === "online" ? net.seatNames?.[i] || "online seat" : s.name || data.crews[i].name)}</b><span class="muted">${kindIcon(s.kind)}</span></div>`).join("")}</div>
      <div class="sum-block"><h4>House rules</h4>
        ${ticked.length ? ticked.map((id) => `<div class="sum-rule"><span>✓</span>${esc(modifiers[id].name)}</div>`).join("") : '<div class="muted small">None: the mode as written.</div>'}</div>
      <div class="sum-block seed-row">
        <label class="rule mini ${lob.seedRandom ? "on" : ""}"><input type="checkbox" data-act="seedRandom" ${lob.seedRandom ? "checked" : ""}><span class="switch"></span>Random game</label>
        ${lob.seedRandom ? `<span class="muted small">a new shuffle every game</span>` : `<input data-act="seed" value="${esc(lob.seed)}" size="8" title="Same seed + same choices = same game"><button class="icon" data-act="reseed" title="Roll a new seed">🎲</button>`}
      </div>
      ${online ? `<div class="room">${net.code
          ? `<div class="code">Room <b>${net.code}</b></div><button data-act="copyLink">Copy invite link</button><p class="muted small">${missing ? `Waiting for ${missing} player${missing > 1 ? "s" : ""}…` : "Everyone is in."}</p>`
          : `<button class="primary" data-act="host">Open online room</button>`}<p class="muted small">${esc(net.status || "")}</p></div>` : ""}
    </aside>
  </div>`;
}

export function online(app) {
  const { lob } = app;
  return `<div class="online">
    <div class="setup-head"><button class="ghost" data-act="go" data-to="menu">← Menu</button><h2>Play online</h2><span></span></div>
    <div class="online-cards">
      <section class="pane big-choice"><div class="mode-art art-corner"></div><h3>Host a table</h3>
        <p class="muted">Set up the game, mark seats as <b>Online</b>, then share the room code. Bots can fill empty seats.</p>
        <button class="primary big" data-act="hostSetup">Set up a table</button></section>
      <section class="pane big-choice"><div class="mode-art art-lot"></div><h3>Join a table</h3>
        <p class="muted">Got a room code from a friend?</p>
        <input data-act="joinName" placeholder="Your name" value="${esc(lob.joinName)}" maxlength="24">
        <input data-act="joinCode" class="code-in" placeholder="ROOM CODE" value="${esc(lob.joinCode)}" maxlength="6">
        <button class="primary big" data-act="join">Join</button>
        ${app.lobbyError ? `<p class="err">${esc(app.lobbyError)}</p>` : ""}<p class="muted small">${esc(app.net.status || "")}</p></section>
    </div>
  </div>`;
}

export function clientLobby(app) {
  const l = app.remoteLobby;
  const crew = app.seat != null ? app.data.crews[app.seat] : null;
  return `<div class="online waiting">
    <div class="setup-head"><button class="ghost" data-act="go" data-to="menu">← Leave</button><h2>Room ${esc(app.net.code || "")}</h2><span></span></div>
    <section class="pane wait-card">
      ${crew ? `<div class="you-are" style="--c:${crew.color}"><img src="${crew.img}" alt=""><div>You are<br><b>${esc(crew.name)}</b></div></div>` : "<p>The table is full: you're watching.</p>"}
      ${l ? `<p>Mode: <b>${esc(app.modes[l.modeId]?.name)}</b>${l.mods.length ? " + " + l.mods.map((id) => esc(app.modifiers[id]?.name)).join(", ") : ""}</p>
        <div class="sum-crews">${l.seats.map((s, i) => `<span class="chip" style="--c:${app.data.crews[i].color}">${esc(s)}</span>`).join(" ")}</div>` : ""}
      <p class="muted">Waiting for the host to start<span class="dots3"><i>.</i><i>.</i><i>.</i></span></p>
      ${app.net.lost ? `<button class="primary big" data-act="reconnect">Reconnect</button>` : ""}
      <p class="muted small">${esc(app.net.status || "")}</p>
    </section>
  </div>`;
}

// ------------------------------------------------------------------ settings / credits / how to play (modals)
export function settingsModal(app) {
  const a = audioSettings(), s = app.settings;
  const seg = (key, opts) => `<div class="segs">${opts.map(([v, l]) => `<button class="seg ${s[key] === v ? "on" : ""}" data-act="setting" data-k="${key}" data-v="${v}">${l}</button>`).join("")}</div>`;
  return `<h2>Settings</h2>
    <div class="settings">
      <label>Music <input type="range" min="0" max="100" value="${Math.round(a.music * 100)}" data-act="vol" data-k="music"></label>
      <label>Sound effects <input type="range" min="0" max="100" value="${Math.round(a.sfx * 100)}" data-act="vol" data-k="sfx"></label>
      <label class="rule mini ${a.muted ? "on" : ""}"><input type="checkbox" data-act="muteAll" ${a.muted ? "checked" : ""}><span class="switch"></span>Mute everything</label>
      <div><b>Round resolution</b> <small class="muted">how fast the table plays out what happened</small>${seg("speed", [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"], ["instant", "Instant"]])}</div>
      <div><b>Round results pop-up</b> <small class="muted">the ranking and Damage Matrix at the end of a round</small>${seg("results", [["auto", "Closes itself"], ["click", "Wait for a click"], ["off", "Off"]])}</div>
      <div><b>Scores</b> <small class="muted">show damage / Rep</small>${seg("pace", [["each", "One crew at a time"], ["together", "All at once"]])}</div>
      <div><b>Bots</b> <small class="muted">how long they think</small>${seg("botSpeed", [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]])}</div>
    </div>`;
}

export const howToHtml = `<h2>How to play</h2>
  <p><b>Hood Sorcery</b>: four crews tap the Vein under the city. Every round, everyone builds a <b>line</b> of spell cards <b>in secret</b>, then all lines flip at once.</p>
  <ol>
    <li><b>The Wheel spins</b> and bends this round's rules.</li>
    <li><b>Build your line:</b> drag cards from your hand into a zone (or click them). Your cards' lengths must fit in <b>8 fingers</b>, at most 3 cards.
      When one card <b>ends</b> on the element the next one <b>starts</b> with, it's a <b>seam</b>: −1 length and +1 ATK (🔥 fire, 🌪 wind) or +1 BLK (💧 water, 🪨 earth).</li>
    <li><b>Trigger Thumbs</b> (2 a game): roll a die for a bonus, or bad luck.</li>
    <li><b>Cast</b>, then watch the flip: ATK attacks, BLK defends. The mode decides who takes damage or Rep.</li>
  </ol>
  <p>After 8 rounds the Vein closes. <b>Rules</b> in the top bar explains the mode you're playing.</p>`;

export function creditsHtml() {
  return `<h2>Credits</h2>
  <p>Card art, crews and lore © Siyaman Studios. Rules: SRD v3.10.20; every mode here is a playtest variant.</p>
  <p><b>Sound</b> (all CC0 / public domain): Casino Audio, Impact Sounds, Interface Sounds and Music Jingles by Kenney (kenney.nl) ·
  Organic Wooshes by Ben Burnes · music "Empty Street Static", "Rain Off the Neon Signs", "Streetlights in the Rearview" from Open Lo-Fi by btahir.
  Details in <code>assets/audio/CREDITS.md</code>.</p>
  <p>Fonts: Gelasio, Noto Sans (Google Fonts, OFL). Online play: PeerJS.</p>`;
}

// ------------------------------------------------------------------ stats screen
export function statsScreen(app, body) {
  const n = app.statsList.length;
  const tabs = (n > 1 ? [["compare", "Compare"]] : []).concat(app.statsList.map((s, i) => [String(i), `${s.mode.name} · ${s.winner || "in progress"}`]));
  return `${topbar(app, "Game stats")}
  <main class="statsview">
    <div class="tabs"><button data-act="statsBack">← Menu</button>${tabs.length > 1 ? tabs.map(([k, l]) => `<button class="tab ${String(app.statsTab) === k ? "on" : ""}" data-act="statsTab" data-i="${k}">${esc(l)}</button>`).join("") : ""}</div>
    ${body}
  </main>`;
}

export function statsMenu(app) {
  const recent = app.recentStats || [];
  return `<div class="online">
    <div class="setup-head"><button class="ghost" data-act="go" data-to="menu">← Menu</button><h2>Game stats</h2><span></span></div>
    <div class="online-cards">
      <section class="pane big-choice"><h3>Recent games</h3>
        ${recent.length ? `<div class="recent">${recent.map((s, i) => `<button data-act="recentStats" data-i="${i}" title="${esc(s.generated || "")}"><b>${esc(s.mode.name)}</b> · ${esc(s.winner || "?")} won<small class="muted"> ${s.roundsPlayed} rounds</small></button>`).join("")}</div>
          ${recent.length > 1 ? `<button data-act="recentAll">Compare all ${recent.length}</button>` : ""}` : '<p class="muted">No finished games on this browser yet.</p>'}</section>
      <section class="pane big-choice"><h3>Load files</h3>
        <p class="muted">A stats report (.md) or a game log (.json). Several files at once are compared side by side; game logs can be replayed.</p>
        <label class="file button primary big">Choose files…<input type="file" accept=".md,.json,.txt" multiple data-act="statsFile"></label>
        <p class="muted small">or drop them anywhere on this page</p>${app.lobbyError ? `<p class="err">${esc(app.lobbyError)}</p>` : ""}</section>
    </div>
  </div>`;
}

export function compareBody(n, html) {
  return `<section class="stats compare"><h2>${n} games compared</h2><div class="stats-md">${html}</div>
    <div class="row"><button data-act="compareMd">Comparison (.md)</button><button data-act="compareCsv">Comparison (.csv)</button><span class="muted small">Each game's own report is in its tab.</span></div></section>`;
}

// ------------------------------------------------------------------ game
export function game(app, v, opts = {}) {
  const { data } = app;
  const pl = v.players;
  const me = v.you != null ? pl[v.you] : null;
  const track = v.mode.win.track;
  const show = app.show, disp = show.disp || {};
  const busy = show.busy;
  const sector = data.wheel.find((w) => w.id === (disp.wheel !== undefined ? disp.wheel : v.wheel));
  const round = disp.round ?? v.round;
  const sum = roundSummary(v);
  const hot = !busy && app.revealing && sum?.round === app.revealing ? sum : null; // what changed in the round just played
  const title = `${v.mode.name}${v.mode.modifiers.length ? " + " + v.mode.modifiers.map((id) => app.modifiers[id]?.name || id).join(", ") : ""}`;
  const htb = v.mode.id === "hold-the-block";
  const holderId = htb ? (disp.holders && v.zones[0]?.name in disp.holders ? disp.holders[v.zones[0].name] : v.zones[0]?.holder) : null;
  const side = `
    <div class="roundrow">
      <div class="roundbox"><span class="muted">Round</span><b>${round || "–"}</b><span class="muted">of ${v.mode.params.rounds}</span></div>
      <div class="limits"><span>Line <b>${v.limits?.line}</b></span><span>Cards <b>${v.limits?.maxCards}</b></span><span class="deck">${backs(1)} <b>${v.deckCount}</b></span></div>
    </div>
    ${sector ? `<div class="wheelbox ${sector.type}"><img src="${sector.img}" alt=""><div class="wtext"><b>${esc(sector.name)}</b>${v.fx !== sector.effect && sector.id === v.wheel ? `<small class="muted">${esc(v.mode.name)} reading</small>` : ""}<p>${esc(sector.id === v.wheel ? fxText(v, sector) : sector.text)}</p></div></div>` : `<div class="wheelbox"><div class="wheel-wait"></div><div class="wtext"><b class="muted">The Wheel…</b></div></div>`}
    ${v.stake > 1 || v.folded?.length ? `<div class="stake">Stakes <b>×${v.stake}</b>${v.folded?.length ? ` · folded ${v.folded.map((id) => esc(pl[id].name)).join(", ")}` : ""}</div>` : ""}
    <div class="crews">${pl.map((p) => playerBox(app, v, p, track, hot, holderId)).join("")}</div>
    ${netStrip(app)}
    ${opts.side || ""}`;
  const popup = show.res && (busy || !v.over) ? resultsPopup(app, v) : "";
  const quiet = (popup && show.cur?.type === "rank") || (show.cur && !show.cur.caption); // the popup says it better than a caption
  const strip = busy
    ? `<div class="narrator ${quiet ? "ghost" : ""} t-${show.cur?.type}" data-k="b${show.seq}">${show.cur && !quiet ? captionHtml(v, show.cur) : ""}</div>`
    : summaryStrip(v, sum, hot, busy);
  const board = v.over && !opts.panel && !busy
    ? endPanel(app, v)
    : `<div class="arena"><div class="zones n${v.zones.length} c${pl.length}">${v.zones.map((z) => zoneBox(app, v, z, hot, holderId)).join("")}</div>${popup}</div>${strip}${opts.panel || (busy ? resolvingPanel(app) : actionPanel(app, v, holderId))}`;
  const hand = me && me.hand ? handRow(app, v, me, busy)
    : app.cover == null && app.localCount > 1 && !v.over ? `<div class="hand hidden-hand muted">Hands are hidden between turns (pass-and-play).</div>` : "";
  const cls = [app.showLog ? "with-log" : "", app.revealing ? "revealing" : "", show.cur?.type === "reveal" ? "fresh" : "", me ? "has-me" : "no-me", `crews${pl.length}`, busy ? "busy" : "", app.drag ? "dragging-on" : "", `mode-${v.mode.id}`, htb && me ? (holderId === me.id ? "role-holder" : "role-street") : ""].join(" ");
  return `<div class="game ${cls}">
    ${topbar(app, title)}
    <aside class="side">${side}</aside>
    <section class="board">${board}</section>
    <section class="handarea">${hand}</section>
    ${app.showLog ? `<aside class="log">${logHtml(v)}</aside>` : ""}
    ${app.cover != null && !busy ? coverScreen(app, v, sum) : ""}
  </div>`;
}

// Caption of the beat the narrator is playing: crew names become coloured chips.
function captionHtml(v, b) {
  let t = esc(b.caption);
  for (const p of [...v.players].sort((a, c) => c.name.length - a.name.length)) t = t.split(esc(p.name)).join(`<span class="chip" style="--c:${p.color}">${esc(p.name)}</span>`);
  return t;
}

// The cards cast in a round: face down until the narrator's reveal beat, then they flip over.
const resOf = (v) => (v.revealed ? v.res : v.lastRes);
const resRound = (v) => (v.revealed ? v.round : v.round - 1);
const flipCards = (app, ids, start = 0) => ids.map((id, i) => `<span class="flip" style="--i:${start + i}">${card(app.data.cardMap[id], { cls: "mini", tag: "span" })}</span>`).join("");

function summaryStrip(v, sum, hot, busy) {
  if (busy) return "";
  if (!sum) return `<div class="summary muted">${v.revealed ? "The lines are up." : "The Vein is waiting. First round."}</div>`;
  const items = sum.items.length
    ? sum.items.map((i) => `<span class="sum-item ${i.kind}" style="--c:${v.players[i.pid].color}">${esc(i.text)}</span>`).join("")
    : `<span class="muted">no change</span>`;
  return `<div class="summary ${hot ? "hot" : ""}" title="${esc(sum.text)}"><b>Round ${sum.round}</b>${items}<span class="grow"></span><button class="link" data-act="showResults" data-r="${sum.round}">Results</button></div>`;
}

// Online games: who is connected. The host can hand a dropped seat to a bot (and back); a client can reconnect.
function netStrip(app) {
  const seats = app.role === "host" ? app.netSeats() : app.role === "client" && !app.net.lost ? app.remoteNet || [] : [];
  if (app.role !== "client" && !seats.length) return "";
  const me = app.role === "client"
    ? `<span class="conn ${app.net.lost ? "off" : "on"}">You: ${app.net.lost ? "disconnected" : "connected"}</span>${app.net.lost ? `<button class="primary" data-act="reconnect">Reconnect</button>` : ""}`
    : "";
  const list = seats.map((s) => {
    const p = app.data.crews[s.seat];
    const btn = app.role !== "host" || app.screen !== "game" ? ""
      : s.bot ? `<button data-act="seatHuman" data-i="${s.seat}" title="Stop the bot; ${esc(s.name)} decides again">Give back</button>`
      : !s.on ? `<button data-act="seatBot" data-i="${s.seat}">Bot takes over</button>` : "";
    return `<span class="conn ${s.on ? "on" : "off"}"><span class="chip" style="--c:${p.color}">${esc(s.name)}</span> ${s.on ? "connected" : "dropped"}${s.bot ? " · bot" : ""}</span>${btn}`;
  }).join("");
  return `<div class="netstrip">${me}${list}${app.net.status ? `<span class="muted small">${esc(app.net.status)}</span>` : ""}</div>`;
}

function fxText(v, sector) {
  const custom = {
    extraZone: "An extra corner (The Turf) opens this round; up to 4 cards.",
    muggedCorner: "The corner won with the highest total goes to its runner-up.",
    challengerTies: "Challengers win ties against holders this round.",
    bleedingRep: "Every crew that lost a contest loses 1 Rep.",
    noHeal: "The Vein doesn't feed the holder this round.",
    holderBlkDown: "The holder's BLK counts 2 less this round.",
  };
  return custom[v.fx] || sector.text;
}

function playerBox(app, v, p, track, hot, holderId) {
  const show = app.show, disp = show.disp || {};
  const shownRound = disp.shownRound ?? resRound(v);
  const r = v.revealed && shownRound >= v.round ? v.res[p.id] : null;
  const pend = show.busy ? null : v.pending;
  const deciding = pend && pend.who.includes(p.id);
  const done = deciding && pend.done.includes(p.id);
  const holds = v.zones.filter((z) => (disp.holders && z.name in disp.holders ? disp.holders[z.name] : z.holder) === p.id);
  const mine = hot ? hot.items.filter((i) => i.pid === p.id) : [];
  const shown = (app.revealing || show.busy) && shownRound >= resRound(v) ? resOf(v)?.[p.id] : null;
  const ranks = disp.ranks;
  const rank = ranks?.atk.includes(p.id) ? `<span class="rb atk">ATK #${ranks.atk.indexOf(p.id) + 1}</span><span class="rb blk">BLK #${ranks.blk.indexOf(p.id) + 1}</span>` : "";
  const focus = show.cur?.pids?.includes(p.id);
  const isMe = p.id === v.you;
  const isHolder = holderId === p.id;
  const score = disp.scores?.[p.id] ?? p.tracks[track];
  const state = deciding ? `<span class="state ${done ? "done" : ""}">${done ? "✔ locked in" : `${esc(stepName(pend.step))}<span class="dots3"><i>.</i><i>.</i><i>.</i></span>`}</span>` : "";
  const holdsTxt = holderId == null && holds.length ? `<span class="holds">Holds ${holds.map((z) => esc(z.name)).join(", ")}</span>` : "";
  const at = p.at != null && v.mode.zones.castInto === "chosen" ? `<span>At <b>${esc(v.zones[p.at]?.name)}</b></span>` : "";
  const totals = shown ? `<span class="tot"><b class="a">${shown.atk}</b>/<b class="b">${shown.blk}</b></span>` : r ? `<span class="totals">A <b>${r.atk}</b> B <b>${r.blk}</b></span>` : "";
  const extra = [isHolder ? '<span class="crown">👑 HOLDER</span>' : "", holdsTxt, at, totals, rank].filter(Boolean).join("");
  return `<div class="pbox ${isMe ? "me" : ""} ${isHolder ? "holder" : ""} ${mine.length ? "changed" : ""} ${deciding && !done ? "thinking" : ""} ${focus ? "focus" : ""}" data-pid="${p.id}" style="--c:${p.color}">
    <img class="standee" src="${p.img}" alt="">
    <div class="pinfo">
      <div class="pname">${esc(p.name)}${p.kind === "bot" ? ' <small class="muted">bot</small>' : ""}${isMe ? ' <span class="you">YOU</span>' : ""}</div>
      <div class="pmeta">${dots(p.thumbs, v.mode.params.thumbs)} <span class="muted">Thumbs</span>${state}</div>
      ${extra ? `<div class="pextra">${extra}</div>` : ""}
    </div>
    <div class="score"><b>${score}</b><span class="muted">${unitOf(track)}</span></div>
  </div>`;
}

function zoneArt(v, z) {
  if (v.mode.id === "classic") return "line";
  if (z.extra) return "turf";
  if (z.block || v.mode.id === "hold-the-block") return "block";
  if (v.mode.id === "posted-up") return { Corner: "corner", Tunnel: "tunnel", Lot: "lot" }[z.name] || "lot";
  return "corner";
}

function zoneBox(app, v, z, hot, holderIdNow) {
  const show = app.show, disp = show.disp || {};
  const htb = v.mode.id === "hold-the-block";
  const holderId = htb ? holderIdNow : disp.holders && z.name in disp.holders ? disp.holders[z.name] : z.holder;
  const holder = holderId != null ? v.players[holderId] : null;
  const res = resOf(v);
  const faceUp = (disp.shownRound ?? resRound(v)) >= resRound(v);
  const past = !v.revealed && !app.revealing && !show.busy; // last round's lines, dimmed once the moment is over
  const taken = hot?.items.some((i) => i.kind === "take" && i.zone === z.name);
  const lineOf = (p) => res?.[p.id]?.lines.find((l) => l.zone === z.i);
  const lane = (p, ln) => `<div class="zline ${past ? "past" : ""} ${ln ? "" : "none"}" data-k="ln${p.id}" style="--c:${p.color}">
      <div class="lhead"><span class="chip">${esc(p.name)}</span>${ln && faceUp ? `<span class="zstat">A <b>${ln.atk}</b> B <b>${ln.blk}</b> · ${ln.len}f</span>` : ""}</div>
      <div class="lcards">${ln ? (faceUp ? flipCards(app, ln.cards, p.id * 3) : ln.cards.map(() => back()).join("")) : '<span class="muted small">–</span>'}</div></div>`;
  const posted = v.mode.zones.castInto === "chosen" ? v.players.filter((p) => p.at === z.i) : [];
  const opened = v.open ? v.players.filter((p) => v.open[p.id]?.zone === z.i) : [];
  const loc = z.loc ? LOCATIONS[z.loc] : null;
  const focus = show.cur?.zones?.includes(z.name);
  const lanes = v.players.map((p) => ({ p, ln: lineOf(p) })).filter((x) => x.ln);
  const leadMode = !!v.lead && !v.revealed && !htb && v.zones.length === 1; // Run It Up + lead card (Classic)
  let body;
  if (leadMode) {
    // the Run It Up pick: last round's lines are gone; you see your own line and each rival's first card
    body = `<div class="zlines lead">${v.players.map((p) => {
      const mine = p.id === v.you, ids = mine ? (v.casts?.[p.id]?.lines || []).flatMap((l) => l.cards) : v.lead[p.id] ? [v.lead[p.id]] : [];
      const c0 = app.data.cardMap[ids[0]];
      const read = !mine && c0 && !v.leadHide ? `<span class="zstat">Lead: A <b>${c0.atk}</b> B <b>${c0.blk}</b> · ${c0.len}f</span>` : mine ? '<span class="zstat">your line</span>' : "";
      return `<div class="zline" data-k="ld${p.id}" style="--c:${p.color}"><div class="lhead"><span class="chip">${esc(p.name)}</span>${read}</div>
        <div class="lcards">${ids.map((id) => card(app.data.cardMap[id], { cls: "mini", tag: "span", hide: !mine && v.leadHide })).join("")}${mine ? "" : `<span class="muted small hidden-more">+ hidden</span>`}</div></div>`;
    }).join("")}</div>`;
  } else if (htb) {
    // the Block is a duel: the holder sits apart from the Street, so roles are obvious at a glance
    const street = v.players.filter((p) => p.id !== holderId);
    body = `<div class="htb">
      <div class="hpane ${holder ? "" : "vacant"}"><div class="phead"><span class="crownbig">👑</span> Holder${holder && holder.id === v.you ? ' <small>(you)</small>' : ""}</div>
        ${holder ? lane(holder, lineOf(holder)) : '<div class="empty-block">The Block is empty<small>highest ATK takes it</small></div>'}</div>
      <div class="spane"><div class="phead">The Street <small>knock the holder off</small></div>
        <div class="slanes">${street.map((p) => lane(p, lineOf(p))).join("")}</div></div>
    </div>`;
  } else if (v.mode.id === "classic" && !lanes.length) {
    // nobody has cast yet: show who is at the table and who has locked in, instead of an empty tile
    const pend = show.busy ? null : v.pending;
    body = `<div class="zlines">${v.players.map((p) => `<div class="zline none" data-k="ln${p.id}" style="--c:${p.color}"><div class="lhead"><span class="chip">${esc(p.name)}</span></div><div class="lcards"><span class="muted">${pend?.done.includes(p.id) ? "✔ locked in" : pend?.who.includes(p.id) ? "casting…" : "waiting"}</span></div></div>`).join("")}</div>`;
  } else body = `<div class="zlines">${lanes.map(({ p, ln }) => lane(p, ln)).join("")}</div>`;
  return `<div class="zone art-${zoneArt(v, z)} ${z.rich || z.hot ? "rich" : ""} ${z.extra ? "extra" : ""} ${taken ? "taken" : ""} ${focus ? "focus" : ""} ${lanes.length >= 4 ? "crowded" : ""}" data-zone="${esc(z.name)}" style="${holder ? `--h:${holder.color};` : ""}--lanes:${Math.max(2, lanes.length)}">
    <div class="zhead"><b>${esc(z.name)}</b>${z.rich ? ' <span class="badge">★ rich</span>' : ""}${past && !leadMode && (lanes.length || htb) && res ? ' <span class="badge old">last round</span>' : ""}
      ${v.mode.id === "classic" || htb ? "" : `<span class="holder">${holder ? chip(holder) : '<span class="muted">unclaimed</span>'}</span>`}</div>
    ${loc ? `<div class="loc" title="${esc(loc.text)}"><img src="assets/locations/${z.loc}.svg" alt="" onerror="this.remove()"><b>${esc(loc.name)}</b> ${esc(loc.text)}</div>` : ""}
    ${posted.length && !v.revealed ? `<div class="posted">${posted.map(chip).join(" ")}</div>` : ""}
    ${opened.length && !v.revealed ? `<div class="opened">${opened.map((p) => `<span class="zline">${chip(p)} ${card(app.data.cardMap[v.open[p.id].card], { cls: "mini", tag: "span" })}<small class="muted">opened</small></span>`).join("")}</div>` : ""}
    ${body}
  </div>`;
}

// Round results (pop-up over the board): every crew's line totals, the ranking and, in matrix modes, the printed
// Damage Matrix with each crew's token on its cell. It opens at the narrator's "totals" beat and fills in as the
// round plays out; closes by itself, or on a click. It only displays what the engine logged.
function resultsPopup(app, v) {
  const show = app.show, N = show.res.round, res = resFor(v, N);
  if (!res) return "";
  const done = !show.busy;
  const rk = v.log.findLast((e) => e.k === "rank" && e.r === N);
  const ranks = rk && (done || show.disp?.ranks) ? rk.ranks : null;
  const sum = roundSummary(v, N);
  const track = v.mode.win.track;
  const rankOf = (kind, pid) => (ranks ? ranks[kind].indexOf(pid) : -1);
  const ord = [...v.players].sort((a, b) => (ranks ? rankOf("atk", a.id) - rankOf("atk", b.id) : a.id - b.id));
  const resultOf = (p) => {
    if (!sum) return '<span class="muted">…</span>';
    if (v.folded?.includes(p.id) && rk && !ranks?.atk.includes(p.id)) return '<span class="muted">folded</span>';
    const items = sum.items.filter((i) => i.pid === p.id);
    return items.length ? items.map((i) => `<span class="ri ${i.kind === "damage" ? (i.delta > 0 ? "bad" : "good") : i.kind === "rep" ? (i.delta > 0 ? "good" : "bad") : "take"}">${esc(i.text.slice(p.name.length + 1))}</span>`).join("") : `<span class="muted">${track === "damage" ? "no damage" : "no change"}</span>`;
  };
  const rows = ord.map((p) => {
    const r = res[p.id], cards = (r?.lines || []).flatMap((l) => l.cards);
    return `<div class="rrow" data-k="rr${p.id}" style="--c:${p.color}">
      <img class="rstand" src="${p.img}" alt=""><b class="rname">${esc(p.name)}</b>
      <span class="rcards">${cards.map((id) => card(app.data.cardMap[id], { cls: "mini", tag: "span" })).join("")}</span>
      <span class="rstat a">ATK <b>${r?.atk ?? "–"}</b>${ranks?.atk.includes(p.id) ? `<i>#${rankOf("atk", p.id) + 1}</i>` : ""}</span>
      <span class="rstat b">BLK <b>${r?.blk ?? "–"}</b>${ranks?.blk.includes(p.id) ? `<i>#${rankOf("blk", p.id) + 1}</i>` : ""}</span>
      <span class="rres">${resultOf(p)}</span></div>`;
  }).join("");
  let matrix = "";
  if (rk?.m) {
    const n = rk.ranks.atk.length, M = rk.m, nth = (i) => ["1st", "2nd", "3rd", "4th"][i];
    const tokens = ranks ? Object.fromEntries(rk.ranks.atk.map((pid) => [`${rankOf("atk", pid)},${rankOf("blk", pid)}`, v.players[pid]])) : {};
    const cells = [`<div class="mh corner">ATK ↓ &nbsp; BLK →</div>`, ...Array.from({ length: n }, (_, b) => `<div class="mh">${nth(b)}</div>`)];
    for (let a = 0; a < n; a++) {
      cells.push(`<div class="mh">${nth(a)}</div>`);
      for (let b = 0; b < n; b++) {
        const t = tokens[`${a},${b}`];
        cells.push(`<div class="mc d${Math.min(M[a][b] * (rk.stake || 1), 4)} ${t ? "hit" : ""}" ${t ? `style="--c:${t.color}"` : ""}><i>${M[a][b] * (rk.stake || 1)}</i>${t ? `<img src="${t.img}" alt="${esc(t.name)}" title="${esc(t.name)}">` : ""}</div>`);
      }
    }
    matrix = `<div class="matrix"><h3>Damage Matrix${rk.stake > 1 ? ` <span class="badge">stakes ×${rk.stake}</span>` : ""}</h3>
      <div class="mgrid" style="--n:${n}">${cells.join("")}</div>
      <p class="muted small">Your ATK rank down the side, BLK rank across: the number is the damage that cell deals.</p></div>`;
  }
  const quiet = new Set(["reveal", "round", "wheel", "cast", "rank", "dmg", "shuffle", "setup", "swap", "flip", "seat"]);
  const extra = v.log.filter((e) => e.r === N && !quiet.has(e.k) && !(e.zone && "holder" in e)).slice(-3);
  const wheel = v.log.findLast((e) => e.r === N && e.k === "wheel");
  const wsec = wheel && app.data.wheel.find((w) => w.id === wheel.id);
  return `<div class="results ${matrix ? "with-matrix" : ""}" data-k="res${N}" data-act="closeResults" title="Click to close">
    <div class="res-head"><h2>Round ${N} results</h2>${wsec ? `<span class="wtag ${wsec.type}"><img src="${wsec.img}" alt="">${esc(wsec.name)}</span>` : ""}<span class="grow"></span>
      ${done ? "" : '<span class="muted small">resolving…</span>'}<button class="primary" data-act="closeResults">Continue ▶</button></div>
    <div class="res-body"><div class="rtable">${rows}</div>${matrix}</div>
    ${extra.length ? `<ul class="res-extra">${extra.map((e) => `<li>${esc(e.text)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

function resolvingPanel(app) {
  const s = app.settings.speed;
  return `<div class="panel resolving">
    <span class="muted">The table plays out the round…</span>
    <div class="segs">${[["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]].map(([v, l]) => `<button class="seg ${s === v ? "on" : ""}" data-act="setting" data-k="speed" data-v="${v}">${l}</button>`).join("")}</div>
    <button class="primary" data-act="skipShow">Skip ⏭</button>
  </div>`;
}

function actionPanel(app, v, holderId) {
  const c = v.choice;
  const err = app.error ? `<p class="err">${esc(app.error)}</p>` : "";
  if (!c) {
    const pend = v.pending;
    if (!pend) return `<div class="panel muted">…</div>`;
    const waiting = pend.who.filter((id) => !pend.done.includes(id)).map((id) => v.players[id]);
    return `<div class="panel waiting"><span class="muted">${esc(stepName(pend.step))}:</span> waiting for ${waiting.map(chip).join(" ")}<span class="dots3"><i>.</i><i>.</i><i>.</i></span>${err}</div>`;
  }
  if (c.type === "option") {
    return `<div class="panel choice" data-k="${app.draft.key}"><p class="prompt">${esc(c.prompt)}</p>
      <div class="opts">${c.options.map((o, i) => `<button class="opt" data-act="opt" data-i="${i}"><b>${esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ""}</button>`).join("")}</div>${err}</div>`;
  }
  if (c.type === "pickCards") {
    const n = app.draft.pick.length;
    return `<div class="panel choice" data-k="${app.draft.key}"><p class="prompt">${esc(c.prompt)}</p>
      <p>Picked <b>${n}</b>/${c.count}: click cards in your hand.</p>
      <button class="primary big" data-act="pickDone" ${n !== c.count ? "disabled" : ""}>Pass them</button>${err}</div>`;
  }
  if (c.type === "cast") return castPanel(app, v, c, err, holderId);
  return "";
}

// Hold the Block: say which side you are on, every round, right where you build your line.
function roleBanner(v, holderId) {
  if (v.mode.id !== "hold-the-block" || v.you == null) return "";
  if (holderId == null) return `<span class="role vacant">The Block is empty: the highest ATK takes it</span>`;
  if (holderId === v.you) return `<span class="role holder">👑 You hold the Block: defend it</span>`;
  return `<span class="role street">You are on the Street: knock ${esc(v.players[holderId].name)} off</span>`;
}

function castPanel(app, v, c, err, holderId) {
  const d = app.draft;
  const zones = app.allowedZones;
  const slots = zones.map((zi) => {
    const z = v.zones.find((x) => x.i === zi);
    const ids = d.lines[zi] || [];
    const s = lineStats(ids.map((id) => app.data.cardMap[id]));
    const th = d.thumbs.filter((t) => t === zi).length;
    return `<div class="slot ${d.zone === zi ? "active" : ""}" data-act="zone" data-zone="${zi}">
      <div class="slot-head"><b>${esc(z.name)}</b>${z.rich ? ' <span class="badge">★</span>' : ""}${th ? ` <span class="thumbs-on">${"●".repeat(th)}</span>` : ""}</div>
      <div class="slot-cards">${ids.length ? ids.map((id, k) => `${k && s.seams.some((x) => x.at === k) ? `<span class="seam" title="seam: −1 length, +1 ${s.seams.find((x) => x.at === k).bonus.toUpperCase()}">✦</span>` : ""}${card(app.data.cardMap[id], { cls: `in-line ${app.drag?.id === id ? "dragging" : ""}` })}`).join("") : '<span class="drop-hint">drag cards here</span>'}</div>
      <div class="slot-stats">A <b>${s.atk}</b> · B <b>${s.blk}</b> · ${s.len}f${s.seams.length ? ` · ${s.seams.length} seam${s.seams.length > 1 ? "s" : ""}` : ""}</div>
    </div>`;
  }).join("");
  const used = Object.values(d.lines).flat();
  const fingers = Object.values(d.lines).reduce((a, ids) => a + lineStats(ids.map((id) => app.data.cardMap[id])).len, 0);
  const me = v.players[v.you];
  const pct = Math.min(100, (fingers / c.limits.line) * 100);
  return `<div class="panel choice cast" data-k="${app.draft.key}"><p class="prompt">${roleBanner(v, holderId)}${esc(c.prompt)} <span class="muted">Drag cards into ${zones.length > 1 ? "a zone" : "your line"}; drag them back to undo.</span></p>
    <div class="castrow">
      <div class="slots s${zones.length}">${slots}</div>
      <div class="meter">
        <div class="fingers ${fingers > c.limits.line ? "bad" : ""}"><span>Fingers <b>${fingers}</b>/${c.limits.line}</span><i style="width:${pct}%"></i></div>
        <span>Cards <b class="${used.length > c.limits.maxCards ? "bad" : ""}">${used.length}</b>/${c.limits.maxCards}</span>
        ${c.noThumbs ? "" : `<span class="thumbctl">Thumbs <button data-act="thumbDel" ${!d.thumbs.length ? "disabled" : ""}>−</button><b>${d.thumbs.length}</b><button data-act="thumbAdd" ${d.thumbs.length >= Math.min(2, me.thumbs) ? "disabled" : ""}>+</button><small class="muted">${me.thumbs} left</small></span>`}
        <div class="row"><button data-act="clear">Clear</button><button class="primary big" data-act="lock" ${app.castProblem ? "disabled" : ""}>${c.step === "openCard" ? "Open it" : "Cast"}</button></div>
      </div>
    </div>
    ${app.castProblem && used.length ? `<p class="muted small hint">${esc(app.castProblem)}</p>` : ""}${err}
  </div>`;
}

function handRow(app, v, me, busy) {
  const c = busy ? null : v.choice;
  const used = c?.type === "cast" ? Object.values(app.draft.lines).flat() : [];
  const picked = c?.type === "pickCards" ? app.draft.pick : [];
  const order = (app.handOrder || []).filter((id) => me.hand.includes(id));
  const hand = [...order, ...me.hand.filter((id) => !order.includes(id))];
  const n = hand.length;
  const cards = hand.map((id, i) => card(app.data.cardMap[id], { cls: `${used.includes(id) ? "used" : ""} ${picked.includes(id) ? "picked" : ""} ${app.drag?.id === id ? "dragging" : ""}`, style: `--i:${i};--n:${n}` }));
  return `<div class="hand ${c ? "active" : ""}"><div class="hand-title">Your hand <span class="muted">${esc(me.name)}${c?.type === "cast" ? " · drag a card onto the table" : ""}</span></div><div class="hand-cards" data-act="hand">${cards.join("")}</div></div>`;
}

function coverScreen(app, v, sum) {
  const p = v.players[app.cover];
  return `<div class="cover" data-k="cover${p.id}" style="--c:${p.color}"><div class="cover-box">
    <img src="${p.img}" alt=""><h2>Pass the device to ${esc(p.name)}</h2>
    <p class="muted">${esc(stepName(v.pending?.step))}</p>
    ${sum ? `<p class="small">${esc(sum.text)}</p>` : ""}
    <button class="primary big" data-act="unlock" data-pid="${p.id}">I'm ${esc(p.name)}: show my hand</button></div></div>`;
}

const STEP_NAMES = { cast: "casting", swapMeet: "Swap Meet", flipScript: "Flip the Script", postUp: "posting up", stayBail: "stay or bail", callOut: "call-outs", passTab: "the Tab", openCard: "opening a card", runItUp: "Run It Up" };
export const stepName = (s) => STEP_NAMES[s] || s;

function endPanel(app, v) {
  const track = v.result.track;
  const w = v.players[v.result.order[0]];
  const rows = v.result.order.map((id, i) => {
    const p = v.players[id];
    return `<tr style="--c:${p.color};--i:${i}"><td class="place">${i + 1}</td><td><img src="${p.img}" alt=""> <b>${esc(p.name)}</b> <small class="muted">${esc(p.crew)}</small></td><td><b class="big-num">${p.tracks[track]}</b> ${unitOf(track)}</td><td class="small muted">${p.hist.map((h) => (track === "rep" ? h.rep : h.dmg)).join(" · ")}</td></tr>`;
  }).join("");
  const s = app.survey;
  return `<div class="panel end" style="--c:${w.color}">
    <div class="end-head"><img src="${w.img}" alt=""><div><small class="muted">The Vein closes</small><h2>${esc(w.name)} takes it</h2></div></div>
    <table class="standings">${rows}</table>
    <div class="end-grid">
      <div class="survey"><h3>Quick survey <small class="muted">saved into the log file</small></h3>
        <label class="q">Best moment of the game<textarea data-act="survey" data-k="best" rows="1">${esc(s.best)}</textarea></label>
        <label class="q">A round where the choice was obvious<textarea data-act="survey" data-k="obvious" rows="1">${esc(s.obvious)}</textarea></label>
        <label class="q">Did you change a cast because of another crew?<textarea data-act="survey" data-k="reads" rows="1">${esc(s.reads)}</textarea></label>
        <label class="q">Fun, 1–5 <input data-act="survey" data-k="fun" value="${esc(s.fun)}" size="3"></label>
      </div>
      <div class="end-actions">
        <button class="primary big" data-act="stats">Game stats</button>
        ${app.role !== "client" ? `<button class="big" data-act="replay" data-i="cur">Replay</button>` : ""}
        ${app.role === "local" ? `<button class="big" data-act="rematch">Play again</button>` : ""}
        <button data-act="download">Download log (.json)</button>
        <button data-act="leave">Main menu</button>
      </div>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ replay (A4)
export function replayPanel(app, v, rp) {
  const last = rp.stops.length - 1;
  const b = (to, label, title, off) => `<button data-act="replayGo" data-to="${to}" title="${title}" ${off ? "disabled" : ""}>${label}</button>`;
  const news = v.replayNew.filter((e) => e.k !== "round");
  return `<div class="panel replay">
    <div class="row">
      ${b("start", "⏮", "Start", !rp.at)}${b("prevRound", "◀◀", "Previous round (shift + ←)", !rp.at)}${b("prev", "◀", "Previous step (←)", !rp.at)}
      <button class="primary" data-act="replayPlay" title="Play / pause (space)">${rp.playing ? "⏸ Pause" : "▶ Play"}</button>
      ${b("next", "▶", "Next step (→)", rp.at === last)}${b("nextRound", "▶▶", "Next round (shift + →)", rp.at === last)}${b("end", "⏭", "End", rp.at === last)}
      <span class="muted small">Step ${rp.at}/${last} · round ${v.round}${v.over ? " · game over" : v.pending ? ` · next: ${esc(stepName(v.pending.step))}` : ""}</span>
    </div>
    <input type="range" class="seek" min="0" max="${last}" value="${rp.at}" data-act="replaySeek" aria-label="Replay position">
    ${rp.diverged ? `<p class="err small">This replay ends differently from the saved result: the rules changed since the game was played.</p>` : ""}
    <div class="replay-new">${rp.at ? (news.length ? news.map((e) => `<div class="lg ${e.k}">${esc(e.text)}</div>`).join("") : '<span class="muted">Answers locked in (hidden until everyone has answered).</span>') : '<span class="muted">Start of the game. Step forward with ▶ or the arrow keys.</span>'}</div>
  </div>`;
}

export function replayHands(app, v) {
  return `<div class="rhands"><h3>Hands</h3>${v.players.map((p) => `<div class="rhand"><span class="chip" style="--c:${p.color}">${esc(p.name)}</span>
    <span class="mini">${(p.hand || []).map((id) => card(app.data.cardMap[id], { cls: "mini", tag: "span" })).join("")}</span></div>`).join("")}</div>`;
}

export function logHtml(v) {
  let r = -1;
  return v.log.map((e) => {
    const h = e.r !== r ? `<h4>${e.r ? "Round " + e.r : "Setup"}</h4>` : "";
    r = e.r;
    return `${h}<div class="lg ${e.k}">${esc(e.text)}</div>`;
  }).join("");
}

export function rulesModal(app, html) {
  return `<div class="modal" data-act="closeModal"><div class="modal-box" data-stop>
    <button class="close" data-act="closeModal">×</button>${html}</div></div>`;
}
