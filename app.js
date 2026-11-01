"use strict";
/* =====================================================================
   La crue de l'Huveaune — pluie, ruissellement, karst
   Fusion de « carte3d.html » (maquette 3D réelle du bassin) et de
   « Animation karst » (simulation de crue 48 h, 4 stations).

   CONTRAT SPATIAL (une seule source de vérité pour l'altitude)
     x monde  : 0 (ouest)  -> WM (est)
     z monde  : 0 (nord)   -> HM (sud)
     y monde  : altitude en mètres × EXAG
     Toute couche passe par TH(x, z).
   ===================================================================== */
window.__err = [];
window.addEventListener('error', e => window.__err.push(String(e.message) + ' @' + e.lineno));

const D = window.BVH, M = D.meta;
const NX = M.nx, NY = M.ny;
const WM = M.W_km * 1000, HM = M.H_km * 1000;
const ELEV = D.grid;
let EXAG = 2.2;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

function cellElev(i, j) {
  i = clamp(i, 0, NY - 1); j = clamp(j, 0, NX - 1);
  return ELEV[i * NX + j];
}
function elevAt(x, z) {
  const fx = clamp(x / WM, 0, 1) * (NX - 1);
  const fz = clamp(z / HM, 0, 1) * (NY - 1);
  const j0 = Math.min(Math.floor(fx), NX - 2), i0 = Math.min(Math.floor(fz), NY - 2);
  const tx = fx - j0, tz = fz - i0;
  const h00 = cellElev(i0, j0), h10 = cellElev(i0, j0 + 1),
        h01 = cellElev(i0 + 1, j0), h11 = cellElev(i0 + 1, j0 + 1);
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}
function TH(x, z) { return elevAt(x, z) * EXAG; }
function groundNormal(x, z) {
  const e = 120;
  const nx = -(TH(x + e, z) - TH(x - e, z)) / (2 * e);
  const nz = -(TH(x, z + e) - TH(x, z - e)) / (2 * e);
  const l = Math.hypot(nx, 1, nz);
  return [nx / l, 1 / l, nz / l];
}
const wx = u => u * WM, wz = v => (1 - v) * HM;

/* =====================================================================
   1 · DONNÉES DE LA CRUE  (identiques à l'application « Animation karst »)
   Deux composantes gaussiennes :
     - ruissellement, précoce et local (pic T+6 à T+9 selon la station)
     - vidange karstique, tardive, partie de l'amont (pic T+16 à T+21)
   ===================================================================== */
const TOTAL_H = 48, PAS = 0.5;
const SIM = [];
for (let i = 0; i <= TOTAL_H / PAS; i++) {
  const t = i * PAS;
  const base = 0.3;
  const ruissM = 0.4 * Math.exp(-Math.pow(t - 6, 2) / 8);
  const ruissA = 0.5 * Math.exp(-Math.pow(t - 7, 2) / 8);
  const ruissR = 0.6 * Math.exp(-Math.pow(t - 8, 2) / 8);
  const ruissZ = 0.1 * Math.exp(-Math.pow(t - 9, 2) / 8);
  const karstZ = 1.2 * Math.exp(-Math.pow(t - 16, 2) / 15);
  const karstR = 1.3 * Math.exp(-Math.pow(t - 17.5, 2) / 18);
  const karstA = 0.9 * Math.exp(-Math.pow(t - 19, 2) / 20);
  const karstM = 0.4 * Math.exp(-Math.pow(t - 21, 2) / 25);
  SIM.push({
    t,
    stZacharie: base + ruissZ + karstZ,
    roquevaire: base + ruissR + karstR,
    aubagne: base + ruissA + karstA,
    marseille: base + ruissM + karstM
  });
}
const NIVEAU_MAX = 2.5;   /* échelle des limnigrammes (m) */

function simAt(t) {
  const f = clamp(t / PAS, 0, SIM.length - 1.0001);
  const i = Math.floor(f), u = f - i;
  const a = SIM[i], b = SIM[Math.min(i + 1, SIM.length - 1)];
  return {
    stZacharie: lerp(a.stZacharie, b.stZacharie, u),
    roquevaire: lerp(a.roquevaire, b.roquevaire, u),
    aubagne: lerp(a.aubagne, b.aubagne, u),
    marseille: lerp(a.marseille, b.marseille, u)
  };
}

/* =====================================================================
   2 · LES QUATRE STATIONS, ancrées sur la polyligne de l'Huveaune
   Positions obtenues en projetant les coordonnées lon/lat réelles des
   stations sur le tracé du MNT (écart au lit : 0,2 à 1,5 km).
   L'ordre amont -> aval est vérifié : 10,5 / 22,6 / 32,1 / 50,8 km.
   ===================================================================== */
const HUV_RIV = D.rivers.find(r => r.name === "L'Huveaune");
const HUV_SEG = HUV_RIV.segs.reduce((a, b) => a.length > b.length ? a : b);
const HUV_PTS = HUV_SEG.map(p => [wx(p[0]), wz(p[1])]);
/* le tracé extrait du MNT est en marches d'escalier : on le lisse pour que
   le ruban d'eau ne se replie pas sur lui-même quand il s'élargit */
{
  const n = HUV_PTS.length;
  for (let passe = 0; passe < 2; passe++) {
    const src = HUV_PTS.map(p => [p[0], p[1]]);
    for (let k = 1; k < n - 1; k++) {
      let sx = 0, sz = 0, c = 0;
      for (let q = Math.max(0, k - 3); q <= Math.min(n - 1, k + 3); q++) {
        sx += src[q][0]; sz += src[q][1]; c++;
      }
      HUV_PTS[k][0] = sx / c;
      HUV_PTS[k][1] = sz / c;
    }
  }
}
const HUV_KM = [0];
for (let k = 1; k < HUV_PTS.length; k++) {
  HUV_KM.push(HUV_KM[k - 1] +
    Math.hypot(HUV_PTS[k][0] - HUV_PTS[k - 1][0], HUV_PTS[k][1] - HUV_PTS[k - 1][1]) / 1000);
}
/* le tracé du MNT est en marches d'escalier : on le ramène à la longueur
   officielle du cours d'eau (50,8 km, OpenStreetMap) */
const KM_ECH = HUV_RIV.km / HUV_KM[HUV_KM.length - 1];
for (let k = 0; k < HUV_KM.length; k++) HUV_KM[k] *= KM_ECH;

const STATIONS = [
  { key: 'stZacharie', nom: 'St-Zacharie', court: 'S1', idx: 70, color: '#06b6d4', km: HUV_KM[70] },
  { key: 'roquevaire', nom: 'Roquevaire', court: 'S2', idx: 192, color: '#22c55e', km: HUV_KM[192] },
  { key: 'aubagne', nom: 'Aubagne', court: 'S3', idx: 262, color: '#f59e0b', km: HUV_KM[262] },
  { key: 'marseille', nom: 'Marseille', court: 'S4', idx: 392, color: '#3b82f6', km: HUV_KM[392] }
];

/* hauteur d'eau (m) à un kilomètre donné, interpolée entre stations */
function niveauAtKm(km) {
  const n = simAt(TEMPS);
  if (km <= STATIONS[0].km) return n[STATIONS[0].key];
  for (let k = 0; k < STATIONS.length - 1; k++) {
    const a = STATIONS[k], b = STATIONS[k + 1];
    if (km <= b.km) return lerp(n[a.key], n[b.key], (km - a.km) / (b.km - a.km));
  }
  return n[STATIONS[STATIONS.length - 1].key];
}

/* =====================================================================
   3 · SCÈNE
   ===================================================================== */
const cv = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const CIEL_CLAIR = new THREE.Color(0xdfe7e3);
const CIEL_PLUIE = new THREE.Color(0xb4c2c0);
scene.background = CIEL_CLAIR.clone();
scene.fog = new THREE.Fog(0xdfe7e3, WM * 2.2, WM * 5.5);

const camera = new THREE.PerspectiveCamera(42, 1, 30, 400000);
const cible = new THREE.Vector3(WM * 0.52, 0, HM * 0.5);

const sun = new THREE.DirectionalLight(0xfff4dd, 0.42);
sun.position.set(-0.55, 0.78, -0.42).multiplyScalar(50000);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xd6e8f5, 0x6b5a3f, 0.72));
scene.add(new THREE.AmbientLight(0xffffff, 0.10));

/* =====================================================================
   4 · RELIEF
   ===================================================================== */
const RAMP = [[0,0xa8bcc2],[9,0xa6b7a6],[30,0xa4b28e],[110,0x9eac79],[240,0x98a66d],
              [380,0xa3a473],[520,0xb2a67e],[700,0xb29b7a],[880,0xb5a98f],[1000,0xc0b6a0],[1148,0xcec7b6]];
function hexRGB(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
function rampColor(h) {
  let a = RAMP[0], b = RAMP[RAMP.length - 1];
  for (let k = 0; k < RAMP.length - 1; k++)
    if (h >= RAMP[k][0] && h <= RAMP[k + 1][0]) { a = RAMP[k]; b = RAMP[k + 1]; break; }
  const t = clamp((h - a[0]) / Math.max(1, b[0] - a[0]), 0, 1);
  const ca = hexRGB(a[1]), cb = hexRGB(b[1]);
  return [lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)];
}

const terrainGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(NX * NY * 3);
  const col = new Float32Array(NX * NY * 3);
  for (let i = 0; i < NY; i++) for (let j = 0; j < NX; j++) {
    const k = (i * NX + j) * 3;
    pos[k] = j / (NX - 1) * WM;
    pos[k + 1] = cellElev(i, j) * EXAG;
    pos[k + 2] = i / (NY - 1) * HM;
  }
  const idx = [];
  for (let i = 0; i < NY - 1; i++) for (let j = 0; j < NX - 1; j++) {
    const a = i * NX + j, b = a + 1, c = a + NX, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  terrainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  terrainGeo.setIndex(idx);
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
function paintTerrain() {
  const col = terrainGeo.attributes.color.array;
  for (let i = 0; i < NY; i++) for (let j = 0; j < NX; j++) {
    const k = (i * NX + j) * 3;
    const h = cellElev(i, j);
    const c = rampColor(h);
    const dzx = (cellElev(i, Math.min(j + 1, NX - 1)) - cellElev(i, Math.max(j - 1, 0))) / (2 * M.cell_x);
    const dzy = (cellElev(Math.min(i + 1, NY - 1), j) - cellElev(Math.max(i - 1, 0), j)) / (2 * M.cell_y);
    const pente = Math.hypot(dzx, dzy);
    const roche = clamp((pente - 0.30) / 0.55, 0, 1) * 0.45;
    let r = c[0], g = c[1], b = c[2];
    r = lerp(r, 0.56, roche); g = lerp(g, 0.51, roche); b = lerp(b, 0.44, roche);
    if (h < 9) { r = 0.72; g = 0.84; b = 0.86; }
    const gx = -dzx * EXAG, gz = -dzy * EXAG;
    const nl = Math.hypot(gx, 1, gz);
    const lam = clamp((gx * -0.62 + 1 * 0.70 + gz * -0.35) / nl, 0, 1);
    let ombre = 0.66 + 0.66 * Math.pow(lam, 1.10);
    let voisin = 0, nv = 0;
    for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) {
      if (!a && !bb) continue;
      voisin += cellElev(i + a, j + bb); nv++;
    }
    const courb = (h - voisin / nv) / 60;
    ombre *= clamp(1 + courb * 0.55, 0.80, 1.16);
    if (h < 9) ombre = 1;
    col[k] = Math.pow(clamp(r * ombre, 0, 1), 2.2);
    col[k + 1] = Math.pow(clamp(g * ombre, 0, 1), 2.2);
    col[k + 2] = Math.pow(clamp(b * ombre, 0, 1), 2.2);
  }
  terrainGeo.attributes.color.needsUpdate = true;
  terrainGeo.computeVertexNormals();
}
paintTerrain();
const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.94, metalness: 0.0, flatShading: false
}));
scene.add(terrain);

