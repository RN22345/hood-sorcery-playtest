// Fit-to-screen: the UI is laid out on a 1920×1080 stage (the same reference resolution a Unity Canvas
// Scaler would use) and scaled to fit the window, letterboxed, so everything is visible without
// scrolling from 480p to 4K. Narrow or portrait windows (phones) fall back to a scrolling flow layout.
export const STAGE_W = 1920, STAGE_H = 1080;

export function fitStage() {
  const w = innerWidth, h = innerHeight;
  const fit = w >= 640 && w / h >= 1.15;
  document.body.classList.toggle("fit", fit);
  document.body.classList.toggle("flow", !fit);
  const s = fit ? Math.min(w / STAGE_W, h / STAGE_H) : Math.min(1, w / 1000);
  document.documentElement.style.setProperty("--s", String(s));
}

addEventListener("resize", fitStage);
fitStage();
