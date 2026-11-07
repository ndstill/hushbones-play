// Hushbones sound engine (Web Audio). Built for iPhone first:
//  - AAC audio in .mp4 files (hardware-decoded on iOS; .mp4 rather than .m4a so the artifact host serves them), mono SFX, stereo ambience beds.
//  - Unlocks on the first touch (iOS won't start audio before a gesture).
//  - navigator.audioSession "ambient": respects the silent switch and mixes with the player's own music.
//  - Suspends when the page/app is hidden; resumes on return.
// Mix: every sound → sfx bus → (dry + stone-hall reverb send) → master → compressor → out. Ambience has its own bus.
// Sounds live in assets/sfx (cut by tools/build_sfx.py from the Sonniss GDC 2026 bundles).

const VAR = { // name → variation count (files are name.mp4, or name_1..n.mp4)
  tick: 2, tickfast: 2, shake: 2, clatter: 2, select: 4, clack: 4, thud: 2, hit: 2, hurt: 6, heavyhurt: 4, coin: 2, page: 3, reveal: 2,
};
const NAMES = ["clack", "thud", "tick", "tickfast", "quadrant", "shake", "clatter", "select", "deselect", "word_attack", "word_defense",
  "shield_glass", "wrong", "zap", "push", "allspeak", "awe", "cast", "hit", "bighit", "hurt", "heavyhurt", "swing", "block",
  "thorns", "leech", "enrage", "curse", "fizzle", "timeout", "foe", "boss", "act", "victory", "defeat", "box", "rustle",
  "reveal", "legend", "pluck", "coin", "page", "flick", "bag", "click"];
// Per-sound defaults: vol (0..1), jitter (± pitch ratio), send (reverb amount).
const DEF = {
  tick: { vol: .4, jitter: .01, send: .25 }, tickfast: { vol: .5, jitter: .01, send: .2 }, quadrant: { vol: .6, send: .4 },
  clack: { vol: .7, jitter: .04, send: .12 }, thud: { vol: .6, jitter: .05, send: .2 },
  shake: { vol: .5, jitter: .06, send: .15 }, clatter: { vol: .55, jitter: .08, send: .2 }, select: { vol: .45, jitter: .05, send: .12 },
  deselect: { vol: .35, jitter: .05, send: .08 }, word_attack: { vol: .55, jitter: .03, send: .45 }, word_defense: { vol: .6, jitter: .03, send: .35 },
  shield_glass: { vol: .45, jitter: .04, send: .4 }, wrong: { vol: .55, send: .2 }, zap: { vol: .45, jitter: .04, send: .3 },
  push: { vol: .45, jitter: .05, send: .2 }, allspeak: { vol: .75, send: .45 }, awe: { vol: .55, send: .7 },
  cast: { vol: .6, jitter: .04, send: .45 }, hit: { vol: .6, jitter: .06, send: .35 }, bighit: { vol: .75, send: .6 },
  hurt: { vol: .6, jitter: .06, send: .3 }, heavyhurt: { vol: .7, jitter: .05, send: .45 }, swing: { vol: .4, jitter: .07, send: .3 },
  block: { vol: .5, jitter: .08, send: .35 }, thorns: { vol: .45, jitter: .05, send: .3 }, leech: { vol: .45, jitter: .05, send: .35 },
  enrage: { vol: .5, send: .5 }, curse: { vol: .3, send: .6 }, fizzle: { vol: .6, send: .5 }, timeout: { vol: .65, send: .4 },
  foe: { vol: .55, send: .4 }, boss: { vol: .7, send: .5 }, act: { vol: .7, send: .5 }, victory: { vol: .6, send: .6 },
  defeat: { vol: .65, send: .6 }, box: { vol: .5, send: .25 }, rustle: { vol: .35, send: .2 }, reveal: { vol: .6, send: .35 },
  legend: { vol: .7, send: .5 }, pluck: { vol: .55, send: .3 }, coin: { vol: .45, jitter: .06, send: .3 },
  page: { vol: .35, jitter: .06, send: .2 }, flick: { vol: .45, send: .25 }, bag: { vol: .45, jitter: .05, send: .15 }, click: { vol: .45, jitter: .05, send: .1 },
};
// Ambience scenes: bed name → level. The tension drone is driven separately by setTension().
const SCENES = {
  title: { amb_mystic: .55, amb_deep: .35 },
  story: { amb_fire: .45, amb_deep: .3 },
  map:   { amb_fire: .5, amb_mystic: .3 },
  duel:  { amb_hall: .55, amb_mystic: .3, amb_deep: .3 },
  boss:  { amb_hall: .8, amb_deep: .5 },
  shop:  { amb_fire: .55, amb_deep: .3 },
  quiet: {},
};
// d (2026-11-05): "the ambient sound should go away". Beds stay in the code and assets/sfx, but nothing loads or plays
// while this is false: no scene loops, no push-clock drone. Flip to true to bring them back.
const AMBIENCE = false;
const BEDS = AMBIENCE ? ["amb_hall", "amb_fire", "amb_mystic", "amb_deep", "amb_tension"] : [];
const XFADE = 3; // seconds; each bed file has 3 s fades baked in at both ends

