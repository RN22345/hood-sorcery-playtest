// Game feel: a persistent effects layer above the screens (banners, the Wheel reel, floating numbers, dice,
// claim flashes), sound effects (CC0 samples, see assets/audio/CREDITS.md) and music. It lives outside #app,
// so re-rendering a screen never restarts an animation. No rules here.
const layer = document.createElement("div");
layer.className = "fx";
layer.innerHTML = '<div class="fx-stage"></div>';
document.body.appendChild(layer);
const stage = layer.firstChild;

// ---------------------------------------------------------------- settings (volumes)
const SKEY = "hsp:audio";
const audio = Object.assign({ music: 0.45, sfx: 0.8, muted: false }, JSON.parse(localStorage.getItem(SKEY) || "{}"));
export const audioSettings = () => ({ ...audio });
export function setAudio(patch) {
  Object.assign(audio, patch);
  localStorage.setItem(SKEY, JSON.stringify(audio));
  if (sfxGain) sfxGain.gain.value = audio.muted ? 0 : audio.sfx;
  applyMusicVolume();
}
export const isMuted = () => audio.muted;
export function toggleMute() { setAudio({ muted: !audio.muted }); return audio.muted; }

// ---------------------------------------------------------------- positions in stage pixels
/** The rectangle of a DOM element in 1920×1080 stage coordinates (works in both layouts). */
export function stageRect(el) {
  const fr = stage.getBoundingClientRect(), r = el.getBoundingClientRect(), s = fr.width / 1920;
  return { x: (r.left - fr.left) / s, y: (r.top - fr.top) / s, w: r.width / s, h: r.height / s };
}
function put(el, cls, html, rect, ms) {
  const d = document.createElement("div");
  d.className = cls;
  d.innerHTML = html;
  if (rect) Object.assign(d.style, { left: rect.x + "px", top: rect.y + "px", width: rect.w + "px", height: rect.h + "px" });
  if (ms) d.style.setProperty("--ms", ms + "ms");
  stage.appendChild(d);
  if (ms) setTimeout(() => d.remove(), ms + 120);
  return d;
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Remove every running effect (on screen changes). */
export function clearFx() { stage.replaceChildren(); }

/** A big title across the table for a moment. */
export function banner(title, sub = "", { color = "", ms = 1500, cls = "" } = {}) {
  const d = put(null, `banner ${cls}`, `<b>${esc(title)}</b><span>${esc(sub)}</span>`, null, ms);
  d.style.setProperty("--c", color || "var(--gold)");
}

/** A number or word that pops out of an element and floats up ("+2", "+1 Rep", "−1"). */
export function floatText(el, text, cls = "", ms = 1400) {
  if (!el) return;
  const r = stageRect(el);
  put(null, `floater ${cls}`, esc(text), { x: r.x, y: r.y + r.h * 0.3, w: r.w, h: 0 }, ms);
}

/** A glow ring over an element (a corner changing hands, a crew in focus). */
export function flash(el, color = "var(--gold)", ms = 1100) {
  if (!el) return;
  put(null, "flash", "", stageRect(el), ms).style.setProperty("--c", color);
}

/** Dice tumble over an element and land on the rolled faces. */
export function dice(el, faces, ms = 1100) {
  if (!el || !faces.length) return;
  const r = stageRect(el);
  const d = put(null, "dice", faces.map(() => `<i class="die"></i>`).join(""), { x: r.x, y: r.y, w: r.w, h: r.h }, ms + 900);
  const dies = [...d.children];
  let t = 0;
  const roll = () => {
    dies.forEach((x) => (x.dataset.f = 1 + Math.floor(Math.random() * 6))); // cosmetic tumble; the result is decided
    t += 70;
    if (t < ms * 0.6) setTimeout(roll, 70);
    else { dies.forEach((x, i) => { x.dataset.f = faces[i]; x.classList.add("landed"); }); }
  };
  sound("dice");
  roll();
}

/** The Wheel: sector images flick past, slow down and land on the result. */
export function wheelReel(sectors, landed, ms = 1500) {
  const el = put(null, "reel", `<div class="reel-box"><img alt=""><b></b><span></span></div>`);
  const img = el.querySelector("img"), name = el.querySelector("b"), text = el.querySelector("span");
  let t = 0, k = Math.floor(Math.random() * sectors.length); // cosmetic only: the result is already decided
  sound("spin");
  const tick = () => {
    const s = sectors[k++ % sectors.length];
    img.src = s.img; name.textContent = s.name; text.textContent = "";
    sound("tick", { vol: 0.35 });
    t += 40 + t * 0.18;
    if (t < ms * 0.55) setTimeout(tick, 40 + t * 0.18);
    else setTimeout(() => {
      img.src = landed.img; name.textContent = landed.name; text.textContent = landed.text;
      el.classList.add("landed", landed.type);
      sound(landed.type === "curse" ? "curse" : "bless");
      setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, 900);
    }, 140);
  };
  tick();
}