const socle = new THREE.Group();
scene.add(socle);
const BAS_SOCLE = -900;
const matSocle = new THREE.MeshStandardMaterial({ color: 0xcbbfa6, roughness: 1, metalness: 0 });
const matSocleF = new THREE.MeshStandardMaterial({ color: 0xb3a68c, roughness: 1, metalness: 0 });
function construireSocle() {
  while (socle.children.length) {
    const m = socle.children.pop();
    m.geometry.dispose();
  }
  function paroi(liste, materiau) {
    const pos = [], idx = [];
    liste.forEach(([x, z], k) => {
      pos.push(x, TH(x, z), z, x, BAS_SOCLE, z);
      if (k < liste.length - 1) { const o = k * 2; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    socle.add(new THREE.Mesh(g, materiau));
  }
  const nord = [], sud = [], ouest = [], est = [];
  for (let j = 0; j < NX; j++) { nord.push([j / (NX - 1) * WM, 0]); sud.push([j / (NX - 1) * WM, HM]); }
  for (let i = 0; i < NY; i++) { ouest.push([0, i / (NY - 1) * HM]); est.push([WM, i / (NY - 1) * HM]); }
  paroi(nord, matSocleF); paroi(ouest, matSocleF); paroi(sud, matSocle); paroi(est, matSocle);
}

/* fond de carte QGIS */
let qgisMesh = null;
{
  const img = new Image();
  img.onload = () => {
    const tex = new THREE.CanvasTexture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    const uv = new Float32Array(NX * NY * 2);
    for (let i = 0; i < NY; i++) for (let j = 0; j < NX; j++) {
      const k = (i * NX + j) * 2;
      uv[k] = j / (NX - 1);
      uv[k + 1] = 0.708661 * (1 - i / (NY - 1));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', terrainGeo.attributes.position.clone());
    g.setAttribute('normal', terrainGeo.attributes.normal.clone());
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(terrainGeo.index.clone());
    qgisMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.96
    }));
    qgisMesh.visible = false;
    qgisMesh.position.y = 3;
    scene.add(qgisMesh);
  };
  img.src = 'data:image/jpeg;base64,' + D.tex;
}

/* =====================================================================
   5 · RUBANS
   ===================================================================== */
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    let d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d < 1e-6) continue;
    let t = 0;
    while (carry + d - t > step) {
      t += step - carry;
      carry = 0;
      const u = t / d;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    carry = carry + d - t;
  }
  const last = pts[pts.length - 1];
  const pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.35) out.push(last);
  return out;
}

