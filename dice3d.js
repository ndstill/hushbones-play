// 3D letter dice on the felt, skinned with Diced's bone-die texture (a clean face from its colour map).
// Diced's bone-die mesh has the pips modelled as dents, so a rounded cube stands in for it; each face gets a letter. A throw tumbles each die to land with the rolled face up,
// letter upright toward the player. No physics engine: throws are authored tweens, which keeps results exact.
import * as THREE from "three";
import { RoundedBoxGeometry } from "./vendor/three/addons/geometries/RoundedBoxGeometry.js";
import * as CANNON from "./vendor/cannon-es.js";

const LETTER_VALUE = { a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10 };
const TEX = 256;
const MAT_ORDER = ["+x", "-x", "+y", "-y", "+z", "-z"]; // BoxGeometry material groups
const FACE_KEYS = ["+y", "-y", "+x", "-x", "+z", "-z"]; // die face index -> model axis
const AXES = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };

let renderer, scene, camera, raycaster, baseGeo, blankImg, faceInfo = {};
let dice = [];           // {mesh, mat, canvas, ctx, tex, faces, state, anim, slot}
let tapCb = null, container;
let markIds = [], markGroup = null, markAnim = null; // the enemy's claimed word, traced in red
const clock = new THREE.Clock();
const DIE = 1;           // die edge length in world units

export async function init(el, onTap) {
  container = el; tapCb = onTap;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  raycaster = new THREE.Raycaster();

  scene.add(new THREE.HemisphereLight(0xfff1dd, 0x3a1020, 1.1));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.2);
  key.position.set(-3, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb070ff, 0.5); rim.position.set(4, 3, -6); scene.add(rim);

  // felt: shadow catcher + the dice ring decal
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.38 }));
  shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.receiveShadow = true; scene.add(shadowPlane);
  const ringTex = await new THREE.TextureLoader().loadAsync("assets/ui/felt_ring.png");
  ringTex.colorSpace = THREE.SRGBColorSpace;
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 7.2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0.45, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.002, 0.1); scene.add(ring);

  const [blank] = await Promise.all([
    loadImg("assets/die_face.png"),
    document.fonts.load("900 100px Merriweather").catch(() => {}),
  ]);
  blankImg = blank;
  baseGeo = new RoundedBoxGeometry(DIE, DIE, DIE, 4, 0.13);
  analyseFaces(baseGeo);

  window.addEventListener("resize", resize);
  resize();
  el.addEventListener("pointerdown", onPointer);
  renderer.setAnimationLoop(tick);
}

function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

// For each of the 6 model axes find the flat face's UV rectangle and which 3D direction is "up" on the texture.
function analyseFaces(geo) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const get = i => (idx ? idx.getX(i) : i);
  const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], U = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  for (const k of FACE_KEYS) faceInfo[k] = { u0: 1, u1: 0, v0: 1, v1: 0, T: new THREE.Vector3(), B: new THREE.Vector3(), area: 0 };
  for (let t = 0; t < triCount; t++) {
    for (let j = 0; j < 3; j++) { const vi = get(t * 3 + j); P[j].fromBufferAttribute(pos, vi); U[j].fromBufferAttribute(uv, vi); }
    e1.subVectors(P[1], P[0]); e2.subVectors(P[2], P[0]); n.crossVectors(e1, e2);
    const area = n.length(); if (area < 1e-9) continue; n.divideScalar(area);
    let key = null;
    for (const k of FACE_KEYS) { const a = AXES[k]; if (n.x * a[0] + n.y * a[1] + n.z * a[2] > 0.97) key = k; }
    if (!key) continue;
    const f = faceInfo[key];
    (f.tris = f.tris || []).push({ cu: (U[0].x + U[1].x + U[2].x) / 3, cv: (U[0].y + U[1].y + U[2].y) / 3, uvs: U.map(u => u.clone()) });
    // tangent (+u) and bitangent (+v) in model space
    const du1 = U[1].x - U[0].x, dv1 = U[1].y - U[0].y, du2 = U[2].x - U[0].x, dv2 = U[2].y - U[0].y;
    const r = du1 * dv2 - du2 * dv1; if (Math.abs(r) < 1e-12) continue;
    const T = e1.clone().multiplyScalar(dv2).sub(e2.clone().multiplyScalar(dv1)).divideScalar(r);
    const B = e2.clone().multiplyScalar(du1).sub(e1.clone().multiplyScalar(du2)).divideScalar(r);
    f.T.addScaledVector(T.normalize(), area); f.B.addScaledVector(B.normalize(), area); f.area += area;
  }
  for (const k of FACE_KEYS) {
    const f = faceInfo[k], N = new THREE.Vector3(...AXES[k]);
    // robust UV rectangle: keep triangles near the median centroid (seam triangles carry stray UVs)
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const mu = med(f.tris.map(t => t.cu)), mv = med(f.tris.map(t => t.cv));
    f.tris.filter(t => Math.abs(t.cu - mu) < 0.16 && Math.abs(t.cv - mv) < 0.16).forEach(t => t.uvs.forEach(u => {
      f.u0 = Math.min(f.u0, u.x); f.u1 = Math.max(f.u1, u.x); f.v0 = Math.min(f.v0, u.y); f.v1 = Math.max(f.v1, u.y);
    }));
    delete f.tris;
    f.T.normalize(); f.B.normalize();
    f.mirror = new THREE.Vector3().crossVectors(f.T, f.B).dot(N) < 0;
    // rotation that puts this face up (+Y) with the texture's up pointing away from the camera (-Z)
    const y = N.clone(), z = f.B.clone().negate();
    z.addScaledVector(y, -z.dot(y)).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    const m = new THREE.Matrix4().makeBasis(x, y, z).transpose(); // inverse of basis = rotation model->world
    f.q = new THREE.Quaternion().setFromRotationMatrix(m);
  }
}