let ctx = null, master, sfxBus, ambBus, reverb, buffers = {}, loading = null, lastVar = {}, beds = {}, scene = null, tension = 0;
let settings = (() => { try { return JSON.parse(localStorage.getItem("hb_sound") || "{}"); } catch (e) { return {}; } })();
settings = { sfx: settings.sfx ?? 0.9, amb: settings.amb ?? 0.7, muted: !!settings.muted };
const save = () => { try { localStorage.setItem("hb_sound", JSON.stringify(settings)); } catch (e) {} };

function hallImpulse(c, seconds = 2.4) { // synthetic stone-hall IR: decaying stereo noise with early reflections
  const n = Math.floor(c.sampleRate * seconds), ir = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < n; i++) { const t = i / c.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (t < .08 ? .5 + 3 * t : 1); }
    [0.011, 0.023, 0.037, 0.051].forEach((t, k) => { const j = Math.floor(t * c.sampleRate) + ch * 17; if (j < n) d[j] += (k % 2 ? -.6 : .7); });
  }
  return ir;
}

function init() {
  if (ctx) return;
  try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) {}
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC({ latencyHint: "interactive" });
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = .004; comp.release.value = .2;
  // Warm master EQ (d: "avoid high register tinny sounds, this should feel solid"): body up, air down.
  // d: "sounds should all be low and bass-y": strong low shelf, early high cut, low-pass at 5.5 kHz.
  const low = ctx.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 180; low.gain.value = 6;
  const high = ctx.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 2500; high.gain.value = -7;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5500; lp.Q.value = .5;
  master = ctx.createGain(); master.connect(low); low.connect(high); high.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); ambBus = ctx.createGain(); sfxBus.connect(master); ambBus.connect(master);
  reverb = ctx.createConvolver(); reverb.buffer = hallImpulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = .55; const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 180;
  const wetLp = ctx.createBiquadFilter(); wetLp.type = "lowpass"; wetLp.frequency.value = 4500;
  reverb.connect(hp); hp.connect(wetLp); wetLp.connect(wet); wet.connect(master);
  applyLevels();
  document.addEventListener("visibilitychange", () => { if (!ctx) return; document.hidden ? ctx.suspend() : ctx.resume(); });
  load();
}

function applyLevels() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, .05);
  sfxBus.gain.setTargetAtTime(settings.sfx, t, .05);
  ambBus.gain.setTargetAtTime(settings.amb, t, .05);
}

async function fetchBuf(file) {
  const r = await fetch("assets/sfx/" + file + ".mp4"); const ab = await r.arrayBuffer();
  return await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
}
function load() {
  if (loading) return loading;
  const files = [];
  NAMES.forEach(n => { const v = VAR[n] || 1; for (let i = 1; i <= v; i++) files.push([n, v > 1 ? n + "_" + i : n]); });
  BEDS.forEach(b => files.push([b, b]));
  // SFX first (small), beds after, so the first taps already have sound.
  loading = (async () => {
    await Promise.all(files.filter(f => !f[0].startsWith("amb_")).map(async ([n, f]) => { try { (buffers[n] = buffers[n] || []).push(await fetchBuf(f)); } catch (e) {} }));
    await Promise.all(files.filter(f => f[0].startsWith("amb_")).map(async ([n, f]) => { try { buffers[n] = [await fetchBuf(f)]; } catch (e) {} }));
    if (scene) { const s = scene; scene = null; setScene(s); }
    setTension(tension);
  })();
  return loading;
}