function ribbon(pts, width, lift, uScale) {
  const P = resample(pts, Math.max(60, width * 1.2));
  const n = P.length;
  if (n < 2) return null;
  const pos = new Float32Array(n * 2 * 3);
  const nor = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx = [];
  let s = 0;
  for (let k = 0; k < n; k++) {
    const p = P[k];
    const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    let f = 1;
    if (k > 0 && k < n - 1) {
      const u1 = [p[0] - a[0], p[1] - a[1]], u2 = [b[0] - p[0], b[1] - p[1]];
      const l1 = Math.hypot(u1[0], u1[1]) || 1, l2 = Math.hypot(u2[0], u2[1]) || 1;
      const cosA = (u1[0] * u2[0] + u1[1] * u2[1]) / (l1 * l2);
      f = clamp(1 / Math.max(0.42, (1 + cosA) / 2 * 1.6), 1, 2.1);
    }
    if (k > 0) s += Math.hypot(p[0] - P[k - 1][0], p[1] - P[k - 1][1]);
    const nx = -dz * width * 0.5 * f, nz = dx * width * 0.5 * f;
    const gn = groundNormal(p[0], p[1]);
    for (let e = 0; e < 2; e++) {
      const sx = e ? p[0] + nx : p[0] - nx;
      const sz = e ? p[1] + nz : p[1] - nz;
      const o = (k * 2 + e) * 3;
      pos[o] = sx; pos[o + 1] = TH(sx, sz) + lift; pos[o + 2] = sz;
      nor[o] = gn[0]; nor[o + 1] = gn[1]; nor[o + 2] = gn[2];
      const u = (k * 2 + e) * 2;
      uv[u] = s / uScale; uv[u + 1] = e;
    }
    if (k < n - 1) {
      const o = k * 2;
      idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* =====================================================================
   6 · LIGNE DE PARTAGE DES EAUX
   ===================================================================== */
const groupeBassin = new THREE.Group();
scene.add(groupeBassin);
{
  const ring = D.basin.map(p => [wx(p[0]), wz(p[1])]);
  ring.push(ring[0]);
  const crete = ribbon(ring, 95, 16, 900);
  if (crete) groupeBassin.add(new THREE.Mesh(crete, new THREE.MeshBasicMaterial({
    color: 0xf0a500, side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: 0.97
  })));
  const P = resample(ring, 220);
  const pos = [], idx = [];
  for (let k = 0; k < P.length; k++) {
    const [x, z] = P[k];
    const y = TH(x, z);
    pos.push(x, y + 14, z, x, y + 520, z);
    if (k < P.length - 1) {
      const o = k * 2;
      idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  groupeBassin.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color: 0xf0a500, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false
  })));
}

/* =====================================================================
   7 · COURS D'EAU (statiques) + L'EAU DE L'HUVEAUNE (dynamique)
   ===================================================================== */
const groupeEau = new THREE.Group();
scene.add(groupeEau);

const flowTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 32);
  grd.addColorStop(0, 'rgba(12,74,100,0.98)');
  grd.addColorStop(0.28, 'rgba(46,132,168,0.98)');
  grd.addColorStop(0.55, 'rgba(96,182,208,0.98)');
  grd.addColorStop(1, 'rgba(12,74,100,0.98)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 32);
  for (let k = 0; k < 4; k++) {
    const x0 = k * 64 + 4;
    const g2 = g.createLinearGradient(x0, 0, x0 + 40, 0);
    g2.addColorStop(0, 'rgba(235,250,255,0)');
    g2.addColorStop(0.5, 'rgba(235,250,255,0.6)');
    g2.addColorStop(1, 'rgba(235,250,255,0)');
    g.fillStyle = g2; g.fillRect(x0, 9, 40, 14);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const RIV_W = { "L'Huveaune": 260, "Le Jarret": 165, "Le Merlançon": 165 };
D.rivers.forEach(r => {
  const w = RIV_W[r.name] || 105;
  const principal = r.name === "L'Huveaune";
  const mat = new THREE.MeshBasicMaterial({
    map: flowTex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    color: principal ? 0xffffff : 0xdbeaf2
  });
  const halo = new THREE.MeshBasicMaterial({
    color: 0x8fc4da, transparent: true, opacity: principal ? 0.30 : 0.20,
    side: THREE.DoubleSide, depthWrite: false
  });
  r.segs.forEach(seg => {
    const pts = seg.map(p => [wx(p[0]), wz(p[1])]);
    if (pts.length < 2) return;
    const gh = ribbon(pts, w * 2.4, 22, 620);
    if (gh) { const mh = new THREE.Mesh(gh, halo); mh.renderOrder = 3; groupeEau.add(mh); }
    const g = ribbon(pts, w, 26, 620);
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 4;
    groupeEau.add(m);
  });
});

/* ---- l'Huveaune en crue : ruban à géométrie fixe, sommets recalculés ---- */
const NV = HUV_PTS.length;
const eauPos = new Float32Array(NV * 2 * 3);
const eauUv = new Float32Array(NV * 2 * 2);
const eauNor = new Float32Array(NV * 2 * 3);
const eauIdx = [];
const eauPerp = new Float32Array(NV * 2);   /* demi-largeur unitaire (nx, nz) */
const eauBaseY = new Float32Array(NV);
{
  for (let k = 0; k < NV; k++) {
    const p = HUV_PTS[k];
    const a = HUV_PTS[Math.max(0, k - 1)], b = HUV_PTS[Math.min(NV - 1, k + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    let f = 1;
    if (k > 0 && k < NV - 1) {
      const u1 = [p[0] - a[0], p[1] - a[1]], u2 = [b[0] - p[0], b[1] - p[1]];
      const l1 = Math.hypot(u1[0], u1[1]) || 1, l2 = Math.hypot(u2[0], u2[1]) || 1;
      const cosA = (u1[0] * u2[0] + u1[1] * u2[1]) / (l1 * l2);
      f = clamp(1 / Math.max(0.42, (1 + cosA) / 2 * 1.6), 1, 2.1);
    }
    eauPerp[k * 2] = -dz * f;
    eauPerp[k * 2 + 1] = dx * f;
    for (let e = 0; e < 2; e++) {
      const u = (k * 2 + e) * 2;
      eauUv[u] = HUV_KM[k] * 1000 / 2600;
      eauUv[u + 1] = e;
    }
    if (k < NV - 1) {
      const o = k * 2;
      eauIdx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    }
  }
}
const eauGeo = new THREE.BufferGeometry();
eauGeo.setAttribute('position', new THREE.BufferAttribute(eauPos, 3));
eauGeo.setAttribute('normal', new THREE.BufferAttribute(eauNor, 3));
eauGeo.setAttribute('uv', new THREE.BufferAttribute(eauUv, 2));
eauGeo.setIndex(eauIdx);

const eauTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(28,96,124,1)');
  grd.addColorStop(0.16, 'rgba(58,140,170,1)');
  grd.addColorStop(0.5, 'rgba(96,180,205,1)');
  grd.addColorStop(0.84, 'rgba(58,140,170,1)');
  grd.addColorStop(1, 'rgba(28,96,124,1)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 64);
  /* ondulations douces, sans motif répétitif marqué */
  for (let k = 0; k < 9; k++) {
    const x = k * 28 + 6, w = 26 + (k % 3) * 8;
    const g2 = g.createLinearGradient(x, 0, x + w, 0);
    g2.addColorStop(0, 'rgba(226,245,255,0)');
    g2.addColorStop(0.5, 'rgba(226,245,255,.22)');
    g2.addColorStop(1, 'rgba(226,245,255,0)');
    g.fillStyle = g2;
    g.fillRect(x, 20 + (k % 4) * 5, w, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const eauMat = new THREE.MeshBasicMaterial({
  map: eauTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: 0xffffff
});
const eauMesh = new THREE.Mesh(eauGeo, eauMat);
eauMesh.renderOrder = 6;
groupeEau.add(eauMesh);

/* nappe d'inondation : un ruban plus large, translucide, dont l'alpha
   de chaque sommet suit la hauteur d'eau locale */
const eauHPos = new Float32Array(NV * 2 * 3);
const eauHCol = new Float32Array(NV * 2 * 4);
const eauHGeo = new THREE.BufferGeometry();
eauHGeo.setAttribute('position', new THREE.BufferAttribute(eauHPos, 3));
eauHGeo.setAttribute('color', new THREE.BufferAttribute(eauHCol, 4));
eauHGeo.setIndex(eauIdx);
const eauHMat = new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, opacity: 0.9,
  side: THREE.DoubleSide, depthWrite: false
});
const eauHalo = new THREE.Mesh(eauHGeo, eauHMat);
eauHalo.renderOrder = 5;
groupeEau.add(eauHalo);

/* L'EAU_EXAG : facteur d'exagération des hauteurs d'eau à l'écran.
   Le relief est déjà multiplié par EXAG ; on multiplie en plus les hauteurs
   d'eau par 130 pour qu'une crue de 1,50 m reste visible sur 45 km. */
const EAU_EXAG = 130;
const DEMI_LIT = 130;

function majEau() {
  for (let k = 0; k < NV; k++) {
    const lvl = niveauAtKm(HUV_KM[k]);
    const x = HUV_PTS[k][0], z = HUV_PTS[k][1];
    const y = eauBaseY[k] + 30 + lvl * EAU_EXAG * EXAG;
    const nx0 = eauPerp[k * 2], nz0 = eauPerp[k * 2 + 1];

    const demi = DEMI_LIT * (1 + 4.0 * lvl / NIVEAU_MAX);
    let nx = nx0 * demi, nz = nz0 * demi;
    let o = (k * 2) * 3;
    eauPos[o] = x - nx; eauPos[o + 1] = y; eauPos[o + 2] = z - nz;
    o = (k * 2 + 1) * 3;
    eauPos[o] = x + nx; eauPos[o + 1] = y; eauPos[o + 2] = z + nz;

    /* liseré humide de part et d'autre du lit */
    const demH = demi * 1.22;
    const nxH = nx0 * demH, nzH = nz0 * demH;
    o = (k * 2) * 3;
    eauHPos[o] = x - nxH; eauHPos[o + 1] = y - 8; eauHPos[o + 2] = z - nzH;
    o = (k * 2 + 1) * 3;
    eauHPos[o] = x + nxH; eauHPos[o + 1] = y - 8; eauHPos[o + 2] = z + nzH;
    const a = clamp((lvl - 0.55) / 1.0, 0, 1) * 0.42;
    for (let e = 0; e < 2; e++) {
      const q = (k * 2 + e) * 4;
      eauHCol[q] = 0.60; eauHCol[q + 1] = 0.74; eauHCol[q + 2] = 0.82; eauHCol[q + 3] = a;
    }

    const gn = groundNormal(x, z);
    eauNor[(k * 2) * 3] = gn[0]; eauNor[(k * 2) * 3 + 1] = gn[1]; eauNor[(k * 2) * 3 + 2] = gn[2];
    eauNor[(k * 2 + 1) * 3] = gn[0]; eauNor[(k * 2 + 1) * 3 + 1] = gn[1]; eauNor[(k * 2 + 1) * 3 + 2] = gn[2];
  }
  eauGeo.attributes.position.needsUpdate = true;
  eauGeo.attributes.normal.needsUpdate = true;
  eauGeo.computeBoundingSphere();
  eauHGeo.attributes.position.needsUpdate = true;
  eauHGeo.attributes.color.needsUpdate = true;
  eauHGeo.computeBoundingSphere();

  /* l'eau se charge en particules : elle brunit quand la crue monte */
  const k2 = clamp((niveauAtKm(STATIONS[1].km) - 0.4) / 1.0, 0, 1);
  eauMat.color.setRGB(lerp(1.0, 0.74, k2), lerp(1.0, 0.66, k2), lerp(1.0, 0.50, k2));
}

/* =====================================================================
   8 · ÉTIQUETTES
   ===================================================================== */
const groupeNoms = new THREE.Group();
scene.add(groupeNoms);

function coin(ctx, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
}
function makeLabel(text, color) {
  const fs = 40, pad = 14;
  const m = document.createElement('canvas').getContext('2d');
  m.font = `600 ${fs}px Georgia, "Iowan Old Style", serif`;
  const w = Math.ceil(m.measureText(text).width) + pad * 2;
  const h = fs + pad * 2;
  const cv2 = document.createElement('canvas');
  cv2.width = w * 2; cv2.height = h * 2;
  const c = cv2.getContext('2d');
  c.scale(2, 2);
  c.fillStyle = 'rgba(255,253,247,.9)';
  coin(c, w, h, 8); c.fill();
  c.strokeStyle = color; c.lineWidth = 1.6; c.stroke();
  c.fillStyle = '#2b2620';
  c.font = `600 ${fs}px Georgia, "Iowan Old Style", serif`;
  c.textBaseline = 'middle';
  c.fillText(text, pad, h / 2 + 1);
  const tex = new THREE.CanvasTexture(cv2);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: false, depthWrite: false, transparent: true
  }));
  sp.userData = { w, h, fs };
  sp.renderOrder = 20;
  return sp;
}

const labels = [];
const VILLES_STATION = STATIONS.map(s => s.nom);
D.labels.forEach(l => {
  if (l.name === 'Embouchure') return;            /* remplacée par la station Marseille */
  const court = l.name.replace('-sur-Huveaune', '').replace('Saint-Zacharie', 'St-Zacharie');
  if (VILLES_STATION.indexOf(court) >= 0) return;  /* l'étiquette de station porte déjà le nom */
  const x = wx(l.x), z = wz(l.y);
  const col = l.type === 'sommet' ? '#a8611f' : '#8a7c63';
  const sp = makeLabel(court, col);
  sp.userData.base = new THREE.Vector3(x, TH(x, z) + 60, z);
  sp.userData.prio = l.type === 'sommet' ? 4 : 3;
  groupeNoms.add(sp); labels.push(sp);
});
["Le Jarret"].forEach(nom => {   /* le Merlançon garde son ruban, mais son nom encombrait la vue */
  const r = D.rivers.find(q => q.name === nom);
  if (!r || !r.segs.length) return;
  const seg = r.segs.reduce((a, b) => a.length > b.length ? a : b);
  const mid = seg[Math.floor(seg.length * 0.45)];
  const x = wx(mid[0]), z = wz(mid[1]);
  const sp = makeLabel(nom, '#17607d');
  sp.userData.base = new THREE.Vector3(x, TH(x, z) + 60, z);
  sp.userData.prio = 2;
  groupeNoms.add(sp); labels.push(sp);
});

/* ---- étiquettes des stations : nom + hauteur d'eau en direct ---- */
const LW = 392, LH = 152, LFS = 58;
const etiqStations = [];
STATIONS.forEach(st => {
  const cvs = document.createElement('canvas');
  cvs.width = LW * 2; cvs.height = LH * 2;
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: false, depthWrite: false, transparent: true
  }));
  sp.userData = { w: LW, h: LH, fs: LFS, prio: 9, station: true, base: new THREE.Vector3() };
  sp.renderOrder = 21;
  groupeNoms.add(sp);
  labels.push(sp);
  etiqStations.push({ sp, cvs, tex, st, dernier: -1 });
  st.sprite = sp;
});

function dessineEtiqStation(e, lvl) {
  const c = e.cvs.getContext('2d');
  c.setTransform(2, 0, 0, 2, 0, 0);
  c.clearRect(0, 0, LW, LH);
  c.fillStyle = 'rgba(255,253,247,.95)';
  coin(c, LW, LH, 12); c.fill();
  c.strokeStyle = e.st.color; c.lineWidth = 2.4; c.stroke();
  c.fillStyle = e.st.color;
  c.fillRect(0, 0, 9, LH);
  c.beginPath(); c.moveTo(9, 0); c.quadraticCurveTo(20, 0, 20, 12);
  c.lineTo(20, LH - 12); c.quadraticCurveTo(20, LH, 9, LH); c.closePath(); c.fill();
  c.fillStyle = '#2b2620';
  c.font = '600 30px Georgia, "Iowan Old Style", serif';
  c.textBaseline = 'middle';
  c.fillText(e.st.nom, 34, 44);
  c.font = '600 62px Georgia, "Iowan Old Style", serif';
  c.fillStyle = '#14100c';
  c.fillText(lvl.toFixed(2).replace('.', ',') + ' m', 34, 106);
  e.tex.needsUpdate = true;
}

/* =====================================================================
   9 · CAMÉRA ORBITALE
   ===================================================================== */
const cam = { theta: 1.62, phi: 0.70, dist: WM * 1.12, target: new THREE.Vector3(WM * 0.5, 200, HM * 0.54) };
const camBut = { theta: cam.theta, phi: cam.phi, dist: cam.dist, target: cam.target.clone() };
let enVol = false, volFin = 0, volT0 = 0, volDe = null;
function appliquerCamera() {
  const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
  camera.position.set(
    cam.target.x + cam.dist * sp * Math.cos(cam.theta),
    cam.target.y + cam.dist * cp,
    cam.target.z + cam.dist * sp * Math.sin(cam.theta)
  );
  camera.lookAt(cam.target);
}
function volVers(theta, phi, dist, target, ms = 1100) {
  volDe = { theta: cam.theta, phi: cam.phi, dist: cam.dist, target: cam.target.clone() };
  volT0 = performance.now(); volFin = volT0 + ms; enVol = true;
  camBut.theta = theta; camBut.phi = phi; camBut.dist = dist;
  camBut.target.copy(target);
}
function majVol() {
  if (!enVol) return;
  const t = clamp((performance.now() - volT0) / (volFin - volT0), 0, 1);
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  let dt = camBut.theta - volDe.theta;
  while (dt > Math.PI) dt -= 2 * Math.PI;
  while (dt < -Math.PI) dt += 2 * Math.PI;
  cam.theta = volDe.theta + dt * e;
  cam.phi = lerp(volDe.phi, camBut.phi, e);
  cam.dist = lerp(volDe.dist, camBut.dist, e);
  cam.target.lerpVectors(volDe.target, camBut.target, e);
  if (t >= 1) enVol = false;
  besoin = true;
}