// ---------- textures ----------
// One canvas per face. Canvas "up" is texture +v, which analyseFaces relates to a 3D direction.
// Age: the Eighth's nine dice are centuries old (d: "about 10% pockmarked like they are older"; added dice stay clean).
// Seeded per die and face so the pits never move. Pits cover ~10% of the face: dark hollows with a lit lower rim, plus a little grime.
function ageFace(ctx, w, h, seed) {
  let a = seed >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.75);
  g.addColorStop(0, "rgba(90,60,30,0)"); g.addColorStop(1, "rgba(90,60,30,.22)"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  let covered = 0;
  while (covered < 0.10 * w * h) {
    const r = w * (0.02 + rnd() * 0.035), x = w * (0.08 + rnd() * 0.84), y = h * (0.08 + rnd() * 0.84), sq = 0.7 + rnd() * 0.5;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, sq);
    const p = ctx.createRadialGradient(-r * 0.15, -r * 0.2, 0, 0, 0, r);
    p.addColorStop(0, "rgba(96,66,40,.42)"); p.addColorStop(0.55, "rgba(120,86,54,.22)"); p.addColorStop(1, "rgba(120,86,54,0)");
    ctx.fillStyle = p; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,248,232,.28)"; ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();   // lit lower lip
    ctx.restore();
    covered += Math.PI * r * r * sq;
  }
}
// Dice finishes bought with Echoes: a tint over the bone, and pale letters on the dark one.
const FINISHES = { bone: null, ink: { tint: "#3a3440", mode: "multiply", letters: "#efe2c4" }, gilt: { tint: "#e8b84e", mode: "multiply" }, red: { tint: "#c47a68", mode: "multiply" } };
let finish = "bone";
export function setFinish(f) { finish = FINISHES[f] !== undefined ? f : "bone"; dice.forEach(d => paintDie(d)); }
const INLAY_INK = { red: { ink: "#c8101a", glow: "rgba(255,70,50,.9)" }, blue: { ink: "#1846c8", glow: "rgba(70,140,255,.8)" } };
// Omen marks (d): gilded = gold letter; coin = coin in the corner; mending = green cross; cursed = red skull; hollow = "½" in a red circle; leeching = blood drop.
function drawOmen(ctx, w, h, omen) {
  const x = w * 0.26, y = -h * 0.26, r = w * 0.16;
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = w * 0.02;
  if (omen === "coin") {
    const g = ctx.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r); g.addColorStop(0, "#fff1a8"); g.addColorStop(.6, "#e0b13a"); g.addColorStop(1, "#8a5d10");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#7a4f08"; ctx.lineWidth = w * 0.012; ctx.beginPath(); ctx.arc(x, y, r * .7, 0, Math.PI * 2); ctx.stroke();
  } else if (omen === "mending") {
    ctx.fillStyle = "#2f9a46"; const a = r * 0.36; ctx.fillRect(x - a, y - r, a * 2, r * 2); ctx.fillRect(x - r, y - a, r * 2, a * 2);
  } else if (omen === "cursed") {
    ctx.fillStyle = "#c01818"; ctx.font = `900 ${w * 0.36}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("\u2620", x, y + h * 0.015);
  } else if (omen === "hollow") {
    ctx.strokeStyle = "#c01818"; ctx.lineWidth = w * 0.02; ctx.fillStyle = "rgba(255,240,230,.85)"; ctx.beginPath(); ctx.arc(x, y, r * 1.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#c01818"; ctx.font = `900 ${w * 0.19}px Merriweather, Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("\u00BD", x, y + h * 0.01);
  } else if (omen === "leeching") {
    ctx.fillStyle = "#a3101a"; ctx.beginPath(); ctx.moveTo(x, y - r * 1.15);
    ctx.bezierCurveTo(x + r * 0.2, y - r * 0.5, x + r * 0.95, y + r * 0.05, x + r * 0.7, y + r * 0.55);
    ctx.arc(x, y + r * 0.45, r * 0.72, 0.15, Math.PI - 0.15);
    ctx.bezierCurveTo(x - r * 0.95, y + r * 0.05, x - r * 0.2, y - r * 0.5, x, y - r * 1.15); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(x - r * 0.28, y + r * 0.3, r * 0.15, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawFace(ctx, key, face, override, echo, ageSeed, material, omen) {
  const f = faceInfo[key], w = TEX, h = TEX, M = MATERIALS[material];
  const F = M ? { tint: M.tint, mode: "multiply", letters: M.letters } : FINISHES[finish];   // a metal die ignores the bone finish
  ctx.drawImage(blankImg, 0, 0, w, h);
  if (F) { ctx.save(); ctx.globalCompositeOperation = F.mode; ctx.fillStyle = F.tint; ctx.fillRect(0, 0, w, h); ctx.restore(); }
  if (material === "gold") {   // bright yellow catching the light along the edges (d)
    ctx.save(); ctx.globalCompositeOperation = "screen";
    const e = w * 0.16;
    [[0, 0, 0, e], [0, h, 0, h - e], [0, 0, e, 0], [w, 0, w - e, 0]].forEach(([x0, y0, x1, y1]) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, "rgba(255,240,140,.85)"); g.addColorStop(1, "rgba(255,240,140,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    const c = ctx.createRadialGradient(w * .3, h * .25, 0, w * .3, h * .25, w * .45); c.addColorStop(0, "rgba(255,250,200,.35)"); c.addColorStop(1, "rgba(255,250,200,0)");
    ctx.fillStyle = c; ctx.fillRect(0, 0, w, h); ctx.restore();
  }
  if (ageSeed) ageFace(ctx, w, h, ageSeed);
  const l = override || face.l;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  if (f.mirror) ctx.scale(-1, 1);
  // d: a gilded face is just a gold letter (the gold face looked like a selected die)
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (l === "*") {
    ctx.font = `900 ${w * 0.6}px Merriweather, Georgia, serif`;
    ctx.fillStyle = "#5b2a86"; ctx.fillText("\u2605", 0, h * 0.03);
  } else {
    const L = l.toUpperCase();
    ctx.font = `900 ${w * 0.56}px Merriweather, Georgia, serif`;
    ctx.fillStyle = "rgba(255,248,230,.6)"; ctx.fillText(L, w * 0.012, h * 0.045 + w * 0.014); // carved highlight
    const IN = omen === "gilded" || (face.gild && !face.inlay) ? { ink: "#d9a514", glow: "rgba(255,210,80,.95)" } : INLAY_INK[face.inlay];
    if (IN) { ctx.save(); ctx.shadowColor = IN.glow; ctx.shadowBlur = w * 0.06; ctx.fillStyle = IN.ink; ctx.fillText(L, 0, h * 0.045); ctx.restore(); }   // inlaid letter (d: red/blue inlays)
    else { ctx.fillStyle = (F && F.letters) || "#2b1a0e"; ctx.fillText(L, 0, h * 0.045); }
    ctx.font = `700 ${w * 0.15}px Merriweather, Georgia, serif`;
    ctx.fillStyle = F && F.letters ? "rgba(239,226,196,.7)" : "rgba(43,26,14,.72)"; ctx.fillText(String(LETTER_VALUE[l] || 0), w * 0.31, h * 0.32);
  }
  if (omen && omen !== "gilded") drawOmen(ctx, w, h, omen);
  if (echo) { // Echo die: a purple "2x" in the top-left corner
    ctx.font = `900 ${w * 0.15}px Merriweather, Georgia, serif`;
    ctx.fillStyle = "#6a2fb0"; ctx.fillText("2\u00D7", -w * 0.3, -h * 0.31);
  }
  ctx.restore();
}
function paintDie(d, overrideFace, overrideLetter) {
  d.faces.forEach((face, i) => {
    const key = FACE_KEYS[i], m = MAT_ORDER.indexOf(key);
    drawFace(d.ctxs[m], key, face, i === overrideFace ? overrideLetter : null, d.echo, d.aged ? (d.id + 1) * 7919 + i * 104729 : 0, d.material, d.omen);
    d.texs[m].needsUpdate = true;
  });
}

// ---------- dice set ----------
// faces: array (per die) of arrays of {l, gild}
// Die materials by reward tier (d: "if it says brass actually be brass"): tint, letters, and how the surface catches light.
const MATERIALS = {
  bone:    null,
  brass:   { tint: "#e6b964", letters: "#3a2408", metal: 0.3, rough: 0.38 },   // no env map, so keep metalness low or it renders black
  gold:    { tint: "#ffd970", letters: "#4a2c00", metal: 0.35, rough: 0.3 },
  crystal: { tint: "#a9d4e8", letters: "#1e3446", metal: 0.05, rough: 0.08, opacity: 0.9 },
};
export function setDice(diceFaces, echoFlags = [], agedFlags = [], fin, materials = []) {
  if (fin !== undefined) finish = FINISHES[fin] !== undefined ? fin : "bone";
  dice.forEach(d => { scene.remove(d.mesh); d.texs.forEach(t => t.dispose()); d.mats.forEach(m => m.dispose()); });
  dice = diceFaces.map((faces, id) => {
    const ctxs = [], texs = [], mats = [];
    for (let m = 0; m < 6; m++) {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = TEX;
      ctxs.push(canvas.getContext("2d"));
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; texs.push(tex);
      const M = MATERIALS[materials[id]];
      mats.push(new THREE.MeshStandardMaterial({ map: tex, roughness: M ? M.rough : 0.5, metalness: M ? M.metal : 0, emissive: 0x000000,
        transparent: !!(M && M.opacity), opacity: M && M.opacity ? M.opacity : 1 }));
    }
    const mesh = new THREE.Mesh(baseGeo, mats); mesh.castShadow = true; mesh.userData.id = id;
    const d = { id, echo: !!echoFlags[id], aged: !!agedFlags[id], material: MATERIALS[materials[id]] ? materials[id] : null, mesh, mats, ctxs, texs, mat: { emissive: { setHex: h => mats.forEach(m => m.emissive.setHex(h)) } }, faces: faces.map(f => ({ ...f })), state: "hidden", faceIdx: 0, anim: null,
      pos: new THREE.Vector3(0, -3, 6), quat: new THREE.Quaternion(), scale: 1, selected: false, yaw: 0 };
    paintDie(d);
    mesh.position.copy(d.pos); mesh.visible = false;
    scene.add(mesh);
    return d;
  });
  resize();
}

// ---------- layout ----------
function cols() { return dice.length > 12 ? 5 : dice.length > 9 ? 4 : 3; }
const GAP = 1.42;
function poolSlot(i, n) {
  const c = Math.min(cols(), n), row = Math.floor(i / cols()), inRow = Math.min(cols(), n - row * cols());
  const col = i % cols();
  const rows = Math.ceil(n / cols());
  return new THREE.Vector3((col - (inRow - 1) / 2) * GAP, DIE / 2, (row - (rows - 1) / 2) * GAP + 0.55);
}
function heldSlot(i, n) {
  const sp = Math.min(0.78, 6.4 / Math.max(n, 1));
  return new THREE.Vector3((i - (n - 1) / 2) * sp, DIE * 0.32, -2.55);
}

// ---------- animation ----------
const easeOut = t => 1 - Math.pow(1 - t, 3);
function animTo(d, { pos, quat, scale = 1, dur = 0.35, spin = null, arc = 0, delay = 0 }) {
  d.anim = { t: -delay, dur, p0: d.mesh.position.clone(), p1: pos.clone(), q0: d.mesh.quaternion.clone(), q1: quat.clone(),
    s0: d.mesh.scale.x, s1: scale, spin, arc };
}
function tick() {
  const dt = Math.min(clock.getDelta(), 0.25);   // real time even when frames are slow (a busy phone stretched 1s throws to 8-10s)
  tickMark(dt);
  for (const d of dice) {
    const a = d.anim; if (!a) continue;
    a.t += dt; if (a.t < 0) continue;
    if (a.frames) { // recorded physics throw
      const f = Math.min(a.frames.length - 1, Math.floor(a.t * 60));
      d.mesh.position.copy(a.frames[f].p); d.mesh.quaternion.copy(a.frames[f].q);
      if (f >= a.frames.length - 1) { d.anim = null; if (a.then) a.then(); }
      continue;
    }
    const t = Math.min(1, a.t / a.dur), e = easeOut(t);
    d.mesh.position.lerpVectors(a.p0, a.p1, e);
    if (a.arc) d.mesh.position.y += Math.abs(Math.sin(t * Math.PI * 2.2)) * a.arc * Math.pow(1 - t, 1.6);
    if (a.spin) {
      const left = a.spin.angle * Math.pow(1 - t, 2.2);
      const qs = new THREE.Quaternion().setFromAxisAngle(a.spin.axis, left);
      d.mesh.quaternion.copy(a.q1).premultiply(qs);
    } else d.mesh.quaternion.slerpQuaternions(a.q0, a.q1, e);
    d.mesh.scale.setScalar(a.s0 + (a.s1 - a.s0) * e);
    if (t >= 1) d.anim = null;
  }
  renderer.render(scene, camera);
}
function restQuat(d) {
  if (d.restQ) return d.restQ.clone();
  const q = faceInfo[FACE_KEYS[d.faceIdx]].q.clone();
  return q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw));
}

// Throw the given dice. rolls: [{id, faceIdx}] (faceIdx = index into that die's faces).
let rollMode = "placed";
export function setRollMode(m) { rollMode = m === "thrown" ? "thrown" : "placed"; }
export function throwDice(rolls, fast = false) {   // returns ms until every die has landed
  if (rollMode === "thrown") return throwPhysics(rolls);
  const n = rolls.length, sp = fast ? 0.55 : 1; let last = 0;
  rolls.forEach((r, i) => {
    const d = dice[r.id]; if (!d) return;
    if (d.shown) { d.faces = d.shown.base.slice(); d.shown = null; }
    paintDie(d);
    d.faceIdx = r.faceIdx; d.state = "pool"; d.selected = false; d.yaw = (Math.random() - 0.5) * 0.12; d.restQ = null; d.shown = null;
    d.mats.forEach(m => m.color.setHex(0xffffff));
    d.mesh.visible = true;
    d.mesh.position.set((Math.random() - 0.5) * 2.5, 2.6 + Math.random() * 0.8, 1.9);   // drop in from inside the felt ring (playtest: dice spilled over the HUD from z 5.2)
    d.mesh.scale.setScalar(1);
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).normalize();
    d.slot = poolSlot(i, n);
    const dur = (0.85 + Math.random() * 0.25) * sp, delay = i * 0.035 * sp; last = Math.max(last, dur + delay);
    animTo(d, { pos: d.slot, quat: restQuat(d), dur, spin: { axis, angle: Math.PI * (4 + Math.random() * 3) * sp }, arc: 0.9, delay });
  });
  return Math.round(last * 1000) + 40;
}
// Hide everything (new turn / hot dice)
export function clearTable() {
  setMark(null);
  dice.forEach(d => { d.state = "hidden"; d.selected = false; d.anim = null; d.mesh.visible = false; });
}
// Sync held/selected looks with the game. held: ids set aside this turn (in order); sel: ids selected (in order)
let spentEcho = [];
export function sync(held, sel, spent = []) {
  spentEcho = spent;
  // spent dice vanish from the table (they come back on the next roll)
  held.forEach((id, i) => {
    const d = dice[id]; if (!d || !d.slot) return;
    if (d.state !== "held") {
      d.state = "held"; d.selected = false;
      const p = d.slot.clone(); p.y += 0.5;     // spent: rise a little and shrink away
      animTo(d, { pos: p, quat: restQuat(d), scale: 0.001, dur: 0.28 });
    }
    d.mat.emissive.setHex(0x000000);
  });
  dice.forEach(d => {
    if (d.state !== "pool") return;
    const s = sel.includes(d.id);
    d.mats.forEach(m => m.color.setHex(s ? 0xffdc94 : 0xffffff));   // selected dice glow gold (playtest: picked dice looked unpicked)
    if (s !== d.selected) {
      d.selected = s;
      const p = d.slot.clone(); if (s) { p.y += 0.45; p.z += 0.2; }
      const q = restQuat(d); if (s) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.32));
      if (!d.anim || d.anim.dur < 0.5) animTo(d, { pos: p, quat: q, dur: 0.14 });
    }
    d.mat.emissive.setHex(s ? 0x8a5600 : spentEcho.includes(d.id) ? 0x2c0c52 : markIds.includes(d.id) ? 0x1c0404 : 0x000000);
  });
}
// Replace the letter showing on a die (Ink sigil) or reroll it in place (Tumble)
export function overrideTop(id, letter) { const d = dice[id]; paintDie(d, d.faceIdx, letter); }
export function rerollOne(id, faceIdx) {
  const d = dice[id]; d.restQ = null; if (d.shown) { d.faces = d.shown.base.slice(); d.shown = null; } d.faceIdx = faceIdx; paintDie(d); d.selected = false;
  const axis = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
  d.mesh.position.y += 0.8;
  animTo(d, { pos: d.slot, quat: restQuat(d), dur: 0.6, spin: { axis, angle: Math.PI * 4 }, arc: 0.6 });
}
export function shakeBust() { dice.forEach(d => { if (d.state === "pool") d.mat.emissive.setHex(0x3a0000); }); }

