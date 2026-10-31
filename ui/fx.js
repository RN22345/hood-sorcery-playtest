// Game feel: a persistent effects layer above the screens (banners, the Wheel reel) and tiny synthesized
// sounds. It lives outside #app, so re-rendering the screen never restarts an animation. No assets, no rules.
const layer = document.createElement("div");
layer.className = "fx";
layer.innerHTML = '<div class="fx-stage"></div>';
document.body.appendChild(layer);
const stage = layer.firstChild;

let muted = localStorage.getItem("hsp:muted") === "1";
export const isMuted = () => muted;
export function toggleMute() { muted = !muted; localStorage.setItem("hsp:muted", muted ? "1" : "0"); return muted; }

/** Remove every running effect (on screen changes). */
export function clearFx() { stage.replaceChildren(); }

/** A big title across the table for a moment. */
export function banner(title, sub = "", { color = "", ms = 1500, cls = "" } = {}) {
  const el = document.createElement("div");
  el.className = `banner ${cls}`;
  el.style.setProperty("--c", color || "var(--gold)");
  el.style.setProperty("--ms", ms + "ms");
  el.innerHTML = `<b></b><span></span>`;
  el.firstChild.textContent = title;
  el.lastChild.textContent = sub;
  stage.appendChild(el);
  setTimeout(() => el.remove(), ms + 100);
}

/** The Wheel: sector images flick past, slow down and land on the result. */
export function wheelReel(sectors, landed, ms = 1500) {
  const el = document.createElement("div");
  el.className = "reel";
  el.innerHTML = `<div class="reel-box"><img alt=""><b></b><span></span></div>`;
  const img = el.querySelector("img"), name = el.querySelector("b"), text = el.querySelector("span");
  stage.appendChild(el);
  let t = 0, k = Math.floor(Math.random() * sectors.length); // cosmetic only: the result is already decided
  const tick = () => {
    const s = sectors[k++ % sectors.length];
    img.src = s.img; name.textContent = s.name; text.textContent = "";
    sound("tick");
    t += 40 + t * 0.18;
    if (t < ms * 0.55) setTimeout(tick, 40 + t * 0.18);
    else setTimeout(() => {
      img.src = landed.img; name.textContent = landed.name; text.textContent = landed.text;
      el.classList.add("landed", landed.type);
      sound(landed.type === "curse" ? "curse" : "bless");
      setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, 1000);
    }, 140);
  };
  tick();
}

// ---------------------------------------------------------------- sound (Web Audio, synthesized)
let ac = null;
function ctx() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ac.state === "suspended") ac.resume();
  return ac;
}
function tone(f, at, dur, { type = "sine", vol = 0.12, slide = 0 } = {}) {
  const a = ctx(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, a.currentTime + at);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), a.currentTime + at + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + at);
  g.gain.exponentialRampToValueAtTime(vol, a.currentTime + at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + at); o.stop(a.currentTime + at + dur + 0.02);
}
function noise(at, dur, vol = 0.08, hp = 1500) {
  const a = ctx(); if (!a) return;
  const b = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; f.type = "highpass"; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start(a.currentTime + at);
}
const SOUNDS = {
  tick: () => tone(1800, 0, 0.03, { type: "square", vol: 0.03 }),
  card: () => noise(0, 0.06, 0.06, 2500),
  lock: () => { tone(160, 0, 0.18, { type: "triangle", vol: 0.2, slide: -60 }); noise(0, 0.05, 0.05, 800); },
  flip: () => { for (let i = 0; i < 4; i++) noise(i * 0.07, 0.07, 0.07, 3000); },
  bless: () => { tone(523, 0, 0.18); tone(784, 0.1, 0.3); },
  curse: () => { tone(220, 0, 0.3, { type: "sawtooth", vol: 0.06, slide: -80 }); },
  coin: () => { tone(988, 0, 0.08, { type: "square", vol: 0.05 }); tone(1319, 0.07, 0.2, { type: "square", vol: 0.05 }); },
  hit: () => { tone(110, 0, 0.25, { type: "triangle", vol: 0.25, slide: -50 }); noise(0, 0.12, 0.08, 300); },
  turn: () => { tone(660, 0, 0.12, { vol: 0.08 }); tone(880, 0.12, 0.16, { vol: 0.08 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.35, { type: "triangle", vol: 0.12 })),
};
export function sound(name) { if (!muted) try { SOUNDS[name]?.(); } catch {} }