/* =====================================================================
   10 · LIMNIMÈTRES 3D
   À l'échelle du bassin (44 km de large), un mètre d'eau est invisible.
   Le limnimètre est donc un SYMBOLE : un mât sombre de 3 200 unités
   (= 1 450 m réels à ×2,2) le long duquel monte une colonne colorée
   qui représente 0 à 2,5 m de hauteur d'eau. C'est la valeur affichée
   dans l'étiquette qui fait foi, pas la hauteur du fût.
   ===================================================================== */
const GAUGE_H = 3200, GAUGE_R = 250;
const groupeLimni = new THREE.Group();
scene.add(groupeLimni);
const limnis = [];

STATIONS.forEach(st => {
  const p = HUV_PTS[st.idx];
  const a = HUV_PTS[Math.max(0, st.idx - 2)], b = HUV_PTS[Math.min(NV - 1, st.idx + 2)];
  let dx = b[0] - a[0], dz = b[1] - a[1];
  const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const off = 330;
  const x = clamp(p[0] + dz * off, 500, WM - 500);
  const z = clamp(p[1] - dx * off, 500, HM - 500);
  st.x = x; st.z = z;

  const g = new THREE.Group();
  g.position.set(x, 0, z);
  groupeLimni.add(g);

  const col = new THREE.Color(st.color);

  /* mât sombre : dépasse toujours, même à sec */
  const mat_ = new THREE.Mesh(
    new THREE.CylinderGeometry(34, 34, GAUGE_H + 420, 7),
    new THREE.MeshBasicMaterial({ color: 0x2f2a22 }));
  mat_.position.y = (GAUGE_H + 420) / 2;
  g.add(mat_);

  /* plinthe */
  const soc = new THREE.Mesh(
    new THREE.CylinderGeometry(GAUGE_R * 1.55, GAUGE_R * 1.8, 90, 14),
    new THREE.MeshBasicMaterial({ color: 0x3a332a }));
  soc.position.y = 45;
  g.add(soc);

  /* fourreau translucide : le volume disponible */
  const fourreau = new THREE.Mesh(
    new THREE.CylinderGeometry(GAUGE_R, GAUGE_R, GAUGE_H, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15,
      side: THREE.DoubleSide, depthWrite: false }));
  fourreau.position.y = GAUGE_H / 2 + 90;
  g.add(fourreau);

  /* colonne d'eau */
  const eau = new THREE.Mesh(
    new THREE.CylinderGeometry(GAUGE_R * 0.97, GAUGE_R * 0.97, 1, 14),
    new THREE.MeshBasicMaterial({ color: col }));
  g.add(eau);

  /* flotteur : repère blanc à la surface */
  const flt = new THREE.Mesh(
    new THREE.CylinderGeometry(GAUGE_R * 1.14, GAUGE_R * 1.14, 26, 14),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  g.add(flt);

  /* graduations tous les 0,5 m */
  for (let i = 1; i <= 4; i++) {
    const gr = new THREE.Mesh(
      new THREE.BoxGeometry(GAUGE_R * 3.1, 20, 26),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0x2b2620 : 0xe8e0cd }));
    gr.position.set(0, 90 + GAUGE_H * i / 5, 0);
    g.add(gr);
  }

  limnis.push({ g, eau, flt, st, fourreau });
});

/* =====================================================================
   11 · INTERACTION
   ===================================================================== */
let drag = null;
cv.addEventListener('pointerdown', e => {
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pointeur synthétique */ }
  drag = { x: e.clientX, y: e.clientY, shift: e.shiftKey || e.button === 2, moved: 0 };
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.shift) {
    const k = cam.dist / cv.clientHeight * 1.6;
    const st = Math.sin(cam.theta), ct = Math.cos(cam.theta);
    cam.target.x -= (ct * dx + st * dy) * k;
    cam.target.z -= (st * dx - ct * dy) * k;
  } else {
    cam.theta -= dx * 0.0055;
    cam.phi = clamp(cam.phi - dy * 0.0045, 0.06, 1.48);
  }
  enVol = false;
  besoin = true;
});
cv.addEventListener('pointerup', e => {
  if (drag && drag.moved < 6) clicScene(e);
  drag = null;
});
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  e.preventDefault();
  cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0011), 3500, WM * 3.2);
  enVol = false; besoin = true;
}, { passive: false });

/* ---- goutte : clic sur le relief ---- */
const raycaster = new THREE.Raycaster();
const groupeGoutte = new THREE.Group();
scene.add(groupeGoutte);
let animGoutte = null;
const NB = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
function cheminEcoulement(i, j) {
  const pts = [[i, j]];
  for (let n = 0; n < 600; n++) {
    const d = D.dir[i * NX + j];
    if (d < 0) break;
    i += NB[d][0]; j += NB[d][1];
    if (i < 0 || i >= NY || j < 0 || j >= NX) break;
    pts.push([i, j]);
  }
  return pts;
}
const OY = Math.round((1 - D.outlet[1]) * (NY - 1));
const OX = Math.round(D.outlet[0] * (NX - 1));

function clicScene(e) {
  const r = cv.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1,
                               -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(terrain, false)[0];
  if (!hit) return;
  const u = clamp(hit.point.x / WM, 0, 1), v = clamp(1 - hit.point.z / HM, 0, 1);
  const j = Math.round(u * (NX - 1)), i = Math.round((1 - v) * (NY - 1));
  const chemin = cheminEcoulement(i, j);
  groupeGoutte.clear();
  const pts = chemin.map(([a, b]) => [wx(b / (NX - 1)), wz(1 - a / (NY - 1))]);
  if (pts.length > 1) {
    const g = ribbon(pts, 230, 60, 900);
    if (g) groupeGoutte.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0xff5a2b, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false
    })));
  }
  const dernier = chemin[chemin.length - 1];
  const ds = [wx(dernier[1] / (NX - 1)), wz(1 - dernier[0] / (NY - 1))];
  const boule = new THREE.Mesh(new THREE.SphereGeometry(340, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x2f7fd0 }));
  boule.position.set(wx(u), TH(wx(u), wz(v)) + 140, wz(v));
  groupeGoutte.add(boule);
  const cible2 = new THREE.Vector3(ds[0], TH(ds[0], ds[1]) + 140, ds[1]);
  animGoutte = { t: 0, de: boule.position.clone(), vers: cible2, boule };
  const dist = chemin.length * M.cell_x / 1000;
  const bassin = (dernier[0] === OY && dernier[1] === OX);
  montrer(bassin
    ? `Cette goutte parcourt ${dist.toFixed(1).replace('.', ',')} km et rejoint l'exutoire : elle tombe bien dans le bassin versant de l'Huveaune.`
    : `Cette goutte sort du bassin au bout de ${dist.toFixed(1).replace('.', ',')} km : elle appartient à un autre bassin versant.`);
  besoin = true;
}

/* =====================================================================
   12 · FRONT DE PLUIE
   ===================================================================== */
const PLUIE_DEB = -0.5, PLUIE_FIN = 12.5;
const NB_GOUTTES_PLUIE = 4200;
const pluie = new THREE.InstancedMesh(
  new THREE.CylinderGeometry(58, 58, 900, 4),
  new THREE.MeshBasicMaterial({ color: 0xd2ecfa, transparent: true, opacity: 0.62, depthWrite: false }),
  NB_GOUTTES_PLUIE
);
pluie.frustumCulled = false;
pluie.renderOrder = 12;
scene.add(pluie);
const pluieItems = [];
for (let k = 0; k < NB_GOUTTES_PLUIE; k++) {
  const px = Math.random() * WM, pz = Math.random() * HM;
  pluieItems.push({
    x: px,
    z: pz,
    y: Math.random() * 9000,
    v: 4200 + Math.random() * 3600,
    s: 0.6 + Math.random() * 0.8,
    /* effet orographique : l'air humide est forcé de s'élever sur le relief,
       il se refroidit et pleut davantage sur les hauteurs que dans la plaine */
    orog: 0.72 + 0.28 * clamp(elevAt(px, pz) / 900, 0, 1)
  });
}
const pluieDummy = new THREE.Object3D();

/* nappe nuageuse */
const nuageTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,.95)');
  grd.addColorStop(0.45, 'rgba(255,255,255,.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const nuage = new THREE.Mesh(
  new THREE.PlaneGeometry(34000, 30000),
  new THREE.MeshBasicMaterial({ map: nuageTex, color: 0x6f8794, transparent: true,
    opacity: 0.30, depthWrite: false })
);
nuage.rotation.x = -Math.PI / 2;
nuage.position.set(WM * 0.5, 6200, HM * 0.5);
nuage.renderOrder = 11;
scene.add(nuage);

/* Sens de l'épisode : l'air marin, chaud et très humide, arrive du large au
   sud-ouest (Marseille) et progresse vers le nord-est, où il bute sur le
   massif de la Sainte-Baume (Saint-Zacharie). Le front est une droite de
   normale n : il balaie le bassin de l'embouchure vers la source.
   n = direction Marseille -> Saint-Zacharie, mesurée sur la polyligne. */
const FRONT_NX = 0.893, FRONT_NZ = -0.451;
const FRONT_LARG = 12000;      /* demi-largeur de la bande de pluie (m) */

/* projection d'un point sur la normale du front */
function frontProj(x, z) { return x * FRONT_NX + z * FRONT_NZ; }

/* bornes du balayage : on part et on arrive juste au-delà des coins de la carte */
const FRONT_S_MIN = Math.min(frontProj(0, 0), frontProj(0, HM),
                             frontProj(WM, 0), frontProj(WM, HM)) - FRONT_LARG;
const FRONT_S_MAX = Math.max(frontProj(0, 0), frontProj(0, HM),
                             frontProj(WM, 0), frontProj(WM, HM)) + FRONT_LARG;

function frontS(t) {
  const p = clamp((t - PLUIE_DEB) / (PLUIE_FIN - PLUIE_DEB), 0, 1);
  return FRONT_S_MIN + p * (FRONT_S_MAX - FRONT_S_MIN);
}