// ---------- camera / input ----------
// How much of the free band the table fills. Lower = smaller dice with more felt around them.
const TABLE_FILL = 0.74;
let band = null; // {top, bottom} in CSS px: the free area between the HUD and the tray
export function setBand(top, bottom) { band = { top, bottom }; resize(); }
function resize() {
  if (!renderer) return;
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const top = band ? band.top : 0, bottom = band ? band.bottom : h, bh = Math.max(120, bottom - top);
  // Points that must be on screen: pool grid corners (with a die's height) and the set-aside row.
  const rows = Math.max(3, Math.ceil(dice.length / cols()));
  const hx = (cols() - 1) / 2 * GAP + DIE * 0.7, z0 = poolSlot(0, rows * cols()).z - DIE * 0.7, z1 = poolSlot(rows * cols() - 1, rows * cols()).z + DIE * 0.7;
  const pts = [[-hx, 0, z1], [hx, 0, z1], [-hx, DIE, z0], [hx, DIE, z0]].map(p => new THREE.Vector3(...p));
  const tilt = THREE.MathUtils.degToRad(70), look = new THREE.Vector3(0, 0, -0.6);
  let dist = 12, offY = 0;
  for (let it = 0; it < 6; it++) {
    camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist).add(new THREE.Vector3(0, 0, look.z));
    camera.lookAt(look);
    camera.clearViewOffset(); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    let minY = 1e9, maxY = -1e9, maxX = 0;
    pts.forEach(p => { const v = p.clone().project(camera); const py = (1 - v.y) / 2 * h; minY = Math.min(minY, py); maxY = Math.max(maxY, py); maxX = Math.max(maxX, Math.abs(v.x) * w / 2); });
    const scale = Math.max((maxY - minY) / (bh * TABLE_FILL), maxX / (w / 2 * TABLE_FILL));
    dist *= scale;
    offY = (minY + maxY) / 2 - (top + bottom) / 2;
  }
  camera.setViewOffset(w, h, 0, offY, w, h);
  camera.updateProjectionMatrix();
}
export function relayout() { resize(); }
function onPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(v, camera);
  const hits = raycaster.intersectObjects(dice.filter(d => d.mesh.visible).map(d => d.mesh));
  if (hits.length && tapCb) tapCb(hits[0].object.userData.id);
}