// ---------------------------------------------------------------- sound effects (Web Audio + CC0 samples)
const SFX = {
  pick: ["card_pick1", "card_pick2"], place: ["card_place1", "card_place2"], card: ["card_place1", "card_place2"],
  flip: ["card_flip"], fan: ["card_fan"], shuffle: ["shuffle"], chips: ["chips"], chip: ["chip"],
  dice: ["dice1", "dice2"], hit: ["hit1", "hit2"], lock: ["lock"], whoosh: ["whoosh", "whoosh2"], spin: ["spin"],
  tick: ["tick"], click: ["click"], select: ["select"], confirm: ["confirm"], error: ["error"], back: ["back"], toggle: ["toggle"],
  bless: ["bless"], curse: ["curse"], heal: ["heal"], turn: ["turn"], win: ["win"], bell: ["bell"],
};
const VOL = { tick: 0.4, select: 0.5, whoosh: 0.6, chips: 0.8, hit: 0.9, win: 0.9, turn: 0.6, flip: 0.8 };
let ac = null, sfxGain = null;
const buffers = {};
function ctx() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    sfxGain = ac.createGain();
    sfxGain.gain.value = audio.muted ? 0 : audio.sfx;
    sfxGain.connect(ac.destination);
    for (const f of new Set(Object.values(SFX).flat())) {
      fetch(`assets/audio/${f}.mp3`).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((buf) => (buffers[f] = buf)).catch(() => {});
    }
  }
  if (ac.state === "suspended") ac.resume();
  return ac;
}
export function sound(name, { vol = 1, rate = 1 } = {}) {
  if (audio.muted) return;
  const a = ctx();
  const list = SFX[name];
  if (!a || !list) return;
  const buf = buffers[list[Math.floor(Math.random() * list.length)]];
  if (!buf) return;
  const src = a.createBufferSource(), g = a.createGain();
  src.buffer = buf;
  src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
  g.gain.value = vol * (VOL[name] ?? 1);
  src.connect(g).connect(sfxGain);
  src.start();
}

// ---------------------------------------------------------------- music (looping lo-fi, crossfaded)
const MUSIC = { menu: ["music_menu"], game: ["music_game1", "music_game2"] };
let want = null, cur = null, unlocked = false;
const players = {};
function applyMusicVolume() { if (cur && !cur.fading) cur.el.volume = audio.muted ? 0 : audio.music; }
function fade(el, to, ms, done) {
  const from = el.volume, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step); else done?.();
  };
  step();
}
/** Play the menu or game music ("menu" | "game" | null), crossfading. Starts after the first click (autoplay rules). */
export function music(kind) {
  want = kind;
  if (!unlocked) return;
  if (cur?.kind === kind) return;
  const old = cur;
  if (old) { old.fading = true; fade(old.el, 0, 900, () => old.el.pause()); }
  cur = null;
  if (!kind) return;
  const list = MUSIC[kind];
  const file = list[Math.floor(Math.random() * list.length)];
  const el = players[file] ||= Object.assign(new Audio(`assets/audio/${file}.mp3`), { loop: true, preload: "none" });
  el.volume = 0;
  el.currentTime = 0;
  el.play().catch(() => {});
  cur = { kind, el };
  fade(el, audio.muted ? 0 : audio.music, 1500);
}
addEventListener("pointerdown", () => {
  if (unlocked) return;
  unlocked = true;
  ctx();
  if (want) music(want);
}, { capture: true });
