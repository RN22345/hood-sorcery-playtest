// Tiny DOM diff: update `target`'s children in place so they match `html`, instead of replacing them with
// innerHTML. Elements that stay keep their identity, so running CSS animations (music-bar pulses, breathing
// standees, the Wheel, hover transitions, scroll positions, focus) are NOT restarted by a re-render.
//
// Matching: a child with data-k (or data-card / data-pid / data-zone / id) is matched by that key and tag;
// other children are matched by position and tag. A changed data-k means "this is a new thing": the old
// element is replaced, so its entry animation plays again. No dependencies, no rules.
const keyOf = (n) => {
  if (n.nodeType !== 1) return null;
  const d = n.dataset || {};
  const k = n.getAttribute("data-k") ?? d.card ?? d.pid ?? d.zone ?? (n.id || null);
  return k == null ? null : n.nodeName + ":" + k;
};

function syncAttrs(from, to) {
  for (const a of [...from.attributes]) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
  for (const a of to.attributes) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
}

function syncForm(from, to) {
  const tag = from.nodeName;
  if (tag === "INPUT") {
    if (from.type === "checkbox" || from.type === "radio") { if (from.checked !== to.checked) from.checked = to.checked; }
    else if (from.type !== "file" && document.activeElement !== from && from.value !== to.value) from.value = to.value;
  } else if (tag === "TEXTAREA") {
    if (document.activeElement !== from && from.value !== to.value) from.value = to.value;
  }
}

function morphNode(from, to) {
  if (from.nodeType === 3 || from.nodeType === 8) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; return; }
  syncAttrs(from, to);
  if (from.nodeName === "TEXTAREA") { syncForm(from, to); return; }
  morphChildren(from, to);
  syncForm(from, to);
}

function morphChildren(from, to) {
  const olds = [...from.childNodes];
  const byKey = new Map();
  for (const o of olds) { const k = keyOf(o); if (k && !byKey.has(k)) byKey.set(k, o); }
  const used = new Set();
  let pos = 0; // next unkeyed old node to consider
  let cursor = from.firstChild;
  for (const n of [...to.childNodes]) {
    const k = keyOf(n);
    let match = null;
    if (k) { match = byKey.get(k); if (match && used.has(match)) match = null; }
    else {
      while (pos < olds.length && (used.has(olds[pos]) || keyOf(olds[pos]))) pos++;
      const o = olds[pos];
      if (o && o.nodeType === n.nodeType && o.nodeName === n.nodeName) { match = o; pos++; }
    }
    if (match) {
      used.add(match);
      if (match !== cursor) from.insertBefore(match, cursor);
      else cursor = cursor.nextSibling;
      morphNode(match, n);
    } else {
      from.insertBefore(n, cursor); // new node: take it from the template
    }
  }
  for (const o of olds) if (!used.has(o) && o.parentNode === from) from.removeChild(o);
}

/** Make `target`'s children match `html`. */
export function morph(target, html) {
  const tpl = document.createElement(target.nodeName === "svg" ? "div" : target.nodeName);
  tpl.innerHTML = html;
  morphChildren(target, tpl);
}