// ---------- the enemy's red trace ----------
// ids: dice ids in the claimed word's letter order (or null). delay: seconds to wait (let a throw settle first).
export function setMark(ids, delay = 0) {
  if (markGroup) { scene.remove(markGroup); markGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); markGroup = null; }
  markIds = ids ? ids.slice() : []; markAnim = null;
  dice.forEach(d => { if (d.state === "pool" && !d.selected) d.mat.emissive.setHex(markIds.includes(d.id) ? 0x1c0404 : 0x000000); });
  if (!ids || ids.length < 1) return;
  markAnim = { t: -delay, dur: 0.25 + 0.18 * ids.length, built: false };
}
function buildMark() {
  const pts = markIds.map(id => { const d = dice[id]; const p = (d.slot || d.mesh.position).clone(); p.y = DIE + 0.07; return p; });
  markGroup = new THREE.Group();
  // see-through: the letters under the claim must stay readable
  const red = new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.55, depthTest: false });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.12, depthTest: false, blending: THREE.AdditiveBlending });
  // a dot on each claimed die
  pts.forEach(p => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.52, 4, 1, Math.PI / 4), red.clone()); // square frame around the top face
    ring.rotation.x = -Math.PI / 2; ring.position.copy(p); ring.renderOrder = 10; ring.material.opacity = 0; markGroup.add(ring);
  });
  if (pts.length > 1) {
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
    const seg = 24 * (pts.length - 1);
    const core = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, 0.028, 8, false), red);
    const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, 0.08, 8, false), glow);
    core.renderOrder = halo.renderOrder = 11;
    markGroup.userData.tubes = [core, halo];
    markGroup.add(halo, core);
    [core, halo].forEach(m => m.geometry.setDrawRange(0, 0));
  }
  scene.add(markGroup);
}
function tickMark(dt) {
  const a = markAnim; if (!a) return;
  a.t += dt; if (a.t < 0) return;
  if (!a.built) { buildMark(); a.built = true; }
  const p = Math.min(1, a.t / a.dur);
  const tubes = markGroup.userData.tubes || [];
  tubes.forEach(m => m.geometry.setDrawRange(0, Math.floor(m.geometry.index.count * p / 6) * 6));
  const rings = markGroup.children.filter(o => o.geometry && o.geometry.type === "RingGeometry");
  rings.forEach((r, i) => { const on = p >= i / Math.max(1, rings.length - 1) - 0.001; r.material.opacity = on ? 0.7 : 0; });
  if (p >= 1) { // gentle pulse once drawn
    const k = 0.75 + 0.25 * Math.sin(a.t * 5);
    tubes.forEach((m, i) => m.material.opacity = i ? 0.12 * k : 0.55 * k);
  }
}