function majPluie(dt) {
  const actif = TEMPS > PLUIE_DEB && TEMPS < PLUIE_FIN && couche.pluie;
  pluie.visible = actif;
  nuage.visible = actif;
  if (!actif) {
    scene.background.copy(CIEL_CLAIR);
    scene.fog.color.copy(CIEL_CLAIR);
    return;
  }
  const sf = frontS(TEMPS);
  const intensite = Math.min(1, Math.min(TEMPS - PLUIE_DEB, PLUIE_FIN - TEMPS) / 1.6);
  for (let k = 0; k < NB_GOUTTES_PLUIE; k++) {
    const it = pluieItems[k];
    it.y -= it.v * dt;
    if (it.y < 0) it.y += 9200;
    const d = Math.abs(frontProj(it.x, it.z) - sf);
    const s = d > FRONT_LARG ? 0 : it.s * it.orog * intensite * (1 - d / FRONT_LARG) * 1.15;
    pluieDummy.position.set(it.x, TH(it.x, it.z) + it.y, it.z);
    pluieDummy.scale.set(s, s, s);
    pluieDummy.updateMatrix();
    pluie.setMatrixAt(k, pluieDummy.matrix);
  }
  pluie.instanceMatrix.needsUpdate = true;
  const sc = frontProj(WM * 0.5, HM * 0.5);
  nuage.position.x = WM * 0.5 + FRONT_NX * (sf - sc);
  nuage.position.z = HM * 0.5 + FRONT_NZ * (sf - sc);
  nuage.material.opacity = 0.30 * intensite;
  scene.background.copy(CIEL_CLAIR).lerp(CIEL_PLUIE, intensite * 0.85);
  scene.fog.color.copy(scene.background);
}

/* =====================================================================
   13 · RUISSELLEMENT SUR LES VERSANTS (suivi du flux D8)
   ===================================================================== */
const inBassin = new Uint8Array(NX * NY);
const longueur = new Uint16Array(NX * NY);
{
  for (let i = 0; i < NY; i++) for (let j = 0; j < NX; j++) {
    let a = i, b = j, n = 0, fini = false;
    for (; n < 500; n++) {
      const d = D.dir[a * NX + b];
      if (d < 0) break;
      a += NB[d][0]; b += NB[d][1];
      if (a < 0 || a >= NY || b < 0 || b >= NX) { fini = true; break; }
      if (a === OY && b === OX) { fini = true; break; }
    }
    inBassin[i * NX + j] = fini ? 1 : 0;
    longueur[i * NX + j] = n;
  }
}

const chemins = [];
{
  /* Deux familles de trajectoires :
     - « versant » : une descente de 24 mailles depuis un point haut, qui s'arrête
       avant le lit (la goutte s'efface en arrivant au ruisseau) ;
     - « long »    : le parcours complet jusqu'à l'exutoire, qui montre l'eau
       gagner le lit puis la mer. */
  const hauts = [], tous = [];
  for (let i = 1; i < NY - 1; i++) for (let j = 1; j < NX - 1; j++) {
    if (!inBassin[i * NX + j]) continue;
    const L = longueur[i * NX + j];
    if (L >= 8 && L <= 260) tous.push([i, j]);
    if (L >= 40) hauts.push([i, j]);
  }
  const melange = t => {
    for (let k = t.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1));
      const tmp = t[k]; t[k] = t[r]; t[r] = tmp;
    }
    return t;
  };
  melange(hauts); melange(tous);
  const vers = (i, j, max) => {
    const ch = cheminEcoulement(i, j).slice(0, max);
    if (ch.length < 4) return;
    chemins.push(ch.map(([a, b]) => [wx(b / (NX - 1)), wz(1 - a / (NY - 1))]));
  };
  hauts.slice(0, 115).forEach(([i, j]) => vers(i, j, 24));
  tous.slice(0, 45).forEach(([i, j]) => vers(i, j, 600));
}

const NB_RUISS = 720;
const ruiss = new THREE.InstancedMesh(
  new THREE.SphereGeometry(175, 7, 5),
  new THREE.MeshBasicMaterial({ color: 0x1e9fd8, transparent: true, opacity: 0.98 }),
  NB_RUISS
);
ruiss.frustumCulled = false;
ruiss.renderOrder = 8;
scene.add(ruiss);
const ruissItems = [];
/* instant où le front de pluie atteint un point donné : le ruissellement ne
   démarre pas partout en même temps, il suit la pluie du large vers le massif.
   L'aval (Marseille) est donc arrosé et ruisselle AVANT l'amont. */
function tFront(x, z) {
  const q = (frontProj(x, z) - FRONT_S_MIN) / (FRONT_S_MAX - FRONT_S_MIN);
  return PLUIE_DEB + clamp(q, 0, 1) * (PLUIE_FIN - PLUIE_DEB);
}
for (let k = 0; k < NB_RUISS; k++) {
  const idx = k % Math.max(1, chemins.length);
  const p = chemins[idx];
  ruissItems.push({
    p,
    t: (k / NB_RUISS) + Math.random() * 0.05,
    v: 0.28 + Math.random() * 0.20,
    retard: tFront(p[0][0], p[0][1]) + Math.random() * 0.6
  });
}
const ruissDummy = new THREE.Object3D();

function majRuissellement(dt) {
  const actif = TEMPS < 12.5 && couche.ruiss && chemins.length > 0;
  ruiss.visible = actif;
  if (!actif) return;
  const fondu = Math.min(1, Math.max(0, Math.min(TEMPS / 0.8, (12.5 - TEMPS) / 1.5)));
  for (let k = 0; k < NB_RUISS; k++) {
    const it = ruissItems[k];
    const demarre = TEMPS > it.retard;
    if (demarre) {
      it.t += it.v * dt;
      if (it.t > 1) {
        it.t -= 1;
        it.p = chemins[Math.floor(Math.random() * chemins.length)];
        it.retard = tFront(it.p[0][0], it.p[0][1]) + Math.random() * 0.6;
      }
    }
    const n = it.p.length;
    const f = clamp(it.t, 0, 0.999) * (n - 1);
    const i0 = Math.floor(f), u = f - i0;
    const a = it.p[i0], b = it.p[Math.min(i0 + 1, n - 1)];
    const x = lerp(a[0], b[0], u), z = lerp(a[1], b[1], u);
    let s = demarre ? 1 : 0;
    if (it.t < 0.06) s *= it.t / 0.06;
    if (it.t > 0.86) s *= Math.max(0, (1 - it.t) / 0.14);
    s *= fondu;
    ruissDummy.position.set(x, TH(x, z) + 120, z);
    ruissDummy.scale.setScalar(s * (0.85 + (k % 5) * 0.06));
    ruissDummy.updateMatrix();
    ruiss.setMatrixAt(k, ruissDummy.matrix);
  }
  ruiss.instanceMatrix.needsUpdate = true;
}

/* =====================================================================
   14 · TEMPS, PHASES, ÉTAT
   ===================================================================== */
let TEMPS = 0;
let joue = false;
let vitesse = 1;
const VITESSES = [1, 2, 4, 8];
const H_PAR_S = 2;          /* à ×1, 2 heures de crue par seconde */

const couche = { pluie: true, ruiss: true, limni: true };

function phase(t) {
  if (t < 2) return 0;
  if (t < 11) return 1;
  if (t < 24) return 2;
  return 3;
}
const TEXTES = [
  "Début de l'épisode pluvieux. L'air marin, très humide, arrive du large : le front de pluie aborde le bassin par l'embouchure, à Marseille, et remonte vers le massif de la Sainte-Baume. Les sols se saturent.",
  "PHASE 1 · RUISSELLEMENT. La pluie a frappé l'embouchure en premier : à Marseille, le béton ne laisse rien s'infiltrer, l'eau ruisselle sur place et la ville monte en quelques heures. Sur les versants, les gouttes bleues rejoignent le lit. L'onde de crue est produite LOCALEMENT — voilà pourquoi l'aval monte AVANT l'amont.",
  "PHASE 2 · VIDANGE KARSTIQUE. Le ruissellement faiblit, mais les calcaires du massif de la Sainte-Baume se vident massivement. Une onde puissante part de la SOURCE, à St-Zacharie, et descend vers la mer : le pic se déplace vers l'aval, station après station.",
  "DÉCRUE. L'onde née du karst a fini de descendre : c'est maintenant l'aval, à Marseille, qui porte encore la plus grande hauteur d'eau, alors que l'amont est presque revenu à son niveau de base. Le karst se comporte comme un réservoir à retardement : il a décalé la crue de plusieurs heures."
];
const PHASES_NOM = ['Début', 'Phase 1 · Ruissellement', 'Phase 2 · Vidange karstique', 'Décrue'];

/* =====================================================================
   15 · LIMNIGRAMMES
   ===================================================================== */
const chartCv = document.getElementById('chart');
let chartW = 340, chartH = 196;