// Call from the first touch/click handler. Safe to call repeatedly.
export function unlock() {
  init(); if (!ctx) return;
  if (ctx.state !== "running") ctx.resume();
  // iOS: play one silent frame inside the gesture to fully open the output.
  const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
}

// Haptic that goes with each sound on iPhone (native.js provides HB_HAPTIC; plays even when sound is off).
const HAPTIC = { select: "light", deselect: "light", click: "light", quadrant: "light", word_attack: "medium", word_defense: "medium",
  wrong: "error", push: "light", allspeak: "success", cast: "medium", hit: "medium", bighit: "heavy", hurt: "heavy", heavyhurt: "heavy",
  block: "light", fizzle: "warning", timeout: "warning", foe: "medium", boss: "heavy", victory: "success", defeat: "error", reveal: "medium", legend: "heavy", coin: "light" };
// play("hit", { vol, rate, delay, send, pan })
export function play(name, o = {}) {
  if (HAPTIC[name] && window.HB_HAPTIC && window.HB_HAPTICS_ON !== false) {
    if (o.delay) setTimeout(() => window.HB_HAPTIC(HAPTIC[name]), o.delay * 1000); else window.HB_HAPTIC(HAPTIC[name]);
  }
  if (!ctx || settings.muted) return;
  const list = buffers[name]; if (!list || !list.length) return;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastVar[name]) i = (i + 1) % list.length; lastVar[name] = i;
  const d = DEF[name] || {}, src = ctx.createBufferSource(); src.buffer = list[i];
  const j = o.jitter ?? d.jitter ?? .02; src.playbackRate.value = (o.rate || 1) * 0.88 * (1 + (Math.random() * 2 - 1) * j);   // everything a touch lower (d)
  const g = ctx.createGain(); g.gain.value = (o.vol ?? 1) * (d.vol ?? .5) * (0.92 + Math.random() * .16);
  let node = g;
  if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); node = p; }
  src.connect(g); node.connect(sfxBus);
  const send = o.send ?? d.send ?? .2; if (send > 0) { const sg = ctx.createGain(); sg.gain.value = send; node.connect(sg); sg.connect(reverb); }
  src.start(ctx.currentTime + (o.delay || 0));
  return src;
}

// ---- ambience: crossfaded loops ----
function startBed(name) {
  const buf = buffers[name] && buffers[name][0]; if (!buf || beds[name]) return;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus);
  const send = ctx.createGain(); send.gain.value = name === "amb_tension" ? .3 : .12; g.connect(send); send.connect(reverb);
  const bed = { g, timer: null, srcs: [] };
  const step = Math.max(4, buf.duration - XFADE);
  const queue = (when) => {
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(g); s.start(when); bed.srcs.push(s);
    s.onended = () => { bed.srcs = bed.srcs.filter(x => x !== s); };
    const next = when + step;
    bed.timer = setTimeout(() => queue(next), Math.max(0, (next - ctx.currentTime - 1.5) * 1000));
  };
  queue(ctx.currentTime + .05);
  beds[name] = bed;
}
function bedLevel(name, level, secs = 2) {
  if (!ctx) return;
  if (level > 0) startBed(name);
  const b = beds[name]; if (!b) return;
  b.g.gain.cancelScheduledValues(ctx.currentTime);
  b.g.gain.setTargetAtTime(level, ctx.currentTime, secs / 3);
}
export function setScene(name) {
  if (!AMBIENCE) return;
  if (name === scene) return; scene = name;
  if (!ctx) return;
  const lv = SCENES[name] || {};
  BEDS.filter(b => b !== "amb_tension").forEach(b => bedLevel(b, lv[b] || 0, 2.5));
}
// 0..1: the push-clock drone. 0 = off.
export function setTension(v) {
  if (!AMBIENCE) return;
  tension = v; if (!ctx) return;
  bedLevel("amb_tension", v > 0 ? .25 + .55 * v : 0, v > 0 ? 1 : 2);
}