// ---------- thrown rolls (physics) ----------
// The throw is simulated ahead of time with cannon-es and played back. Whichever face lands up is repainted with the
// letter the rules rolled, so the throw is real but the seed still decides the letters. A cocked die is re-thrown.
// After settling, each die gives a small turn so its letter faces the player.
const AXIS_V = k => new THREE.Vector3(...AXES[k]);
function simulateThrow(n) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -40, 0) });
  world.allowSleep = true;
  const mat = new CANNON.Material("felt"), dm = new CANNON.Material("bone");
  world.addContactMaterial(new CANNON.ContactMaterial(mat, dm, { friction: 0.35, restitution: 0.32 }));
  world.addContactMaterial(new CANNON.ContactMaterial(dm, dm, { friction: 0.2, restitution: 0.25 }));
  const plane = (pos, rotAxis, ang) => { const b = new CANNON.Body({ mass: 0, material: mat, shape: new CANNON.Plane() }); b.position.set(...pos); if (rotAxis) b.quaternion.setFromAxisAngle(new CANNON.Vec3(...rotAxis), ang); world.addBody(b); };
  plane([0, 0, 0], [1, 0, 0], -Math.PI / 2);          // felt
  plane([-2.6, 0, 0], [0, 1, 0], Math.PI / 2);        // left wall
  plane([2.6, 0, 0], [0, 1, 0], -Math.PI / 2);        // right wall
  plane([0, 0, -1.5], null, 0);                       // back wall (keeps clear of the set-aside row)
  plane([0, 0, 2.2], [0, 1, 0], Math.PI);             // front wall (keeps clear of the word tray)
  const bodies = [];
  for (let i = 0; i < n; i++) {
    const b = new CANNON.Body({ mass: 1, material: dm, shape: new CANNON.Box(new CANNON.Vec3(0.48, 0.48, 0.48)), sleepSpeedLimit: 0.25, sleepTimeLimit: 0.15, linearDamping: 0.12, angularDamping: 0.18 });
    b.position.set(-1.6 + (i % 3) * 1.6 + (Math.random() - 0.5) * 0.4, 1.4 + Math.floor(i / 3) * 1.1, 1.9 - Math.random() * 0.3);
    b.quaternion.setFromEuler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    b.velocity.set((Math.random() - 0.5) * 3, -2, -7 - Math.random() * 3);
    b.angularVelocity.set((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24);
    world.addBody(b); bodies.push(b);
  }
  const frames = bodies.map(() => []);
  for (let step = 0; step < 60 * 2.3; step++) {
    world.step(1 / 60);
    bodies.forEach((b, i) => frames[i].push({ p: new THREE.Vector3(b.position.x, b.position.y, b.position.z), q: new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w) }));
    if (step > 30 && bodies.every(b => b.sleepState === CANNON.Body.SLEEPING)) break;
  }
  // which model axis ended up pointing up, and is it flat?
  const ups = bodies.map((b, i) => {
    const q = frames[i][frames[i].length - 1].q; let best = null, by = -2;
    for (const k of FACE_KEYS) { const y = AXIS_V(k).applyQuaternion(q).y; if (y > by) { by = y; best = k; } }
    return { key: best, flat: by > 0.97 };
  });
  return { frames, ups, ok: ups.every(u => u.flat) };
}
function throwPhysics(rolls) {
  const n = rolls.length;
  let sim = null;
  for (let tries = 0; tries < 6; tries++) { sim = simulateThrow(n); if (sim.ok) break; }
  let longest = 0;
  rolls.forEach((r, i) => {
    const d = dice[r.id]; if (!d) return;
    if (d.shown) d.faces = d.shown.base.slice();
    const base = d.faces.slice();
    // put the rolled face on whichever side landed up: swap it with the face that lives on that axis
    const upKey = sim.ups[i].key, j = FACE_KEYS.indexOf(upKey);
    const faces = base.slice(); const tmp = faces[j]; faces[j] = faces[r.faceIdx]; faces[r.faceIdx] = tmp;
    d.faces = faces; d.shown = { base };
    d.faceIdx = j; d.state = "pool"; d.selected = false; d.mesh.visible = true; d.mesh.scale.setScalar(1);
    paintDie(d);
    const fr = sim.frames[i], last = fr[fr.length - 1];
    // settle: turn about Y so the letter is upright for the player
    const flatQ = faceInfo[upKey].q.clone();
    const yawNow = new THREE.Quaternion().multiplyQuaternions(last.q, flatQ.clone().invert());
    const e = new THREE.Euler().setFromQuaternion(yawNow, "YXZ");
    const upright = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.3).multiply(flatQ);
    const pos = last.p.clone(); pos.y = DIE / 2;
    d.slot = pos; d.restQ = upright;
    d.mesh.position.copy(fr[0].p); d.mesh.quaternion.copy(fr[0].q);
    longest = Math.max(longest, fr.length);
    d.anim = { t: 0, frames: fr, then: () => animTo(d, { pos, quat: upright, dur: 0.28 }) };
    void e;
  });
  return Math.round(longest / 60 * 1000) + 350;
}