function tailleChart() {
  const w = chartCv.clientWidth, h = chartCv.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(devicePixelRatio, 2);
  chartW = w; chartH = h;
  chartCv.width = Math.round(w * dpr);
  chartCv.height = Math.round(h * dpr);
  const g = chartCv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* dessin générique — sert au panneau et à l'onglet Activités */
function dessineLimni(g, W, H, opts) {
  const o = opts || {};
  const mL = 38, mR = 10, mT = 20, mB = 28;
  const pw = W - mL - mR, ph = H - mT - mB;
  const X = t => mL + t / TOTAL_H * pw;
  const Y = v => mT + ph - clamp(v / NIVEAU_MAX, 0, 1) * ph;

  g.clearRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);

  /* bandes de phase */
  g.fillStyle = 'rgba(56,189,248,.09)'; g.fillRect(X(0), mT, X(11) - X(0), ph);
  g.fillStyle = 'rgba(99,102,241,.09)'; g.fillRect(X(11), mT, X(24) - X(11), ph);
  g.fillStyle = 'rgba(192,138,30,.07)'; g.fillRect(X(24), mT, X(48) - X(24), ph);

  /* grille */
  g.strokeStyle = '#ece5d5'; g.lineWidth = 1;
  g.font = '9.5px "Segoe UI",sans-serif';
  g.fillStyle = '#9c9078';
  for (let v = 0; v <= NIVEAU_MAX; v += 0.5) {
    const y = Y(v);
    g.beginPath(); g.moveTo(mL, y); g.lineTo(W - mR, y); g.stroke();
    g.textAlign = 'right';
    g.fillText(v.toFixed(1).replace('.', ','), mL - 5, y + 3);
  }
  g.textAlign = 'center';
  for (let t = 0; t <= TOTAL_H; t += 6) {
    const x = X(t);
    g.beginPath(); g.moveTo(x, mT); g.lineTo(x, mT + ph); g.stroke();
    if (t % 12 === 0) g.fillText(t + ' h', x, H - 10);
  }
  g.textAlign = 'left';

  /* repères de phase */
  g.strokeStyle = 'rgba(43,38,32,.18)'; g.setLineDash([3, 3]);
  [11, 24].forEach(t => {
    g.beginPath(); g.moveTo(X(t), mT); g.lineTo(X(t), mT + ph); g.stroke();
  });
  g.setLineDash([]);

  /* courbes */
  STATIONS.forEach(st => {
    g.beginPath();
    SIM.forEach((d, i) => {
      const x = X(d.t), y = Y(d[st.key]);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = st.color;
    g.lineWidth = st.key === 'stZacharie' ? 2.4 : 1.9;
    g.lineJoin = 'round';
    g.stroke();
  });

  /* curseur */
  if (o.curseur) {
    const x = X(TEMPS);
    g.strokeStyle = '#d1462f'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x, mT); g.lineTo(x, mT + ph); g.stroke();
    const n = simAt(TEMPS);
    STATIONS.forEach(st => {
      g.beginPath();
      g.arc(x, Y(n[st.key]), 3.4, 0, 7);
      g.fillStyle = '#fff'; g.fill();
      g.lineWidth = 2; g.strokeStyle = st.color; g.stroke();
    });
  }

  /* titres des axes */
  g.fillStyle = '#8a7c63'; g.font = '9px "Segoe UI",sans-serif';
  g.textAlign = 'left';
  g.fillText('m', 4, mT + 2);
  g.textAlign = 'left';
}

/* =====================================================================
   16 · INTERFACE : état, transport, panneau
   ===================================================================== */
const el = id => document.getElementById(id);
const phaseBar = el('phaseBar'), horloge = el('horloge'), jourHeure = el('jourHeure');
const analyse = el('analyse'), tTxt = el('tTxt'), tPhase = el('tPhase');
const fait = el('fait'), tete = el('tete'), seek = el('seek');
const btnPlay = el('btnPlay'), btnReset = el('btnReset'), btnVitesse = el('btnVitesse');

/* puces de légende + tableau des niveaux */
STATIONS.forEach(st => {
  const d = document.createElement('div');
  d.className = 'puce';
  d.innerHTML = `<i style="background:${st.color}"></i>${st.nom}`;
  el('puces').appendChild(d);

  const tr = document.createElement('tr');
  tr.innerHTML = `<td class="nom"><i style="background:${st.color}"></i>${st.nom}</td>
    <td class="val"><b data-v="${st.key}">0,30</b> m</td>
    <td class="bar"><div class="jauge"><i data-j="${st.key}" style="background:${st.color}"></i></div></td>`;
  el('tabNiveaux').appendChild(tr);
});

function majInterface() {
  const p = phase(TEMPS);
  phaseBar.textContent = PHASES_NOM[p];
  phaseBar.className = 'phasebar' + (p === 2 ? ' p2' : p === 3 ? ' p3' : '');
  analyse.innerHTML = TEXTES[p];

  horloge.textContent = 'T + ' + TEMPS.toFixed(1).replace('.', ',') + ' h';
  const jour = Math.floor(TEMPS / 24) + 1;
  const hh = Math.floor(TEMPS % 24), mm = Math.round((TEMPS % 1) * 60);
  jourHeure.textContent = `Jour ${jour} · ${String(hh).padStart(2, '0')} h ${String(mm).padStart(2, '0')}`;

  tTxt.textContent = 'T + ' + TEMPS.toFixed(1).replace('.', ',') + ' h';
  tPhase.textContent = PHASES_NOM[p];
  const pc = TEMPS / TOTAL_H * 100;
  fait.style.width = pc + '%';
  tete.style.left = pc + '%';
  if (Math.abs(seek.value - TEMPS) > 0.05) seek.value = TEMPS;

  const n = simAt(TEMPS);
  STATIONS.forEach(st => {
    const v = n[st.key];
    const c = document.querySelector(`[data-v="${st.key}"]`);
    if (c) c.textContent = v.toFixed(2).replace('.', ',');
    const j = document.querySelector(`[data-j="${st.key}"]`);
    if (j) j.style.width = clamp(v / NIVEAU_MAX, 0, 1) * 100 + '%';
  });
}

function majLimnis() {
  const n = simAt(TEMPS);
  limnis.forEach(l => {
    const v = n[l.st.key];
    const h = clamp(v / NIVEAU_MAX, 0, 1) * (GAUGE_H - 120);
    l.eau.scale.y = Math.max(0.5, h);
    l.eau.position.y = 90 + h / 2;
    l.flt.position.y = 90 + h;
    l.flt.material.color.set(v > 1.4 ? 0xd1462f : 0xffffff);
  });
}

/* étiquettes de stations : redessinées ~12 fois par seconde */
let dernierDessin = 0;
function majEtiqStations(force) {
  const n = simAt(TEMPS);
  const t = performance.now();
  if (!force && t - dernierDessin < 80) return;
  dernierDessin = t;
  etiqStations.forEach(e => {
    const v = Math.round(n[e.st.key] * 100) / 100;
    if (v !== e.dernier || force) {
      e.dernier = v;
      dessineEtiqStation(e, v);
    }
  });
}

/* =====================================================================
   17 · BOUCLE DE RENDU
   ===================================================================== */
let besoin = true;
function taille() {
  const w = cv.clientWidth || 800, h = cv.clientHeight || 600;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  besoin = true;
}
window.addEventListener('resize', () => { taille(); tailleChart(); dessinerProfil(); besoin = true; });

const vScreen = new THREE.Vector3();
function etiquettes() {
  const W2 = cv.clientWidth, H2 = cv.clientHeight;
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const tanF = Math.tan(camera.fov * Math.PI / 360);
  const boites = [];
  const noms = el('c-noms').checked;
  const tri = labels.slice().sort((a, b) => b.userData.prio - a.userData.prio);
  for (const sp of tri) {
    sp.visible = false;
    if (!noms) continue;
    if (sp.userData.station && !couche.limni) continue;
    vScreen.copy(sp.userData.base).project(camera);
    if (!(vScreen.z < 1 && Math.abs(vScreen.x) < 1.06 && Math.abs(vScreen.y) < 1.06)) continue;
    const d = camera.position.distanceTo(sp.userData.base);
    const mpp = 2 * d * tanF / H2;
    const plaquePx = 15 * sp.userData.h / sp.userData.fs;
    const hWorld = plaquePx * mpp;
    sp.scale.set(hWorld * sp.userData.w / sp.userData.h, hWorld, 1);
    const wpx = plaquePx * sp.userData.w / sp.userData.h, hpx = plaquePx;
    const cx = (vScreen.x * .5 + .5) * W2, cy = (-vScreen.y * .5 + .5) * H2;
    /* dy est un décalage en PIXELS ÉCRAN (y vers le bas) ; l'axe Y du monde
       va vers le haut : il faut donc retrancher, sinon l'étiquette se pose
       exactement là où le test de collision vient de la refuser. */
    for (let k = 0; k < 7; k++) {
      const dy = (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2)) * (hpx + 5);
      const b = { x0: cx - wpx / 2 - 4, x1: cx + wpx / 2 + 4,
                  y0: cy - hpx / 2 + dy - 4, y1: cy + hpx / 2 + dy + 4 };
      if (b.y0 < 4 || b.y1 > H2 - 4 || b.x0 < 4 || b.x1 > W2 - 4) continue;
      if (boites.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)) continue;
      boites.push(b);
      sp.position.copy(sp.userData.base);
      sp.position.y -= dy * mpp;
      sp.visible = true;
      break;
    }
  }
}

function echelle() {
  const d = camera.position.distanceTo(cam.target);
  const mpp = 2 * d * Math.tan(camera.fov * Math.PI / 360) / cv.clientHeight;
  const cibles = [1, 2, 5, 10, 20, 50];
  const km = cibles.reduce((a, b) => Math.abs(b * 1000 / mpp - 110) < Math.abs(a * 1000 / mpp - 110) ? b : a, 10);
  const px = km * 1000 / mpp;
  const e = el('echelle');
  e.querySelector('i').style.width = px.toFixed(0) + 'px';
  e.querySelector('span').textContent = km + ' km';
}

/* la boussole suit l'azimut de la caméra */
const aiguille = document.getElementById('aiguille');
function majBoussole() {
  const a = Math.atan2(Math.cos(cam.theta), Math.sin(cam.theta)) * 180 / Math.PI;
  aiguille.setAttribute('transform', 'rotate(' + a.toFixed(1) + ' 50 50)');
}

let dernier = performance.now();
let compteur = 0;
function boucle() {
  requestAnimationFrame(boucle);
  const t = performance.now();
  const dt = Math.min(0.06, (t - dernier) / 1000);
  dernier = t;

  if (joue) {
    TEMPS += dt * H_PAR_S * vitesse;
    if (TEMPS >= TOTAL_H) { TEMPS = TOTAL_H; setJoue(false); }
    majInterface();
    majLimnis();
    majEau();
    majEtiqStations(false);
    dessineLimni(chartCv.getContext('2d'), chartW, chartH, { curseur: true });
    besoin = true;
  }

  majVol();
  flowTex.offset.x -= dt * 0.055;
  eauTex.offset.x -= dt * 0.030;

  majPluie(dt);
  majRuissellement(dt);

  if (animGoutte) {
    animGoutte.t = Math.min(1, animGoutte.t + dt / 1.6);
    animGoutte.boule.position.lerpVectors(animGoutte.de, animGoutte.vers, animGoutte.t);
    if (animGoutte.t >= 1) animGoutte = null;
    besoin = true;
  }

  if (besoin) {
    appliquerCamera();
    etiquettes();
    echelle();
    majBoussole();
    renderer.render(scene, camera);
    besoin = false;
  }
}

/* =====================================================================
   18 · CONTRÔLES DE TEMPS
   ===================================================================== */