// ---- the clock: one tick per whole second; faster, harder ticks in the last 5 s ----
let lastTickSec = null;
export function clockTick(secsLeft) {
  const s = Math.ceil(secsLeft);
  if (s === lastTickSec || s <= 0) return; lastTickSec = s;
  if (s <= 5) { play("tickfast", { vol: 1.1 - s * .08 }); play("tickfast", { vol: .6, delay: .5 }); }
  else play("tick");
}
export function clockReset() { lastTickSec = null; }

// ---- bonus payouts: slot-machine style (d: "the slot machine refers to bonus stuff") ----
// Warm mallet/bell voice (sine + soft overtones, low-passed) on a major pentatonic ladder, kept mid-register so it
// stays solid rather than tinny. Coins are the coin samples fired in a quick cascade.
const LADDER = [98, 110, 131, 147, 165, 196, 220, 262, 294, 330, 392, 440];   // an octave lower: low and bassy (d)
function mallet(freq, when, vol = .22, dur = .7) {
  if (!ctx || settings.muted) return;
  const t = ctx.currentTime + when, out = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 1800; out.connect(lp); lp.connect(sfxBus);
  const send = ctx.createGain(); send.gain.value = .35; lp.connect(send); send.connect(reverb);
  [[1, 1], [2, .16], [3.01, .04], [.5, .35]].forEach(([m, g]) => {
    const o = ctx.createOscillator(), e = ctx.createGain();
    o.type = m === 2 ? "triangle" : "sine"; o.frequency.value = freq * m;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(vol * g, t + .006); e.gain.exponentialRampToValueAtTime(.0001, t + dur * (m > 1 ? .5 : 1));
    o.connect(e); e.connect(out); o.start(t); o.stop(t + dur + .05);
  });
}
// n coins tumbling out, quick and slightly random.
export function payout(n = 4, delay = 0) {
  n = Math.max(1, Math.min(14, Math.round(n)));
  for (let i = 0; i < n; i++) play("coin", { delay: delay + i * (.055 + Math.random() * .03), vol: .55 + Math.random() * .3, rate: .62 + Math.random() * .16 });
}
// Ascending run; level 0..1 sets how far up the ladder it climbs.
export function bonus(level = .5, delay = 0) {
  const n = 3 + Math.round(Math.max(0, Math.min(1, level)) * 5);
  for (let i = 0; i < n; i++) mallet(LADDER[2 + i], delay + i * .07, .18 + i * .01);
  payout(1 + Math.round(level * 4), delay + n * .07);
}
// A chord landing (the "win" line).
function chord(root, delay) { [0, 2, 4].forEach((k, j) => mallet(LADDER[root + k], delay + j * .012, .16, 1.2)); }
// Jackpot: long run up, chord, coins pouring, the heavy bass drop underneath.
export function jackpot(delay = 0) {
  for (let i = 0; i < 10; i++) mallet(LADDER[i], delay + i * .06, .17 + i * .008);
  chord(5, delay + .66); chord(7, delay + .9);
  payout(12, delay + .7);
  play("allspeak", { delay, vol: .8 });
}
// Reward reveal by best rarity on offer.
export function reveal(rarity = "common", delay = 0) {
  if (rarity === "legendary") return jackpot(delay);
  const n = { common: 3, uncommon: 4, rare: 6 }[rarity] || 3;
  for (let i = 0; i < n; i++) mallet(LADDER[3 + i], delay + i * .08, .19);
  if (rarity !== "common") chord(rarity === "rare" ? 6 : 4, delay + n * .08);
  if (rarity === "rare") payout(5, delay + n * .08);
}
// Victory fanfare: a short up-and-land figure.
export function fanfare(delay = 0) {
  [4, 6, 7].forEach((k, i) => mallet(LADDER[k], delay + i * .12, .2, .9)); chord(7, delay + .38);
}
// Soft "nope": two low falling notes (no harsh buzzers).
export function nope(delay = 0) { mallet(LADDER[3], delay, .2, .5); mallet(LADDER[1], delay + .11, .2, .7); }

// ---- settings ----
export function getSettings() { return { ...settings, ambience: AMBIENCE }; }
export function setSetting(k, v) { settings[k] = v; save(); applyLevels(); if (k === "muted" && !v) unlock(); }