// Where the felt ring sits on screen (CSS px), for the HTML push-timer arc drawn over it.
const RING_R = 3.37, RING_Z = 0.1;
// Omens for this roll: { dieId: "cursed" | ... }. Repaints only dice whose omen changed.
export function setOmens(map) { dice.forEach(d => { const o = (map && map[d.id]) || null; if (o !== (d.omen || null)) { d.omen = o; paintDie(d); } }); }
// True once every die on the table has finished moving (timers and taps wait for this, not for a fixed delay).
export function settled() { return dice.every(d => !d.anim || d.anim.dur < 0.5); }
// Screen position (stage px) of a die's top face, for the inlay links drawn in the overlay SVG.
export function dieScreen(id) {
  const d = dice[id]; if (!renderer || !d || !d.mesh.visible) return null;
  const w = container.clientWidth, h = container.clientHeight, v = d.mesh.position.clone(); v.y += 0.5; v.project(camera);
  return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
}
export function ringScreen() {
  if (!renderer) return null;
  const w = container.clientWidth, h = container.clientHeight;
  const P = (x, z) => { const v = new THREE.Vector3(x, 0, z).project(camera); return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h }; };
  const c = P(0, RING_Z), l = P(-RING_R, RING_Z), r = P(RING_R, RING_Z), t = P(0, RING_Z - RING_R), b = P(0, RING_Z + RING_R);
  return { cx: (l.x + r.x) / 2, cy: (t.y + b.y) / 2, rx: (r.x - l.x) / 2, ry: (b.y - t.y) / 2 };
}