function setJoue(v) {
  joue = v;
  btnPlay.textContent = v ? '❚❚ Pause' : '▶ Lecture';
  btnPlay.classList.toggle('joue', v);
  if (v && TEMPS >= TOTAL_H) { TEMPS = 0; }
  besoin = true;
}
btnPlay.addEventListener('click', () => setJoue(!joue));
btnReset.addEventListener('click', () => {
  setJoue(false); TEMPS = 0;
  majInterface(); majLimnis(); majEau(); majEtiqStations(true);
  dessineLimni(chartCv.getContext('2d'), chartW, chartH, { curseur: true });
  besoin = true;
});
btnVitesse.addEventListener('click', () => {
  const i = (VITESSES.indexOf(vitesse) + 1) % VITESSES.length;
  vitesse = VITESSES[i];
  btnVitesse.textContent = vitesse + '×';
});
seek.addEventListener('input', e => {
  TEMPS = parseFloat(e.target.value);
  majInterface(); majLimnis(); majEau(); majEtiqStations(true);
  dessineLimni(chartCv.getContext('2d'), chartW, chartH, { curseur: true });
  besoin = true;
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey) return;
  if (!document.getElementById('vue-simu').classList.contains('actif')) return;
  if (e.key === ' ') { e.preventDefault(); setJoue(!joue); }
  if (e.key === '1') VUES.ensemble();
  if (e.key === '2') VUES.dessus();
  if (e.key === '3') VUES.amont();
  if (e.key === '4') VUES.embouchure();
});

/* =====================================================================
   19 · POINTS DE VUE
   ===================================================================== */
function cibleStation(key, dy) {
  const st = STATIONS.find(s => s.key === key);
  return new THREE.Vector3(st.x, TH(st.x, st.z) + (dy || 0), st.z);
}
const VUES = {
  ensemble: () => volVers(1.62, 0.70, WM * 1.12, new THREE.Vector3(WM * 0.5, 200, HM * 0.54)),
  dessus: () => volVers(Math.PI / 2, 0.02, WM * 1.38, new THREE.Vector3(WM * 0.5, 0, HM * 0.5)),
  amont: () => volVers(2.10, 0.92, WM * 0.40, cibleStation('stZacharie', 500)),
  embouchure: () => volVers(3.05, 0.95, WM * 0.34, cibleStation('marseille', 400))
};
document.querySelectorAll('[data-cam]').forEach(b => b.addEventListener('click', () => {
  VUES[b.dataset.cam]();
  montrer(b.dataset.cam === 'dessus' ? 'Vue du dessus : le bassin apparaît comme une tache, limité par la ligne de partage des eaux.' :
    b.dataset.cam === 'amont' ? 'L\'amont : Saint-Zacharie, au pied de la Sainte-Baume. C\'est ici que sort l\'eau du karst.' :
    b.dataset.cam === 'embouchure' ? 'L\'aval : Marseille et l\'embouchure, à 0 m d\'altitude.' :
    'Vue d\'ensemble : le relief, le réseau hydrographique et la limite du bassin.', 4200);
}));

/* =====================================================================
   20 · COUCHES, EXAGÉRATION
   ===================================================================== */
el('c-relief').addEventListener('change', e => { terrain.visible = e.target.checked; besoin = true; });
el('c-bassin').addEventListener('change', e => { groupeBassin.visible = e.target.checked; besoin = true; });
el('c-eau').addEventListener('change', e => { groupeEau.visible = e.target.checked; besoin = true; });
el('c-noms').addEventListener('change', () => besoin = true);
el('c-pluie').addEventListener('change', e => { couche.pluie = e.target.checked; besoin = true; });
el('c-ruiss').addEventListener('change', e => { couche.ruiss = e.target.checked; besoin = true; });
el('c-limni').addEventListener('change', e => { couche.limni = e.target.checked; groupeLimni.visible = e.target.checked; besoin = true; });
el('c-qgis').addEventListener('change', e => {
  if (qgisMesh) { qgisMesh.visible = e.target.checked; besoin = true; }
  else montrer('Le fond de carte QGIS est encore en cours de chargement.');
});

function recalcHauteurs() {
  for (let k = 0; k < NV; k++) eauBaseY[k] = TH(HUV_PTS[k][0], HUV_PTS[k][1]);
  limnis.forEach(l => { l.g.position.y = TH(l.st.x, l.st.z); });
  STATIONS.forEach(st => {
    st.sprite.userData.base.set(st.x, TH(st.x, st.z) + GAUGE_H + 900, st.z);
  });
  labels.forEach(sp => {
    if (sp.userData.station) return;
    const b = sp.userData.base;
    b.y = TH(b.x, b.z) + 60;
  });
  majEau();
}

el('exag').addEventListener('input', e => {
  EXAG = parseFloat(e.target.value);
  el('exagVal').textContent = '×' + EXAG.toFixed(1).replace('.', ',');
  const pos = terrainGeo.attributes.position.array;
  for (let i = 0; i < NY; i++) for (let j = 0; j < NX; j++) {
    pos[(i * NX + j) * 3 + 1] = cellElev(i, j) * EXAG;
  }
  terrainGeo.attributes.position.needsUpdate = true;
  terrainGeo.computeVertexNormals();
  paintTerrain();
  construireSocle();
  if (qgisMesh) {
    qgisMesh.geometry.attributes.position.copy(terrainGeo.attributes.position);
    qgisMesh.geometry.attributes.position.needsUpdate = true;
    qgisMesh.geometry.computeVertexNormals();
  }
  recalcHauteurs();
  besoin = true;
});

/* =====================================================================
   21 · MESSAGE
   ===================================================================== */
function montrer(txt, ms = 5200) {
  const m = el('msg');
  m.textContent = txt; m.classList.add('on');
  clearTimeout(m._t); m._t = setTimeout(() => m.classList.remove('on'), ms);
}

/* =====================================================================
   22 · ONGLETS
   ===================================================================== */
document.querySelectorAll('#onglets button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#onglets button').forEach(x => x.setAttribute('aria-selected', x === b));
  document.querySelectorAll('section.vue').forEach(s => s.classList.toggle('actif', s.id === 'vue-' + b.dataset.vue));
  const simu = b.dataset.vue === 'simu';
  document.body.classList.toggle('mode-simu', simu);
  if (simu) { taille(); besoin = true; }
  if (b.dataset.vue === 'activites') { dessinerCarteActivite(); dessinerAct3(); }
  if (b.dataset.vue === 'bassin') dessinerProfil();
}));

/* =====================================================================
   23 · PROFIL EN LONG
   ===================================================================== */
const profCv = el('profilCv');
function dessinerProfil() {
  if (!profCv || !profCv.clientWidth) return;
  const seg = HUV_SEG;
  const brut = seg.map(p => elevAt(wx(p[0]), wz(p[1])));
  const n = brut.length;
  const liss = brut.map((_, k) => {
    let s = 0, c = 0;
    for (let q = Math.max(0, k - 3); q <= Math.min(n - 1, k + 3); q++) { s += brut[q]; c++; }
    return s / c;
  });
  const pts = seg.map((p, k) => ({ x: wx(p[0]), z: wz(p[1]), h: liss[k], km: HUV_KM[k] }));
  if (pts[0].h < pts[pts.length - 1].h) pts.reverse();
  const total = pts[pts.length - 1].km - pts[0].km;

  const dpr = Math.min(devicePixelRatio, 2);
  const W2 = profCv.clientWidth, H2 = profCv.clientHeight;
  profCv.width = Math.round(W2 * dpr); profCv.height = Math.round(H2 * dpr);
  const g = profCv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W2, H2);

  const mL = 50, mR = 20, mT = 24, mB = 26;
  const pw = W2 - mL - mR, ph = H2 - mT - mB;
  const hMaxPts = pts.reduce((m, p) => Math.max(m, p.h), 0);
  const hmax = Math.max(200, Math.ceil(hMaxPts / 200) * 200);
  const X = km => mL + (km - pts[0].km) / total * pw;
  const Y = h => mT + ph - clamp(h / hmax, 0, 1) * ph;

  g.strokeStyle = '#e2d8c4'; g.lineWidth = 1;
  g.font = '10px "Segoe UI",sans-serif'; g.fillStyle = '#8a7c63';
  for (let h = 0; h <= hmax; h += 200) {
    g.beginPath(); g.moveTo(mL, Y(h)); g.lineTo(W2 - mR, Y(h)); g.stroke();
    g.textAlign = 'right';
    g.fillText(h + ' m', mL - 6, Y(h) + 3);
  }
  g.textAlign = 'center';
  for (let d = 0; d <= total; d += 10) {
    const x = X(d);
    g.beginPath(); g.moveTo(x, mT); g.lineTo(x, mT + ph); g.stroke();
    g.fillText(d + ' km', x, H2 - 8);
  }
  g.textAlign = 'left';

  g.beginPath(); g.moveTo(X(pts[0].km), mT + ph);
  pts.forEach(p => g.lineTo(X(p.km), Y(p.h)));
  g.lineTo(X(pts[pts.length - 1].km), mT + ph); g.closePath();
  const grd = g.createLinearGradient(0, mT, 0, mT + ph);
  grd.addColorStop(0, 'rgba(150,166,120,.75)');
  grd.addColorStop(1, 'rgba(150,166,120,.18)');
  g.fillStyle = grd; g.fill();

  g.beginPath();
  pts.forEach((p, k) => k ? g.lineTo(X(p.km), Y(p.h)) : g.moveTo(X(p.km), Y(p.h)));
  g.strokeStyle = '#17607d'; g.lineWidth = 2.2; g.stroke();

  /* les quatre stations sur le profil */
  g.font = '600 10.5px "Segoe UI",sans-serif';
  STATIONS.forEach(st => {
    const x = X(st.km);
    const h = elevAt(wx(HUV_SEG[st.idx][0]), wz(HUV_SEG[st.idx][1]));
    const y = Y(h);
    g.beginPath(); g.arc(x, y, 4, 0, 7);
    g.fillStyle = st.color; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = '#453e34';
    g.textAlign = x > W2 - 80 ? 'right' : 'center';
    g.fillText(st.nom, x, y - 11);
    g.textAlign = 'left';
  });

  g.fillStyle = '#2b2620'; g.font = '600 11px "Segoe UI",sans-serif';
  g.fillText('Profil en long de l\'Huveaune — ' + total.toFixed(1).replace('.', ',') + ' km', mL + 2, 13);
}

/* =====================================================================
   24 · ACTIVITÉ 1 : où va l'eau ?
   ===================================================================== */
const POINTS_ACT = [
  { i: 30, j: 92, nom: 'A' }, { i: 55, j: 60, nom: 'B' },
  { i: 20, j: 30, nom: 'C' }, { i: 75, j: 100, nom: 'D' },
  { i: 45, j: 115, nom: 'E' }, { i: 82, j: 25, nom: 'F' }
];
function dessinerCarteActivite() {
  const cv3 = el('cvActivite');
  if (!cv3 || !cv3.clientWidth) return;
  const g = cv3.getContext('2d');
  const W3 = cv3.width, H3 = cv3.height;
  g.clearRect(0, 0, W3, H3);
  g.fillStyle = '#fffdf7'; g.fillRect(0, 0, W3, H3);
  const X = u => 20 + u * (W3 - 40), Y = v => H3 - 24 - v * (H3 - 48);
  for (let i = 0; i < NY; i += 1) for (let j = 0; j < NX; j += 1) {
    const h = cellElev(i, j);
    const c = rampColor(h);
    const gx = -(cellElev(i, Math.min(j + 1, NX - 1)) - cellElev(i, Math.max(j - 1, 0))) * 2.2;
    const gz = -(cellElev(Math.min(i + 1, NY - 1), j) - cellElev(Math.max(i - 1, 0), j)) * 2.2;
    const nl = Math.hypot(gx, M.cell_x, gz);
    const lam = clamp((gx * -0.62 + M.cell_x * 0.70 + gz * -0.35) / nl, 0, 1);
    const om = 0.62 + 0.62 * Math.pow(lam, 1.1);
    g.fillStyle = `rgb(${Math.min(255, (c[0] * 255 * om)) | 0},${Math.min(255, (c[1] * 255 * om)) | 0},${Math.min(255, (c[2] * 255 * om)) | 0})`;
    g.fillRect(X(j / (NX - 1)) - 1, Y(1 - i / (NY - 1)) - 1,
      (W3 - 40) / NX + 1.4, (H3 - 48) / NY + 1.4);
  }
  g.beginPath();
  D.basin.forEach((p, k) => k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
  g.closePath();
  g.strokeStyle = '#f0a500'; g.lineWidth = 2; g.stroke();
  g.fillStyle = 'rgba(240,165,0,.10)'; g.fill();
  D.rivers.forEach(r => {
    g.strokeStyle = r.km > 8 ? '#17607d' : '#6aa9c2';
    g.lineWidth = r.km > 8 ? 2 : 1;
    r.segs.forEach(s => {
      g.beginPath();
      s.forEach((p, k) => k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
      g.stroke();
    });
  });
  POINTS_ACT.forEach(p => {
    const x = X(p.j / (NX - 1)), y = Y(1 - p.i / (NY - 1));
    g.beginPath(); g.arc(x, y, 12, 0, 7);
    g.fillStyle = '#fffdf7'; g.fill(); g.strokeStyle = '#a8611f'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#a8611f'; g.font = '600 14px Georgia,serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(p.nom, x, y + 1);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  });
}
{
  const box = el('act1');
  POINTS_ACT.forEach(p => {
    const d = document.createElement('div');
    d.className = 'q'; d.style.padding = '10px 12px'; d.style.marginBottom = '8px';
    d.innerHTML = `<p class="enonce" style="margin-bottom:6px">Point ${p.nom}</p>
      <label><input type="radio" name="pt${p.nom}" value="oui"> rejoint l'Huveaune et la mer</label>
      <label><input type="radio" name="pt${p.nom}" value="non"> part vers un autre bassin</label>
      <div class="rep" data-q="pt${p.nom}"></div>`;
    box.appendChild(d);
  });
}
el('btnAct1').addEventListener('click', () => {
  let bon = 0;
  POINTS_ACT.forEach(p => {
    const ch = cheminEcoulement(p.i, p.j);
    const fin = ch[ch.length - 1];
    const oui = fin[0] === OY && fin[1] === OX;
    const rep = document.querySelector(`[data-q="pt${p.nom}"]`);
    const choix = document.querySelector(`input[name="pt${p.nom}"]:checked`);
    const km = (ch.length * M.cell_x / 1000).toFixed(1).replace('.', ',');
    rep.className = 'rep ' + (choix && ((choix.value === 'oui') === oui) ? 'bon' : 'mauvais');
    rep.textContent = oui
      ? `L'eau de ce point rejoint l'exutoire après ${km} km : elle est bien dans le bassin.`
      : `L'eau de ce point quitte le bassin au bout de ${km} km : elle part vers un autre exutoire.`;
    if (choix && ((choix.value === 'oui') === oui)) bon++;
  });
  el('score1').textContent = `${bon} / ${POINTS_ACT.length} réponses justes.`;
});

/* =====================================================================
   25 · QCM
   ===================================================================== */
const REPONSES = {
  p1: { ok: 'c', txt: 'Environ 470 m : c\'est l\'altitude du point de départ du tracé sur le MNT, un peu en aval de la source réelle (vers 600 m, au pied de la Sainte-Baume).' },
  p2: { ok: 'a', txt: 'Entre Saint-Zacharie et Auriol : le profil y descend le plus vite, c\'est le secteur de la clue.' },
  p3: { ok: 'b', txt: 'La ligne de partage des eaux suit les crêtes ; elle sépare deux bassins voisins.' },
  p4: { ok: 'a', txt: 'Vers T + 6 h : c\'est le pic de ruissellement. La pluie tombée sur la ville rejoint le lit presque aussitôt.' },
  p5: { ok: 'b', txt: 'Parce que l\'eau ruisselle là où la pluie tombe. En aval, la ville est imperméabilisée : la réponse est immédiate. En amont, l\'eau doit d\'abord traverser le karst.' },
  p6: { ok: 'a', txt: 'L\'aquifère calcaire se vidange : une onde part de la source (St-Zacharie) vers T + 16 h, puis descend vers la mer jusqu\'à T + 21 h.' }
};
function verifier(prefixes) {
  let bon = 0, n = 0;
  prefixes.forEach(k => {
    const sel = document.querySelector(`input[name="${k}"]:checked`);
    const rep = document.querySelector(`[data-q="${k}"]`);
    if (!rep) return;
    const ok = sel && sel.value === REPONSES[k].ok;
    rep.className = 'rep ' + (ok ? 'bon' : 'mauvais');
    rep.textContent = (ok ? '✓ ' : '✗ ') + REPONSES[k].txt;
    n++; if (ok) bon++;
  });
  if (n) montrer(`${bon} / ${n} réponses justes.`, 2600);
}
el('btnAct2').addEventListener('click', () => verifier(['p1', 'p2']));
el('btnAct3').addEventListener('click', () => verifier(['p4', 'p5', 'p6']));
el('btnAct4').addEventListener('click', () => verifier(['p3']));

function dessinerAct3() {
  const c = el('cvAct3');
  if (!c || !c.clientWidth) return;
  const dpr = Math.min(devicePixelRatio, 2);
  const w = c.clientWidth, h = 300;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  c.style.height = h + 'px';
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  dessineLimni(g, w, h, { curseur: false });
}

/* =====================================================================
   26 · BILAN
   ===================================================================== */
const BILAN = [
  ['Définis un bassin versant en une phrase.', 'Un territoire dont toutes les eaux de ruissellement rejoignent le même exutoire.'],
  ['Qu\'est-ce qu\'une ligne de partage des eaux ? Où passe-t-elle ?', 'La limite entre deux bassins versants ; elle suit les crêtes et les points hauts.'],
  ['Pourquoi l\'Huveaune coule-t-elle vers l\'ouest et le sud ?', 'Parce que le relief du bassin est plus haut à l\'est (Sainte-Baume) : l\'eau descend la pente générale vers la mer.'],
  ['Quels sont les deux temps de la crue de l\'Huveaune ?', 'D\'abord le ruissellement de surface (rapide, local, pic vers T + 6 à T + 9 h), puis la vidange du karst (lent, depuis l\'amont, pic vers T + 16 à T + 21 h).'],
  ['Pourquoi Marseille monte-t-elle avant Saint-Zacharie ?', 'Parce que l\'eau qui ruisselle sur la ville rejoint le lit immédiatement, alors que l\'eau de l\'amont doit d\'abord s\'infiltrer dans les calcaires et ressortir à la source.'],
  ['Qu\'est-ce qu\'un limnigramme ?', 'Un graphique qui donne la hauteur d\'eau d\'une station en fonction du temps.'],
  ['Pourquoi la maquette exagère-t-elle les hauteurs ?', 'Parce que le relief réel est très faible à l\'échelle de 44 km, et qu\'une crue de 1,50 m serait invisible.'],
  ['Quelle est la limite principale de ce modèle ?', 'La maille du MNT (352 m) et la reconstitution des courbes : le modèle explique, il ne prévoit pas.']
];
{
  const b = el('bilan');
  BILAN.forEach((q, k) => {
    const d = document.createElement('div');
    d.className = 'q';
    d.innerHTML = `<p class="enonce">${k + 1}. ${q[0]}</p><div class="rep" id="repB${k}">${q[1]}</div>`;
    b.appendChild(d);
  });
}
el('btnBilan').addEventListener('click', () => {
  const v = el('codeBilan').value.trim();
  if (v === '2027') {
    BILAN.forEach((q, k) => el('repB' + k).classList.add('bon'));
    el('errBilan').textContent = '';
  } else {
    el('errBilan').textContent = 'Code incorrect.';
  }
});

/* tableau des cours d'eau + réponses (fiche prof) */
{
  const t = el('tabRivieres');
  D.rivers.slice(0, 9).forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.name}</td><td class="num">${r.km.toFixed(1).replace('.', ',')} km</td>`;
    t.appendChild(tr);
  });
  const t2 = el('tabReponses');
  [['Activité 1', 'A et B : oui · C, D, E, F : non'],
   ['Activité 2a', 'environ 470 m'],
   ['Activité 2b', 'Saint-Zacharie → Auriol'],
   ['Activité 3a', 'vers T + 6 h (Marseille)'],
   ['Activité 3b', 'ruissellement local, pas remontée d\'eau'],
   ['Activité 3c', 'vidange karstique depuis l\'amont'],
   ['Activité 4', 'ligne de partage des eaux']].forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r[0]}</td><td>${r[1]}</td>`;
    t2.appendChild(tr);
  });
}

/* =====================================================================
   27 · DÉMARRAGE
   ===================================================================== */
window.__dbg = {
  THREE, scene, renderer, camera, terrain, groupeEau, groupeBassin, groupeNoms, groupeLimni,
  labels, TH, elevAt, cam, D, STATIONS, SIM, limnis, chemins,
  get TEMPS() { return TEMPS; },
  set TEMPS(v) {
    TEMPS = v; majInterface(); majLimnis(); majEau(); majEtiqStations(true); besoin = true;
  },
  get EXAG() { return EXAG; },
  get appels() { return renderer.info.render.calls; },
  setJoue, majEau, majLimnis, dessineLimni, dessinerProfil, dessinerAct3, etiqStations
};

taille();
construireSocle();
appliquerCamera();
tailleChart();
recalcHauteurs();
majInterface();
majLimnis();
majEtiqStations(true);
majEau();
dessineLimni(chartCv.getContext('2d'), chartW, chartH, { curseur: true });
boucle();
setTimeout(() => montrer('Fais glisser pour tourner, molette pour zoomer. Lance la lecture pour voir la pluie balayer le bassin, puis la crue descendre l\'Huveaune.', 6500), 800);
