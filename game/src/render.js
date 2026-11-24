// SOLMAR HEAT — true 3D rendering with the vendored three.js (r152, local
// file game/vendor/three.min.js, global THREE — nothing loads over the
// network). The 2D world logic never changes: every entity still lives in
// 2D world pixels (64x64 tiles x 32 px); this module maps those pixels into
// 3D (1 px = 0.1 units, map centre at the origin) and renders the city as
// low-poly boxes with flat-shaded materials: buildings, roads, neon signs,
// streetlights, cars, pedestrians, the police helicopter and the objective
// beacon. The HUD, minimap and menus stay 2D on the overlay canvas
// (hud.js); this module owns the WebGL canvas only.
//
// Night look: a cool night-dominant day/night cycle — deep blue fog, teal
// moonlight, warm neon signs and headlights. The night is the identity of
// this game; the cycle passes through dusk and dawn but never sits in
// bright daylight for long.
import { TILE, MAP_W, MAP_H, T, SCALE3D, HALF3D, pxTo3X, pxTo3Z, DISTRICTS, RACE } from './config.js';
import { chaseDist, chaseHeight } from './camera.js';
import { carShape } from './vehicles.js';
import { furniture3D, ROOM_PX_W, ROOM_PX_H } from './interior.js';

const ROAD_AT = [8, 16, 24, 32, 40, 48, 56];
const ARTERIAL = new Set([8, 24, 40, 56]);

let R = null; // three.js runtime state, created once by init3D

// Texture anisotropy cap (set in init3D from the GPU's limit): sharper
// sign/moon/star textures at glancing angles, for the HD pass.
let _aniso = 1;

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 1000) / 1000;
}

// The full day/night cycle — dynamic, always running while the game
// plays (the clock advances 24h every DAY_LENGTH seconds). Night is
// dominant and the story opens in it, but dawn and dusk genuinely happen
// and the day is golden hour, never flat bright noon: the light factor
// caps at 0.72, so even midday reads warm and low, like late afternoon.
//   night 19:00-06:00 (0.12) · dawn 06:00-09:00 (ramp to 0.72)
//   day   09:00-16:00 (0.72, golden hour) · dusk 16:00-19:00 (ramp down)
export function phaseAt(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m >= 1140 || m < 360) return 'night';
  if (m < 540) return 'dawn';
  if (m < 960) return 'day';
  return 'dusk';
}

export function lightFactor(game) {
  const m = game.time % 1440;
  if (m >= 1140 || m < 360) return 0.12;
  if (m < 540) return 0.12 + ((m - 360) / 180) * 0.6;
  if (m < 960) return 0.72;
  return 0.72 - ((m - 960) / 180) * 0.6;
}

function lerpColor(a, b, t) {
  // Accepts '#rrggbb' strings or 0xrrggbb numbers; returns a 0xrrggbb number.
  const ca = typeof a === 'string' ? parseInt(a.slice(1), 16) : a;
  const cb = typeof b === 'string' ? parseInt(b.slice(1), 16) : b;
  const r = Math.round(((ca >> 16) & 255) + (((cb >> 16) & 255) - ((ca >> 16) & 255)) * t);
  const g = Math.round(((ca >> 8) & 255) + (((cb >> 8) & 255) - ((ca >> 8) & 255)) * t);
  const bl = Math.round((ca & 255) + ((cb & 255) - (ca & 255)) * t);
  return (r << 16) | (g << 8) | bl;
}

const matCache = new Map();
function lambert(color) {
  const key = String(color);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(key);
}
function basic(color) {
  const key = 'b' + String(color);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color }));
  return matCache.get(key);
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  return m;
}

// Neon sign label: the sign's name as a canvas texture — white core with
// a halo in the sign's own colour, transparent around the letters, so the
// plate reads as a named sign at any distance. Built once per sign.
function makeSignTexture(label, colorHex) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  const css = '#' + colorHex.toString(16).padStart(6, '0');
  g.clearRect(0, 0, 512, 96);
  g.font = 'bold 54px "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = css;
  g.shadowBlur = 16;
  g.fillStyle = css;
  g.fillText(label, 256, 50);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.fillText(label, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = _aniso;
  return tex;
}

// Horizon-glow texture: a warm gold radial bloom fading to transparent,
// built once on a small canvas — the sprite stretches it flat (150x42).
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 32, 0, 128, 32, 124);
  grad.addColorStop(0, 'rgba(255, 205, 120, 0.95)');
  grad.addColorStop(0.45, 'rgba(255, 175, 85, 0.5)');
  grad.addColorStop(1, 'rgba(255, 150, 60, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = _aniso;
  return tex;
}

// Star texture: a soft round dot fading to transparent, so points read
// as stars instead of square pixels.
function makeStarTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = _aniso;
  return tex;
}

// Moon texture: a pale disc with a soft halo and faint maria, so the
// sprite reads as a moon, not a square lamp (the old sprite had no map).
function makeMoonTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  // rev5: solid bright disc out to 62% radius (was 55%) with a stronger
  // halo, so the enlarged moon reads as a blazing disc, not a faint smudge.
  grad.addColorStop(0, 'rgba(245, 248, 255, 1)');
  grad.addColorStop(0.62, 'rgba(238, 244, 255, 1)');
  grad.addColorStop(0.72, 'rgba(210, 224, 250, 0.6)');
  grad.addColorStop(1, 'rgba(210, 224, 250, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(170, 185, 215, 0.35)';
  g.beginPath(); g.arc(52, 54, 9, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(76, 74, 7, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(70, 44, 5, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = _aniso;
  return tex;
}

// Fixed-seed PRNG: the star field must be identical every run, or the
// deterministic screenshot check (run1 == run2) fails. Never Math.random
// for anything that renders.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Star field: ~700 points on a dome around the camera (radius 380, inside
// the 600 far plane), fog off so distance haze cannot swallow them.
// Elevations bias low (el = 35° * r²): the chase camera looks down ~25°
// with a 62° FOV, so only the 0-6° band is ever in frame — most stars
// live there, across every azimuth, so every night scene has a sky.
function buildStars(scene) {
  const rand = mulberry32(20261123);
  const N = 700;
  const RADIUS = 380;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const tints = [[1, 1, 1], [0.81, 0.88, 1], [1, 0.91, 0.77], [0.85, 0.93, 1]];
  for (let i = 0; i < N; i++) {
    const az = rand() * Math.PI * 2;
    const el = (35 * rand() * rand()) * Math.PI / 180;
    pos[i * 3] = Math.cos(el) * Math.cos(az) * RADIUS;
    pos[i * 3 + 1] = Math.sin(el) * RADIUS;
    pos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * RADIUS;
    const t = tints[Math.floor(rand() * tints.length)];
    const b = 0.55 + rand() * 0.45;
    col[i * 3] = t[0] * b; col[i * 3 + 1] = t[1] * b; col[i * 3 + 2] = t[2] * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 2.8, sizeAttenuation: false, map: makeStarTexture(),
    transparent: true, opacity: 0, depthWrite: false, fog: false, vertexColors: true,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return points;
}

export function init3D(game, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1280, 720, false);
  // HD pass: 1.25x pixel ratio sharpens every edge and texture without
  // changing the 1280x720 layout (the canvas backing store is 1600x900).
  // 1.5x was measured first and cost half the frame rate under
  // SwiftShader (1.2 -> 0.6 fps); 1.25x keeps the playthrough feasible
  // while still visibly sharpening the screenshots.
  renderer.setPixelRatio(1.25);
  // Real shadows: the moonlight casts them (1024 map, PCF soft), so
  // buildings, cars and people get depth instead of flat night shading.
  // The map stays modest on purpose: SwiftShader has to stay usable.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  _aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1428);
  scene.fog = new THREE.FogExp2(0x0a1428, 0.008);
  const camera = new THREE.PerspectiveCamera(62, 1280 / 720, 0.1, 600);

  const hemi = new THREE.HemisphereLight(0x2a4a6b, 0x141a26, 0.68);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fb4ff, 0.55);
  moon.position.set(60, 120, -40);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -60;
  moon.shadow.camera.right = 60;
  moon.shadow.camera.top = 60;
  moon.shadow.camera.bottom = -60;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 280;
  moon.shadow.bias = -0.002;
  scene.add(moon);
  scene.add(moon.target);
  // One warm point light that rides with the player, so the hero and the
  // street around them always read at night — kept small so it never
  // blasts the building faces around the player white.
  const heroLight = new THREE.PointLight(0xffc46b, 1.0, 18, 1.6);
  scene.add(heroLight);
  // Headlight spot for the player's car (only on while driving).
  const headSpot = new THREE.SpotLight(0xffe9a8, 0, 60, 0.5, 0.45, 1.2);
  scene.add(headSpot);
  scene.add(headSpot.target);

  R = {
    renderer, scene, camera, hemi, moon, heroLight, headSpot,
    carMeshes: new Map(), personMeshes: new Map(), pickupMeshes: new Map(),
    tracerLines: null, tracerGeo: null, tracerPos: null, muzzleMesh: null, explosionMeshes: [],
    beacon: null, beaconRing: null, raceRing: null, heliMesh: null,
    heliSpot: null, heliCone: null, neonMats: [], signMats: [], built: false,
    clock: 0, playerSpotOn: false,
    sunSprite: null, moonSprite: null, glowSprite: null, starPoints: null,
    particlePoints: null, particleGeo: null, particlePos: null, particleCol: null,
    interiorGroups: {}, interiorPlayer: null,
  };
  buildCity(game);
  R.built = true;
  window.__webglOk = true;
  return R;
}

function buildCity(game) {
  const { scene } = R;
  const W = MAP_W * TILE * SCALE3D; // 204.8
  // Ground: dark city floor.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, W), lambert('#10141b'));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // Roads: slightly lighter asphalt strips on the grid.
  const roadMat = lambert('#20242c');
  const roadW = 2 * TILE * SCALE3D;
  for (const L of ROAD_AT) {
    const c = (L + 1) * TILE * SCALE3D - HALF3D;
    const v = new THREE.Mesh(new THREE.PlaneGeometry(roadW, W), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.02, 0);
    v.receiveShadow = true;
    scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(W, roadW), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.02, c);
    h.receiveShadow = true;
    scene.add(h);
  }
  // Lane dashes, instanced: one draw call for the whole city.
  const dashGeo = new THREE.BoxGeometry(0.18, 0.02, 1.6);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c25a });
  const dashSpots = [];
  for (const L of ROAD_AT) {
    const c = (L + 1) * TILE * SCALE3D - HALF3D;
    for (let d = -96; d < 96; d += 6) {
      dashSpots.push([c, d, 0]);
      dashSpots.push([d, c, 1]);
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  dashSpots.forEach(([x, z, rot], i) => {
    e.set(0, rot ? Math.PI / 2 : 0, 0);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, 0.05, z), q, new THREE.Vector3(1, 1, 1));
    dashes.setMatrixAt(i, m4);
  });
  scene.add(dashes);
  // Central Park green, beach sand, southern water.
  const park = new THREE.Mesh(new THREE.PlaneGeometry(19 * TILE * SCALE3D, 11 * TILE * SCALE3D), lambert('#1d4026'));
  park.rotation.x = -Math.PI / 2;
  park.position.set(pxTo3X(20 * TILE), 0.03, pxTo3Z(36 * TILE));
  park.receiveShadow = true;
  scene.add(park);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(64 * TILE * SCALE3D, 4 * TILE * SCALE3D), lambert('#8a744e'));
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.03, pxTo3Z(58 * TILE));
  beach.receiveShadow = true;
  scene.add(beach);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(64 * TILE * SCALE3D, 4 * TILE * SCALE3D), lambert('#0e3a55'));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.03, pxTo3Z(62 * TILE));
  scene.add(water);

  // Buildings: one flat-shaded box each + a roof cap. Towers get lit
  // windows (instanced emissive quads on the south face).
  const winGeo = new THREE.PlaneGeometry(0.7, 0.5);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffd26e });
  const winSpots = [];
  for (const b of game.world.buildings) {
    const w = b.w * SCALE3D;
    const d = b.h * SCALE3D;
    const hgt = Math.max(2, Math.min(b.floors * 1.15, 13));
    const mesh = box(w, hgt, d, lambert(b.color));
    mesh.position.set(pxTo3X(b.x + b.w / 2), hgt / 2, pxTo3Z(b.y + b.h / 2));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const roof = box(w * 0.96, 0.25, d * 0.96, lambert(b.roof));
    roof.position.set(mesh.position.x, hgt + 0.12, mesh.position.z);
    roof.castShadow = true;
    roof.receiveShadow = true;
    scene.add(roof);
    // Rooftop props for height cues — AC units on every roof, antenna
    // masts on towers, water tanks on apartments: the skyline reads as
    // 3D volume from the chase camera, not flat coloured boxes.
    {
      const n = 1 + Math.floor(hash2(b.x, b.y) * 3);
      for (let i = 0; i < n; i++) {
        const ac = box(1.1, 0.5, 0.8, lambert('#5a5f66'));
        ac.position.set(mesh.position.x - w / 4 + i * 1.6, hgt + 0.5, mesh.position.z - d / 4);
        ac.castShadow = true;
        scene.add(ac);
      }
      if (b.style === 'tower') {
        const mast = box(0.18, 2.6, 0.18, lambert('#2c313a'));
        mast.position.set(mesh.position.x + w / 4, hgt + 1.55, mesh.position.z + d / 4);
        mast.castShadow = true;
        scene.add(mast);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), basic('#ff5a3c'));
        tip.position.set(mesh.position.x + w / 4, hgt + 2.9, mesh.position.z + d / 4);
        scene.add(tip);
      } else if (b.style === 'apartment') {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 8), lambert('#6b5a3a'));
        tank.position.set(mesh.position.x + w / 4, hgt + 0.8, mesh.position.z - d / 4);
        tank.castShadow = true;
        scene.add(tank);
      }
    }
    // Lit windows on the south face.
    const cols = Math.max(1, Math.floor(w / 2.2));
    const rows = Math.min(b.floors, 4);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (hash2(b.x + i * 7, b.y + j * 13) < 0.55) {
          winSpots.push([
            mesh.position.x - w / 2 + 1.1 + i * 2.2,
            1.1 + j * 1.5,
            mesh.position.z + d / 2 + 0.03,
          ]);
        }
      }
    }
  }
  if (winSpots.length) {
    const wins = new THREE.InstancedMesh(winGeo, winMat, winSpots.length);
    winSpots.forEach(([x, y, z], i) => {
      m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      wins.setMatrixAt(i, m4);
    });
    scene.add(wins);
    R.neonMats.push(winMat);
  }

  // Neon landmark signs: small glowing plates over the bank, shops, hideout
  // and pizza place — the night city's colour. MeshBasicMaterial = unlit glow.
  // Each plate carries its name as a canvas-texture label on both faces,
  // so it reads as a named neon sign ("HIDEOUT") instead of a bare coloured
  // bar: the bare magenta plate used to land dead-centre under the title
  // text on the start screen and read as a stray UI element.
  const signs = [
    [game.world.bank, 'BANK', 0x35e0ff],
    [game.world.shops.gunsmith, 'GUNSMITH', 0xff5a3c],
    [game.world.shops.garage, 'GARAGE', 0xffb03a],
    [game.world.shops.clinic, 'CLINIC', 0x3affc8],
    [game.world.hideout, 'HIDEOUT', 0xff5ad0],
    [game.world.pizza, 'PIZZA', 0xffe93a],
  ];
  for (const [pt, label, color] of signs) {
    const mat = new THREE.MeshBasicMaterial({ color });
    R.signMats.push(mat);
    const sign = box(2.8, 0.55, 0.3, mat);
    sign.position.set(pxTo3X(pt.x), 2.8, pxTo3Z(pt.y) + 1.0);
    scene.add(sign);
    // A small pole holding the sign.
    const pole = box(0.2, 2.8, 0.2, lambert('#22262e'));
    pole.position.set(pxTo3X(pt.x), 1.4, pxTo3Z(pt.y) + 1.0);
    scene.add(pole);
    sign.userData.label = label;
    // The name, glowing on both faces of the plate (the side the street
    // cameras see): white core, sign-colour halo, transparent around it.
    // Two planes, one per face — from behind, the bare plate used to read
    // as a floating coloured bar in the drive and chase shots.
    for (const [dz, rot] of [[1.17, 0], [0.83, Math.PI]]) {
      const labelPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.45),
        new THREE.MeshBasicMaterial({ map: makeSignTexture(label, color), transparent: true, side: THREE.DoubleSide }),
      );
      labelPlane.position.set(pxTo3X(pt.x), 2.8, pxTo3Z(pt.y) + dz);
      labelPlane.rotation.y = rot;
      scene.add(labelPlane);
    }
  }

  // Streetlights at intersections, just OFF the road (the road strip is
  // 2 tiles wide; poles at +-0.7 tiles from the road line sit on the kerb).
  const poleSpots = [];
  for (const Lx of ROAD_AT) {
    for (const Ly of ROAD_AT) {
      poleSpots.push([(Lx + 2.7) * TILE, (Ly + 2.7) * TILE]);
      poleSpots.push([(Lx - 0.7) * TILE, (Ly - 0.7) * TILE]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 4.4, 6);
  const poles = new THREE.InstancedMesh(poleGeo, lambert('#2c313a'), poleSpots.length);
  poles.castShadow = true;
  const headGeo = new THREE.SphereGeometry(0.2, 8, 6);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, poleSpots.length);
  poleSpots.forEach(([px, py], i) => {
    const x = pxTo3X(px);
    const z = pxTo3Z(py);
    m4.compose(new THREE.Vector3(x, 2.2, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 4.5, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(i, m4);
  });
  scene.add(poles);
  scene.add(heads);
  R.neonMats.push(headMat);

  // Park trees: instanced cones + trunks.
  const treeSpots = [];
  for (let i = 0; i < 46; i++) {
    const tx = 11 + hash2(i, 3) * 18;
    const ty = 31 + hash2(i, 7) * 10;
    treeSpots.push([tx * TILE, ty * TILE]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.2, 6);
  const trunks = new THREE.InstancedMesh(trunkGeo, lambert('#4a3a28'), treeSpots.length);
  trunks.castShadow = true;
  const coneGeo = new THREE.ConeGeometry(1.1, 2.6, 7);
  const cones = new THREE.InstancedMesh(coneGeo, lambert('#1f5c2e'), treeSpots.length);
  cones.castShadow = true;
  treeSpots.forEach(([px, py], i) => {
    const x = pxTo3X(px);
    const z = pxTo3Z(py);
    m4.compose(new THREE.Vector3(x, 0.6, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 2.4, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    cones.setMatrixAt(i, m4);
  });
  scene.add(trunks);
  scene.add(cones);

  // Objective beacon: a glowing pillar + a floating diamond, repositioned
  // every frame onto the current objective.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.32 });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 12, 1, true), beaconMat);
  beacon.position.y = 20;
  scene.add(beacon);
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), new THREE.MeshBasicMaterial({ color: 0xffd94a }));
  diamond.position.y = 7;
  scene.add(diamond);
  R.beacon = beacon;
  R.beaconRing = diamond;
  // Race checkpoint ring: a glowing torus lying flat, moved per checkpoint.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.28, 8, 28), new THREE.MeshBasicMaterial({ color: 0x35e0ff }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.2;
  ring.visible = false;
  scene.add(ring);
  R.raceRing = ring;

  // Helicopter (built once, hidden until wanted >= 4). Scaled up and
  // brightened so it reads clearly in the chase frame: pale steel-blue
  // body (the old dark navy vanished against the night sky), a white
  // belly stripe, a red anti-collision beacon, and a translucent rotor
  // disc for the spinning blades. Still a marking/escalation unit only —
  // it never shoots.
  const heli = new THREE.Group();
  heli.scale.set(1.4, 1.4, 1.4);
  const hBody = box(3.4, 1.1, 1.6, lambert('#7d9cc9'));
  hBody.position.y = 0;
  heli.add(hBody);
  const hStripe = box(3.0, 0.2, 1.64, basic('#e8eef7'));
  hStripe.position.y = -0.42;
  heli.add(hStripe);
  const hBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), basic('#ff3b30'));
  hBeacon.position.set(0, 0.72, 0);
  heli.add(hBeacon);
  const hTail = box(3.2, 0.5, 0.5, lambert('#7d9cc9'));
  hTail.position.set(-2.8, 0.2, 0);
  heli.add(hTail);
  const hGlass = box(1.1, 0.7, 1.4, basic('#cfe8ff'));
  hGlass.position.set(1.5, 0.1, 0);
  heli.add(hGlass);
  const rotor = box(6.4, 0.08, 0.35, lambert('#14161a'));
  rotor.position.y = 0.85;
  heli.add(rotor);
  // Blurred rotor disc: the spinning blades read as a pale disc at
  // distance, which is what makes a heli legible in a still frame.
  const rotorDisc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xdfe8f5, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
  );
  rotorDisc.rotation.x = -Math.PI / 2;
  rotorDisc.position.y = 0.88;
  heli.add(rotorDisc);
  heli.userData.rotor = rotor;
  heli.visible = false;
  heli.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(heli);
  R.heliMesh = heli;
  const heliSpot = new THREE.SpotLight(0xfff2c0, 0, 70, 0.32, 0.5, 1.0);
  scene.add(heliSpot);
  scene.add(heliSpot.target);
  R.heliSpot = heliSpot;
  // The searchlight's visible cone: a translucent unit cone, stretched
  // each frame from the heli down onto the player (see syncHeli).
  // Opacity 0.13 (was 0.07): the cone is the heli's signature in the
  // chase frame and was barely legible at night.
  const heliCone = new THREE.Mesh(
    new THREE.ConeGeometry(1, 1, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
  );
  heliCone.visible = false;
  scene.add(heliCone);
  R.heliCone = heliCone;

  // The bank vault: a gold door on the south face of the building nearest
  // the bank, with gold bars stacked at its foot — the thing THE BANK
  // JOB is about, visible in the mission shot and in live play.
  let bankB = null;
  let bankBD = Infinity;
  for (const b of game.world.buildings) {
    const d = Math.hypot(b.x + b.w / 2 - game.world.bank.x, b.y + b.h / 2 - game.world.bank.y);
    if (d < bankBD) { bankBD = d; bankB = b; }
  }
  if (bankB) {
    const door = box(2.6, 3.2, 0.18, basic('#ffd94a'));
    door.position.set(pxTo3X(bankB.x + bankB.w / 2), 1.6, pxTo3Z(bankB.y + bankB.h) + 0.12);
    scene.add(door);
    const frame = box(3.0, 3.6, 0.1, lambert('#2a2f36'));
    frame.position.set(pxTo3X(bankB.x + bankB.w / 2), 1.7, pxTo3Z(bankB.y + bankB.h) + 0.05);
    scene.add(frame);
    for (let i = 0; i < 3; i++) {
      const barG = box(0.7, 0.25, 0.35, basic('#ffcf3a'));
      barG.position.set(pxTo3X(bankB.x + bankB.w / 2) - 1 + i * 1.0, 0.15, pxTo3Z(bankB.y + bankB.h) + 1.2);
      scene.add(barG);
    }
  }

  // Sun and moon discs for the day/night cycle: sprites that ride with
  // the camera 160 units out (fog off, far plane 600), opacity driven by
  // the phase in updateLighting — a low golden sun at dawn/dusk, a pale
  // moon low in the north-east on dark nights, where the chase camera's
  // sky band can actually see it (the old moon sat 46° up, above every
  // frame). The cycle is dynamic; these are its sky.
  const sunMat = new THREE.SpriteMaterial({ color: 0xffc46b, transparent: true, opacity: 0, fog: false });
  const sunSprite = new THREE.Sprite(sunMat);
  sunSprite.scale.set(24, 24, 1);
  scene.add(sunSprite);
  R.sunSprite = sunSprite;
  const moonMat = new THREE.SpriteMaterial({ map: makeMoonTexture(), transparent: true, opacity: 0, fog: false, depthWrite: false, depthTest: false });
  const moonSprite = new THREE.Sprite(moonMat);
  // rev5: the moon is a sky element — depthTest off + renderOrder high
  // so a tall rooftop can never swallow it (rev5's first build had the
  // big moon hidden behind a downtown tower in the title shot).
  moonSprite.renderOrder = 999;
  // rev5: BIG moon (scale 20 -> 38, ~14° across the sky) so it is
  // unmissable in the title and night gameplay shots.
  moonSprite.scale.set(38, 38, 1);
  scene.add(moonSprite);
  R.moonSprite = moonSprite;

  // Horizon glow: a wide radial-gradient bloom stretched flat across the
  // skyline, riding the sun's azimuth 160 units out at about +7 units
  // elevation — the sunset haze you see looking into a golden-hour sun.
  // Depth-tested (depthWrite off so it never blocks anything, depthTest
  // on so rooftops occlude it), fog off like the sun disc.
  const glowTex = makeGlowTexture();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const glowSprite = new THREE.Sprite(glowMat);
  glowSprite.scale.set(150, 42, 1);
  scene.add(glowSprite);
  R.glowSprite = glowSprite;

  // Star field: a fixed-seed dome of points that rides with the camera
  // (position updated per frame in updateLighting, like the sun/moon
  // sprites) — the night sky is no longer empty in any direction.
  R.starPoints = buildStars(scene);

  // Muzzle flash + tracers + explosions (pooled).
  R.muzzleMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd94a }));
  R.muzzleMesh.visible = false;
  scene.add(R.muzzleMesh);
  // Tracers: ONE preallocated line buffer for up to 64 segments, refilled
  // in place every frame — the old code disposed and rebuilt the whole
  // geometry (and its material) on every single frame.
  const TRACER_MAX = 64;
  R.tracerPos = new Float32Array(TRACER_MAX * 2 * 3);
  R.tracerGeo = new THREE.BufferGeometry();
  R.tracerGeo.setAttribute('position', new THREE.BufferAttribute(R.tracerPos, 3));
  R.tracerGeo.setDrawRange(0, 0);
  R.tracerLines = new THREE.LineSegments(R.tracerGeo, new THREE.LineBasicMaterial({ color: 0xffdc78 }));
  R.tracerLines.frustumCulled = false;
  scene.add(R.tracerLines);
  // Particles: ONE preallocated Points cloud (300 slots, the pool size in
  // main.js), positions + colours refilled in place from game.particles.
  // Before this, particles were logic-only — hits and crashes made no
  // sparks on screen at all.
  const PARTICLE_MAX = 300;
  R.particlePos = new Float32Array(PARTICLE_MAX * 3);
  R.particleCol = new Float32Array(PARTICLE_MAX * 3);
  R.particleGeo = new THREE.BufferGeometry();
  R.particleGeo.setAttribute('position', new THREE.BufferAttribute(R.particlePos, 3));
  R.particleGeo.setAttribute('color', new THREE.BufferAttribute(R.particleCol, 3));
  R.particleGeo.setDrawRange(0, 0);
  const pMat = new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true });
  R.particlePoints = new THREE.Points(R.particleGeo, pMat);
  R.particlePoints.frustumCulled = false;
  scene.add(R.particlePoints);
  for (let i = 0; i < 6; i++) {
    const ex = new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.9 }),
    );
    ex.visible = false;
    scene.add(ex);
    R.explosionMeshes.push(ex);
  }
}

// --- Dynamic entity meshes -----------------------------------------------

function makeCarMesh(v) {
  const s = carShape(v.def.id);
  const g = new THREE.Group();
  const len = s.len * SCALE3D;
  const wid = s.wid * SCALE3D;
  const bodyMat = lambert(v.color);
  const body = box(len, 0.55, wid, bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = box(s.cabinLen * SCALE3D, 0.5, wid * 0.8, lambert('#16202c'));
  cabin.position.set((s.cabin * SCALE3D) * 0.4, 1.05, 0);
  g.add(cabin);
  if (s.kind === 'truck') {
    const cargo = box(len * 0.55, 0.9, wid * 0.92, lambert('#6b6252'));
    cargo.position.set(-len * 0.2, 0.9, 0);
    g.add(cargo);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  const wheelMat = lambert('#14161a');
  for (const [wx, wz] of [[len / 2 - 0.7, wid / 2], [len / 2 - 0.7, -wid / 2], [-len / 2 + 0.7, wid / 2], [-len / 2 + 0.7, -wid / 2]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.34, wz);
    g.add(w);
  }
  // Headlights (front = +x in local space) and tail lights.
  const hl = box(0.12, 0.16, 0.4, basic('#ffe9a8'));
  hl.position.set(len / 2 + 0.02, 0.6, wid / 2 - 0.45);
  g.add(hl);
  const hl2 = hl.clone();
  hl2.position.z = -wid / 2 + 0.45;
  g.add(hl2);
  const tl = box(0.12, 0.16, 0.4, basic('#e84a4a'));
  tl.position.set(-len / 2 - 0.02, 0.6, wid / 2 - 0.45);
  g.add(tl);
  const tl2 = tl.clone();
  tl2.position.z = -wid / 2 + 0.45;
  g.add(tl2);
  if (s.taxi) {
    const sign = box(0.9, 0.28, 0.5, basic('#ffe93a'));
    sign.position.set(0, 1.45, 0);
    g.add(sign);
  }
  if (s.police) {
    const bar = box(0.7, 0.22, 1.1, lambert('#e8e8e8'));
    bar.position.set(0, 1.42, 0);
    g.add(bar);
    const l1 = box(0.3, 0.2, 0.5, basic('#ff2a2a'));
    l1.position.set(0, 1.56, 0.28);
    g.add(l1);
    const l2 = box(0.3, 0.2, 0.5, basic('#2a6bff'));
    l2.position.set(0, 1.56, -0.28);
    g.add(l2);
    g.userData.flash1 = l1;
    g.userData.flash2 = l2;
  }
  if (s.spoiler) {
    const sp = box(0.16, 0.1, wid * 0.9, lambert('#14161a'));
    sp.position.set(-len / 2 - 0.05, 0.95, 0);
    g.add(sp);
  }
  // Damage smoke: a dark puff that shows when the car is hurt.
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0x30343a, transparent: true, opacity: 0.0 }));
  smoke.position.set(len / 4, 1.3, 0);
  g.add(smoke);
  g.userData.smoke = smoke;
  g.userData.bodyMat = bodyMat;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makePersonMesh(look, isCop, isPlayer) {
  const g = new THREE.Group();
  const jacket = lambert(look.color || '#7d8aa0');
  const pants = lambert(look.pants || '#2a3a5c');
  const skin = lambert('#d8a878');
  const hair = lambert(look.hair || '#1a1a1a');
  // Legs (swing when walking — animated in syncPeople).
  const legL = box(0.26, 0.75, 0.26, pants);
  legL.geometry.translate(0, -0.375, 0);
  legL.position.set(0, 0.75, 0.18);
  const legR = box(0.26, 0.75, 0.26, pants);
  legR.geometry.translate(0, -0.375, 0);
  legR.position.set(0, 0.75, -0.18);
  g.add(legL);
  g.add(legR);
  const torso = box(0.55, 0.75, 0.7, jacket);
  torso.position.y = 1.12;
  g.add(torso);
  const head = box(0.42, 0.42, 0.42, skin);
  head.position.y = 1.72;
  g.add(head);
  const hairM = box(0.44, 0.18, 0.44, hair);
  hairM.position.y = 1.95;
  g.add(hairM);
  if (isCop) {
    const hat = box(0.5, 0.12, 0.5, lambert('#1f2f4a'));
    hat.position.y = 2.06;
    g.add(hat);
  }
  if (isPlayer) {
    // Dario's teal jacket + a dark shoulder strap so he reads at a glance.
    const strap = box(0.58, 0.1, 0.16, lambert('#14161a'));
    strap.position.set(0, 1.35, 0.28);
    strap.rotation.z = 0.5;
    g.add(strap);
  }
  // Arms.
  const armL = box(0.2, 0.6, 0.2, jacket);
  armL.position.set(0, 1.15, 0.48);
  const armR = box(0.2, 0.6, 0.2, jacket);
  armR.position.set(0, 1.15, -0.48);
  g.add(armL);
  g.add(armR);
  g.userData = { legL, legR, armR };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  if (isPlayer) {
    // Held weapons: one small model per gun, all built once, only the
    // current one visible (switched in syncPeople / renderInterior3D).
    // Each reads at a glance in the hand: pistol short, SMG with a mag,
    // shotgun with a pump, rifle with a scope, sniper long-barrelled,
    // bazooka a fat tube. Local +x is the facing direction.
    const gunmetal = lambert('#1a1d22');
    const wood = lambert('#5a4a2a');
    const mkWeapon = (build) => {
      const wg = new THREE.Group();
      wg.position.set(0.15, 1.2, -0.48);
      build(wg);
      wg.visible = false;
      wg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(wg);
      return wg;
    };
    const barrel = (len, y) => {
      const b = box(len, 0.12, 0.12, gunmetal);
      b.position.set(0.2 + len / 2, y || 0, 0);
      return b;
    };
    g.userData.weapons = {
      pistol: mkWeapon((wg) => {
        wg.add(barrel(0.5, 0));
        const grip = box(0.12, 0.28, 0.1, wood);
        grip.position.set(0.08, -0.18, 0);
        wg.add(grip);
      }),
      smg: mkWeapon((wg) => {
        wg.add(barrel(0.75, 0));
        const mag = box(0.12, 0.32, 0.1, gunmetal);
        mag.position.set(0.45, -0.2, 0);
        wg.add(mag);
        const stock = box(0.25, 0.14, 0.12, wood);
        stock.position.set(0.05, 0, 0);
        wg.add(stock);
      }),
      shotgun: mkWeapon((wg) => {
        wg.add(barrel(1.0, 0));
        const pump = box(0.3, 0.16, 0.14, wood);
        pump.position.set(0.75, -0.13, 0);
        wg.add(pump);
        const stock = box(0.3, 0.16, 0.13, wood);
        stock.position.set(0.02, -0.02, 0);
        wg.add(stock);
      }),
      rifle: mkWeapon((wg) => {
        wg.add(barrel(1.05, 0));
        const scope = box(0.32, 0.12, 0.12, gunmetal);
        scope.position.set(0.55, 0.13, 0);
        wg.add(scope);
        const mag = box(0.12, 0.26, 0.1, gunmetal);
        mag.position.set(0.4, -0.18, 0);
        wg.add(mag);
      }),
      sniper: mkWeapon((wg) => {
        const thin = box(1.45, 0.08, 0.08, gunmetal);
        thin.position.set(0.2 + 1.45 / 2, 0, 0);
        wg.add(thin);
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 8), gunmetal);
        scope.rotation.z = Math.PI / 2;
        scope.position.set(0.6, 0.14, 0);
        wg.add(scope);
        const stock = box(0.35, 0.16, 0.13, wood);
        stock.position.set(0.05, -0.02, 0);
        wg.add(stock);
        const bipod = box(0.08, 0.22, 0.08, gunmetal);
        bipod.position.set(1.35, -0.14, 0);
        wg.add(bipod);
      }),
      bazooka: mkWeapon((wg) => {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.35, 10), lambert('#3a4a2f'));
        tube.rotation.z = Math.PI / 2;
        tube.position.set(0.85, 0, 0);
        wg.add(tube);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 10), gunmetal);
        cone.rotation.z = -Math.PI / 2;
        cone.position.set(1.68, 0, 0);
        wg.add(cone);
        const grip = box(0.14, 0.24, 0.12, wood);
        grip.position.set(0.75, -0.2, 0);
        wg.add(grip);
      }),
    };
  }
  return g;
}

// Show only the player's current weapon in hand (hidden for fists).
function syncPlayerWeapon(mesh, game) {
  const weapons = mesh.userData && mesh.userData.weapons;
  if (!weapons) return;
  for (const [id, w] of Object.entries(weapons)) {
    w.visible = id === game.arsenal.current;
  }
}

function syncMap(map, items, keyFn, make, update) {
  const seen = new Set();
  for (const item of items) {
    const key = keyFn(item);
    seen.add(key);
    let mesh = map.get(key);
    if (!mesh) {
      mesh = make(item);
      map.set(key, mesh);
      R.scene.add(mesh);
    }
    update(mesh, item);
  }
  for (const [key, mesh] of map) {
    if (!seen.has(key)) {
      R.scene.remove(mesh);
      map.delete(key);
    }
  }
}

const _liveCars = [];
function syncCars(game) {
  // Live cars only, into a reused scratch array — the old filter()
  // allocated a new array every frame for the same list.
  _liveCars.length = 0;
  for (const v of game.vehicles) if (!v.dead) _liveCars.push(v);
  syncMap(R.carMeshes, _liveCars, (v) => v, makeCarMesh, (mesh, v) => {
    mesh.position.set(pxTo3X(v.x), 0, pxTo3Z(v.y));
    // 2D angle 0 = east (+x); three.js rotation.y: -angle maps +x forward.
    mesh.rotation.y = -v.angle;
    const hurt = 1 - v.health / v.def.health;
    if (mesh.userData.smoke) mesh.userData.smoke.material.opacity = hurt > 0.4 ? 0.55 : 0;
    if (mesh.userData.flash1) {
      const on = Math.floor(R.clock * 4) % 2 === 0;
      mesh.userData.flash1.material = on ? basic('#ff2a2a') : basic('#5a1010');
      mesh.userData.flash2.material = on ? basic('#102a5a') : basic('#2a6bff');
    }
    // Burnt-out wrecks stay visible as dark hulks (handled below in
    // syncDeadCars) — live cars never show here.
  });
  // Dead cars: keep a dark wreck mesh so an explosion leaves a carcass.
  for (const v of game.vehicles) {
    if (!v.dead || v.explodedShown) continue;
    v.explodedShown = true;
  }
}

// Walk-cycle phase for leg swing. Wall-clock in live play; frozen at 0
// for a staged ?shot= frame, so the screenshot is reproducible — the
// cops' stride otherwise depends on the exact millisecond of the shot.
const walkPhase = (game) => (game.shotFrozen ? 0 : performance.now() / 120);

function syncPeople(game) {
  const p = game.player;
  const items = [];
  if (!p.dead && !p.inCar) items.push({ ref: p, look: p, isPlayer: true, phase: walkPhase(game), moving: p.walking });
  for (const ped of game.peds) {
    if (!ped.dead) items.push({ ref: ped, look: ped, isPlayer: false, phase: ped.walkPhase, moving: true });
  }
  for (const cop of game.cops) {
    if (!cop.dead && !cop.inCar) items.push({ ref: cop, look: { color: '#2f4a7d', hair: '#1a1a1a', pants: '#1f2f4a', hat: true }, isPlayer: false, isCop: true, phase: walkPhase(game), moving: true });
  }
  syncMap(R.personMeshes, items, (it) => it.ref, (it) => makePersonMesh(it.look, it.isCop, it.isPlayer), (mesh, it) => {
    const e = it.ref;
    mesh.position.set(pxTo3X(e.x), 0, pxTo3Z(e.y));
    mesh.rotation.y = -e.angle;
    const swing = it.moving ? Math.sin(it.phase) * 0.55 : 0;
    mesh.userData.legL.rotation.x = swing;
    mesh.userData.legR.rotation.x = -swing;
    mesh.userData.armR.rotation.x = it.isPlayer && game.arsenal.current !== 'fists' ? -1.2 : 0;
    if (it.isPlayer) syncPlayerWeapon(mesh, game);
  });
}

function syncPickups(game) {
  syncMap(R.pickupMeshes, game.pickups, (pk) => pk, (pk) => {
    const g = new THREE.Group();
    if (pk.kind === 'cash') {
      const m = box(0.9, 0.12, 0.5, basic('#3ecf6e'));
      g.add(m);
    } else if (pk.kind === 'health') {
      const m = box(0.7, 0.7, 0.2, basic('#f2f2f2'));
      g.add(m);
      const c1 = box(0.5, 0.14, 0.24, basic('#e84a4a'));
      g.add(c1);
      const c2 = box(0.14, 0.5, 0.24, basic('#e84a4a'));
      g.add(c2);
    } else {
      const m = box(0.8, 0.2, 0.3, basic('#ffd94a'));
      g.add(m);
    }
    return g;
  }, (mesh, pk) => {
    mesh.position.set(pxTo3X(pk.x), 0.9 + Math.sin(pk.bob + R.clock * 2) * 0.15, pxTo3Z(pk.y));
    mesh.rotation.y = R.clock * 1.5;
  });
}

function syncTracers(game) {
  // Refill the preallocated tracer buffer in place; the draw range is
  // the live segment count, so an empty frame draws nothing and allocates
  // nothing. Muzzle flash rides the same pooled mesh as before.
  const pos = R.tracerPos;
  const n = Math.min(game.tracers.length, 64);
  for (let i = 0; i < n; i++) {
    const t = game.tracers[i];
    pos[i * 6] = pxTo3X(t.x1);
    pos[i * 6 + 1] = 1.4;
    pos[i * 6 + 2] = pxTo3Z(t.y1);
    pos[i * 6 + 3] = pxTo3X(t.x2);
    pos[i * 6 + 4] = 1.4;
    pos[i * 6 + 5] = pxTo3Z(t.y2);
  }
  R.tracerGeo.attributes.position.needsUpdate = true;
  R.tracerGeo.setDrawRange(0, n * 2);
  if (game.muzzle && game.muzzle.life > 0) {
    R.muzzleMesh.visible = true;
    R.muzzleMesh.position.set(pxTo3X(game.muzzle.x), 1.4, pxTo3Z(game.muzzle.y));
    const s = 0.6 + game.muzzle.life * 8;
    R.muzzleMesh.scale.set(s, s, s);
  } else {
    R.muzzleMesh.visible = false;
  }
}

const _particleColor = new Map();
function particleRGB(color) {
  let rgb = _particleColor.get(color);
  if (!rgb) {
    const c = parseInt(color.slice(1), 16);
    rgb = [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
    _particleColor.set(color, rgb);
  }
  return rgb;
}

function syncParticles(game) {
  // One Points cloud, refilled from the fixed particle pool: live sparks
  // only, dead slots skipped, draw range set to the live count.
  const pos = R.particlePos;
  const col = R.particleCol;
  let n = 0;
  for (const pt of game.particles) {
    if (pt.life <= 0 || n >= 300) continue;
    pos[n * 3] = pxTo3X(pt.x);
    pos[n * 3 + 1] = 1.2 + (pt.maxLife ? (1 - pt.life / pt.maxLife) * 1.5 : 0);
    pos[n * 3 + 2] = pxTo3Z(pt.y);
    const rgb = particleRGB(pt.color || '#ffffff');
    col[n * 3] = rgb[0];
    col[n * 3 + 1] = rgb[1];
    col[n * 3 + 2] = rgb[2];
    n++;
  }
  R.particleGeo.attributes.position.needsUpdate = true;
  R.particleGeo.attributes.color.needsUpdate = true;
  R.particleGeo.setDrawRange(0, n);
}

function syncExplosions(game) {
  game.explosions = game.explosions || [];
  game.explosions.forEach((ex, i) => {
    const mesh = R.explosionMeshes[i % R.explosionMeshes.length];
    if (!mesh) return;
    mesh.visible = ex.life > 0;
    mesh.position.set(pxTo3X(ex.x), 1.2, pxTo3Z(ex.y));
    const s = (1 - ex.life) * 4 + 0.8;
    mesh.scale.set(s, s * 0.8, s);
    mesh.material.opacity = Math.max(0, ex.life);
  });
}

function syncBeacon(game) {
  const pt = game.objectivePoint ? game.objectivePoint() : null;
  if (pt) {
    R.beacon.visible = true;
    R.beaconRing.visible = true;
    R.beacon.position.set(pxTo3X(pt.x), 20, pxTo3Z(pt.y));
    R.beaconRing.position.set(pxTo3X(pt.x), 7 + Math.sin(R.clock * 2) * 0.6, pxTo3Z(pt.y));
    R.beaconRing.rotation.y = R.clock * 1.5;
  } else {
    R.beacon.visible = false;
    R.beaconRing.visible = false;
  }
  // Race checkpoint ring: hovers over the next checkpoint while racing.
  if (game.race && game.race.active && game.race.checkpoint < RACE.checkpoints.length) {
    const cp = RACE.checkpoints[game.race.checkpoint];
    R.raceRing.visible = true;
    R.raceRing.position.set(pxTo3X(cp.x), 1.2 + Math.sin(R.clock * 3) * 0.3, pxTo3Z(cp.y));
    R.raceRing.rotation.z = R.clock * 0.8;
  } else {
    R.raceRing.visible = false;
  }
  // Race start line: a glowing ring at the beachfront when not racing.
  if (game.race && !game.race.active && !game.mission && game.player.inCar) {
    const d = Math.hypot(game.player.x - RACE.start.x, game.player.y - RACE.start.y);
    if (d < 400) {
      R.raceRing.visible = true;
      R.raceRing.position.set(pxTo3X(RACE.start.x), 1.2, pxTo3Z(RACE.start.y));
    }
  }
}

const _heliUp = new THREE.Vector3(0, 1, 0);
const _heliDir = new THREE.Vector3();
const _heliAim = new THREE.Vector3();
function syncHeli(game) {
  const h = game.heli;
  if (!h) {
    R.heliMesh.visible = false;
    R.heliSpot.intensity = 0;
    R.heliCone.visible = false;
    return;
  }
  R.heliMesh.visible = true;
  R.heliMesh.position.set(pxTo3X(h.x), h.alt * SCALE3D, pxTo3Z(h.y));
  R.heliMesh.rotation.y = -h.angle;
  R.heliMesh.userData.rotor.rotation.y = h.rotor;
  // Searchlight: cone of light down onto the player.
  R.heliSpot.position.set(pxTo3X(h.x), h.alt * SCALE3D, pxTo3Z(h.y));
  R.heliSpot.target.position.set(pxTo3X(game.player.x), 0, pxTo3Z(game.player.y));
  R.heliSpot.intensity = 45;
  // The visible cone: apex at the heli, base fanning onto the player.
  // Unit cone (height 1, radius 1) stretched to the heli-player distance.
  const hx = pxTo3X(h.x);
  const hy = h.alt * SCALE3D;
  const hz = pxTo3Z(h.y);
  const px = pxTo3X(game.player.x);
  const pz = pxTo3Z(game.player.y);
  _heliDir.set(px - hx, 0 - hy, pz - hz);
  const dist = _heliDir.length() || 1;
  _heliDir.divideScalar(dist);
  _heliAim.copy(_heliDir).negate();
  R.heliCone.visible = true;
  R.heliCone.position.set((hx + px) / 2, hy / 2, (hz + pz) / 2);
  R.heliCone.quaternion.setFromUnitVectors(_heliUp, _heliAim);
  R.heliCone.scale.set(6.5, dist, 6.5);
  // Live readout for the harness: where the heli projects on screen.
  window.__heliScreen = projectToScreen(game, h.x, h.y);
  window.__heli = { x: h.x, y: h.y, alt: h.alt, marked: !!h.marked };
}

// --- Lighting: the cool night cycle --------------------------------------

const _sunDir = new THREE.Vector3();
const _moonDir = new THREE.Vector3();
const _glowDir = new THREE.Vector3();

function updateLighting(game) {
  const lf = lightFactor(game);
  const night = 1 - lf;
  const m = game.time % 1440;
  // Sky/fog: deep blue at night, warm gold at golden-hour day — never the
  // flat pale noon the old cycle had. The sun rides east to west through
  // the south, low at dawn and dusk; the moon hangs high on dark nights.
  // rev5: night sky lightened 0x050914 -> 0x0a1428 and fog thinned
  // (0.011 -> 0.008 at night) — rev4's lift was still too dark.
  const sky = lerpColor(0xe2b264, 0x0a1428, night);
  R.scene.background.setHex(sky);
  R.scene.fog.color.setHex(sky);
  R.scene.fog.density = 0.005 + night * 0.003;
  // Night floors lifted again (rev4: hemi 0.46, moon 0.36, hero 0.7+0.25;
  // rev5: hemi 0.68, moon 0.55, hero 1.0+0.35): the city, road and car
  // must read at night, not just the neon. Still a cool night: the sky
  // stays deep blue and the day cap (light factor) is untouched, so
  // golden hour keeps its look.
  R.hemi.intensity = 0.68 + Math.max(0, lf - 0.35) * 0.9;
  R.hemi.color.setHex(lerpColor(0xffe0b0, 0x2a4a6b, night));
  R.hemi.groundColor.setHex(0x141a26);
  R.moon.intensity = 0.55 + Math.max(0, lf - 0.35) * 1.0;
  R.moon.color.setHex(lf > 0.5 ? 0xffe0b0 : 0x8fb4ff);
  // The shadow camera rides with the player: a 120-unit box around the
  // hero, so the shadows are always where the camera looks (a static
  // shadow camera would only cover the map centre).
  {
    const px = pxTo3X(game.player.x);
    const pz = pxTo3Z(game.player.y);
    R.moon.position.set(px + 45, 90, pz - 35);
    R.moon.target.position.set(px, 0, pz);
    R.moon.target.updateMatrixWorld();
  }
  // Neon and window glow punch harder the darker it gets, and dim to a
  // dull amber by day instead of glaring through the sunlight.
  for (const nm of R.neonMats) nm.color.setHex(lerpColor(0x8a6a3a, 0xffd26e, night));
  R.heroLight.intensity = 1.0 + night * 0.35;
  // Sun and moon discs ride with the camera (far plane 600, fog off), so
  // they are always on the sky where the phase puts them.
  const dayT = Math.max(0, Math.min(1, (m - 360) / 780));
  const theta = Math.PI * dayT;
  _sunDir.set(Math.cos(theta), 0.08 + Math.sin(theta) * 0.75, Math.sin(theta) * 0.6).normalize();
  R.sunSprite.position.copy(R.camera.position).addScaledVector(_sunDir, 160);
  R.sunSprite.material.opacity = Math.max(0, Math.min(1, (lf - 0.12) / 0.3)) * 0.95;
  // rev5: moon rides LOW in the north-west (elevation ~5°, azimuth ~28°
  // west of north, was ~10°): the chase camera looks down ~17° with a
  // 62° FOV, so the old moon sat above the top edge of most frames — and
  // in the title shot it hid behind a downtown tower. Low + big + full
  // opacity at night puts it in the sky band of the title, chase and
  // mission views. The 28° west shift threads the gap between the
  // top-left money/district text (ends x~190) and the centred HUD text
  // (mission box starts x~380, "Next job" x~455): at 35° the disc sat
  // directly behind "Downtown Solmar — standing +0" and washed it out.
  // Never indoors: hidden in interior mode.
  _moonDir.set(-0.48, 0.09, -0.88).normalize();
  R.moonSprite.position.copy(R.camera.position).addScaledVector(_moonDir, 160);
  R.moonSprite.material.opacity = Math.max(0, Math.min(1, night * 1.4 - 0.1));
  R.moonSprite.visible = game.mode !== 'interior';
  // Stars ride with the camera (same 160-unit trick as the discs) and
  // fade in only in true night: at dusk they are 0 (the golden-hour
  // drive keeps its clean sky), at night they sit at full 0.95.
  if (R.starPoints) {
    R.starPoints.position.copy(R.camera.position);
    R.starPoints.material.opacity = Math.max(0, Math.min(1, (night - 0.45) / 0.43)) * 0.95;
  }
  // Horizon glow: same azimuth as the sun, 160 units out, hugging the
  // skyline at about +7 units — full strength (0.55) at dusk, half that
  // at day, gone at night. The clamp on the light factor keeps it out
  // of the dark hours entirely.
  const phase = phaseAt(m);
  const duskWeight = phase === 'night' ? 0 : (phase === 'dusk' || phase === 'dawn') ? 1 : 0.5;
  const glowOpacity = Math.max(0, Math.min(1, (lf - 0.12) / 0.35)) * duskWeight * 0.55;
  _glowDir.set(_sunDir.x, 0, _sunDir.z).normalize();
  R.glowSprite.position.copy(R.camera.position).addScaledVector(_glowDir, 160);
  R.glowSprite.position.y = 7;
  R.glowSprite.material.opacity = glowOpacity;
}

// --- Camera ----------------------------------------------------------------

function updateChaseCamera(game, dt) {
  const cam = game.camera;
  const p = game.player;
  // While the helicopter is up, the chase camera pulls back and up and
  // aims a touch higher, so the air unit stays in frame instead of
  // circling just above the top edge (the old framing hid it).
  const heliUp = game.heli ? 1 : 0;
  const dist = chaseDist(p, game.settings) + heliUp * 3.5;
  const height = chaseHeight(p, game.settings) + heliUp * 3;
  // Look slightly below the horizon: the camera gazes down the street
  // at the player's feet, so rooftops and the road read with depth.
  const lookY = heliUp ? 2.6 : 1.0;
  const fx = Math.cos(cam.angle);
  const fz = Math.sin(cam.angle);
  const tx = pxTo3X(cam.x);
  const tz = pxTo3Z(cam.y);
  const eyeX = tx - fx * dist;
  const eyeZ = tz - fz * dist;
  const eyeY = height;
  const k = Math.min(1, dt * 6);
  cam.eyeX += (eyeX - cam.eyeX) * k;
  cam.eyeY += (eyeY - cam.eyeY) * k;
  cam.eyeZ += (eyeZ - cam.eyeZ) * k;
  const lookX = tx + fx * 7;
  const lookZ = tz + fz * 7;
  if (cam._snap) {
    // First frame after a snap (boot / ?shot= staging): put the eye and
    // the look point exactly where they belong, no lerp.
    cam.eyeX = eyeX; cam.eyeY = eyeY; cam.eyeZ = eyeZ;
    cam.lookX = lookX; cam.lookY = lookY; cam.lookZ = lookZ;
    cam._snap = false;
  }
  const lk = Math.min(1, dt * 8);
  cam.lookX += (lookX - cam.lookX) * lk;
  cam.lookY += (lookY - cam.lookY) * lk;
  cam.lookZ += (lookZ - cam.lookZ) * lk;
  R.camera.position.set(cam.eyeX, cam.eyeY, cam.eyeZ);
  R.camera.lookAt(cam.lookX, cam.lookY, cam.lookZ);
  // Scope zoom: aiming a rifle/sniper narrows the FOV (62 -> 30), a
  // smooth zoom rather than a snap — the scope has to change the view,
  // not just draw a circle on the HUD.
  const targetFov = game.scoped ? 30 : 62;
  if (Math.abs(R.camera.fov - targetFov) > 0.05) {
    R.camera.fov += (targetFov - R.camera.fov) * Math.min(1, dt * 10);
    R.camera.updateProjectionMatrix();
  }
  // Hero light + headlights ride with the player.
  R.heroLight.position.set(tx, 3.2, tz);
  if (p.inCar) {
    const car = p.inCar;
    const cx = pxTo3X(car.x);
    const cz = pxTo3Z(car.y);
    const cfx = Math.cos(car.angle);
    const cfz = Math.sin(car.angle);
    R.headSpot.position.set(cx + cfx * 2, 1.2, cz + cfz * 2);
    R.headSpot.target.position.set(cx + cfx * 22, 0.4, cz + cfz * 22);
    // Headlights blaze at night and dim to running lights by golden day.
    R.headSpot.intensity = 8 + (1 - lightFactor(game)) * 16;
  } else {
    R.headSpot.intensity = 0;
  }
}

// --- Public API ------------------------------------------------------------

export function render3D(game, dt) {
  if (!R) return;
  R.clock += dt;
  hideInteriorPlayer();
  updateLighting(game);
  updateChaseCamera(game, dt);
  syncCars(game);
  syncPeople(game);
  syncPickups(game);
  syncTracers(game);
  syncParticles(game);
  syncExplosions(game);
  syncBeacon(game);
  syncHeli(game);
  R.renderer.render(R.scene, R.camera);
  // Live phase readout for the harness (and anyone watching the cycle):
  // clock minutes, light factor, phase name, sky hex, fog density, and
  // the sun/moon disc opacities that prove which phase the sky is in.
  window.__sky = {
    time: game.time,
    light: lightFactor(game),
    phase: phaseAt(game.time),
    sky: '#' + R.scene.background.getHexString(),
    fog: R.scene.fog.density,
    sun: R.sunSprite.material.opacity,
    moon: R.moonSprite.material.opacity,
    glow: R.glowSprite.material.opacity,
    stars: R.starPoints ? R.starPoints.material.opacity : 0,
  };
  // Live render readout for the harness: pixel ratio, shadow map, FOV.
  window.__renderInfo = {
    pixelRatio: R.renderer.getPixelRatio(),
    shadowMap: R.renderer.shadowMap.enabled,
    fov: R.camera.fov,
    scoped: !!game.scoped,
  };
}

// Project a 2D world point (px) onto the HUD overlay (screen px, 1280x720).
// One reused vector — the old version allocated a fresh Vector3 per call,
// twice a frame, every frame.
const _projV = new THREE.Vector3();
export function projectToScreen(game, px, py) {
  if (!R) return { x: 640, y: 360, behind: true };
  const v = _projV.set(pxTo3X(px), 1.2, pxTo3Z(py));
  v.project(R.camera);
  return {
    x: (v.x * 0.5 + 0.5) * 1280,
    y: (-v.y * 0.5 + 0.5) * 720,
    behind: v.z > 1,
  };
}

// Raycast from a screen point onto the ground plane -> 2D world px.
// Used for mouse aim in 3D.
export function screenToWorld3D(game, sx, sy) {
  if (!R) return { x: game.player.x, y: game.player.y };
  const ndc = new THREE.Vector2((sx / 1280) * 2 - 1, -(sy / 720) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, R.camera);
  const t = -ray.ray.origin.y / ray.ray.direction.y;
  if (!Number.isFinite(t) || t < 0) return { x: game.player.x, y: game.player.y };
  const hit = ray.ray.origin.clone().add(ray.ray.direction.clone().multiplyScalar(t));
  return { x: (hit.x + HALF3D) / SCALE3D, y: (hit.z + HALF3D) / SCALE3D };
}

export function webglOk() {
  return !!R;
}

// --- Interiors (2D overlay, unchanged from the 2D game) -------------------
// Inside a building the world pauses and the room is drawn top-down on the
// overlay canvas. Furniture is drawn as labelled shapes so every room
// still reads: bed, table, rack, sofa, TV, counter and the green EXIT.
export function drawInterior(ctx, game) {
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  const it = game.interior;
  if (!it) return;
  ctx.fillStyle = '#07090e';
  ctx.fillRect(0, 0, vw, vh);
  const ox = Math.floor((vw - it.pxW) / 2);
  const oy = Math.floor((vh - it.pxH) / 2);
  if (it.floor === 'wood') {
    for (let i = 0; i < it.pxH / 16; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#8a6b4a' : '#7d5f42';
      ctx.fillRect(ox, oy + i * 16, it.pxW, 16);
    }
  } else if (it.floor === 'tile') {
    for (let ty = 0; ty < it.pxH / 32; ty++) {
      for (let tx = 0; tx < it.pxW / 32; tx++) {
        ctx.fillStyle = (tx + ty) % 2 === 0 ? '#c8d4d8' : '#b4c0c6';
        ctx.fillRect(ox + tx * 32, oy + ty * 32, 32, 32);
      }
    }
  } else {
    ctx.fillStyle = '#5a5f66';
    ctx.fillRect(ox, oy, it.pxW, it.pxH);
  }
  const FLOOR_COLORS = {
    bed: '#e8e4da', wardrobe: '#5c4028', lamp: '#ffd94a', maptable: '#e8dcc0',
    rack: '#3a2f26', shelf: '#5c4028', crate: '#8a6b3a', bench: '#6b6f76',
    tires: '#14161a', tools: '#6b4a2f', cabinet: '#7a7f86', drums: '#3a5a7d',
    desk: '#a87d4a', table: '#6b4a2f', chair: '#5c4028', sofa: '#5a4a7d',
    tv: '#1a1d22', rug: '#7d3a3a', counter: '#c8b89a', cashier: '#8a7a5a',
    plant: '#3a7d45', bookshelf: '#5c4028', lift: '#3a3a3a', stove: '#2a2f36',
    fridge: '#c8ccd2', sink: '#8a8f96', tub: '#f2f2f2', toilet: '#f2f2f2',
  };
  for (const f of it.furniture) {
    ctx.fillStyle = FLOOR_COLORS[f.kind] || '#8a8f96';
    ctx.fillRect(ox + f.x, oy + f.y, f.w, f.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(ox + f.x, oy + f.y, f.w, f.h);
    if (f.w >= 48 && f.h >= 20) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '10px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.kind.toUpperCase(), ox + f.x + f.w / 2, oy + f.y + f.h / 2 + 3);
      ctx.textAlign = 'left';
    }
  }
  for (const w of it.walls) {
    ctx.fillStyle = '#3a2f26';
    ctx.fillRect(ox + w.x, oy + w.y, w.w, w.h);
  }
  ctx.fillStyle = it.wall;
  ctx.fillRect(ox, oy, it.pxW, 32);
  ctx.fillRect(ox, oy, 32, it.pxH);
  ctx.fillRect(ox + it.pxW - 32, oy, 32, it.pxH);
  const doorL = it.pxW / 2 - 16;
  const doorR = it.pxW / 2 + 16;
  ctx.fillRect(ox, oy + it.pxH - 32, doorL, 32);
  ctx.fillRect(ox + doorR, oy + it.pxH - 32, it.pxW - doorR, 32);
  ctx.fillStyle = '#1a120a';
  ctx.fillRect(ox + doorL, oy + it.pxH - 32, 32, 32);
  ctx.fillStyle = '#3ecf6e';
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', ox + it.pxW / 2, oy + it.pxH - 38);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(it.name, vw / 2, oy - 12);
  ctx.textAlign = 'left';
  // The player, top-down: teal jacket, dark hair.
  const p = game.player;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(ox + p.x, oy + p.y + 3, 11, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a9d8f';
  ctx.fillRect(ox + p.x - 7, oy + p.y - 7, 14, 14);
  ctx.fillStyle = '#d8a878';
  ctx.beginPath();
  ctx.arc(ox + p.x, oy + p.y, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9fb0c8';
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Walk to the EXIT door to leave', vw / 2, oy + it.pxH + 24);
  ctx.textAlign = 'left';
}

// --- Interiors in 3D -------------------------------------------------------
// The same room layouts (interior.js) rendered as real 3D rooms with the
// city's own renderer: floor, walls, furniture boxes at their true
// heights, a green exit door, one warm light. The room lives 300 units
// east of the city (INT_X) — past the fog, so the city never leaks into
// the shot — and the camera rides high over Dario's shoulder, looking
// down into the room. The 2D overlay above stays as the fallback if this
// ever throws (main.js catches it).
const INT_X = 300;
const INT_Z = 0;

function roomTo3D(px, py) {
  return {
    x: (px - ROOM_PX_W / 2) * SCALE3D + INT_X,
    z: (py - ROOM_PX_H / 2) * SCALE3D + INT_Z,
  };
}

function buildInterior3D(game) {
  const it = game.interior;
  if (R.interiorGroups[it.kind]) return R.interiorGroups[it.kind];
  const g = new THREE.Group();
  const W = ROOM_PX_W * SCALE3D;
  const D = ROOM_PX_H * SCALE3D;
  const floorColor = it.floor === 'wood' ? '#8a6b4a' : it.floor === 'tile' ? '#c8d4d8' : '#5a5f66';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), lambert(floorColor));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(INT_X, 0, INT_Z);
  g.add(floor);
  // Outer walls, 3 units high; the south wall leaves a gap for the door.
  const wallMat = lambert(it.wall);
  const wallT = 0.8;
  const wallH = 3;
  const mkWall = (w, d, x, z) => {
    const m = box(w, wallH, d, wallMat);
    m.position.set(x, wallH / 2, z);
    g.add(m);
  };
  mkWall(W, wallT, INT_X, INT_Z - D / 2);
  mkWall(W / 2 - 1.6, wallT, INT_X - W / 4 - 0.8, INT_Z + D / 2);
  mkWall(W / 2 - 1.6, wallT, INT_X + W / 4 + 0.8, INT_Z + D / 2);
  mkWall(wallT, D, INT_X - W / 2, INT_Z);
  mkWall(wallT, D, INT_X + W / 2, INT_Z);
  // The EXIT door: a glowing green slab in the south gap.
  const door = box(3.2, 2.6, 0.3, basic('#3ecf6e'));
  door.position.set(INT_X, 1.3, INT_Z + D / 2);
  g.add(door);
  // Partition walls split the rooms, like the 2D layout.
  for (const w of it.walls) {
    const m = box(w.w * SCALE3D, wallH, w.h * SCALE3D, lambert('#3a2f26'));
    const c = roomTo3D(w.x + w.w / 2, w.y + w.h / 2);
    m.position.set(c.x, wallH / 2, c.z);
    g.add(m);
  }
  // Furniture: same positions as the 2D room, boxes at their true heights.
  for (const f of it.furniture) {
    const spec = furniture3D(f.kind);
    const m = box(f.w * SCALE3D, spec.h, f.h * SCALE3D, lambert(spec.color));
    const c = roomTo3D(f.x + f.w / 2, f.y + f.h / 2);
    m.position.set(c.x, spec.h / 2, c.z);
    g.add(m);
  }
  // One warm light over the room, so the wood and furniture read at night.
  const light = new THREE.PointLight(0xffe9a8, 0.9, 45, 1.4);
  light.position.set(INT_X, 7, INT_Z);
  g.add(light);
  g.visible = false;
  R.scene.add(g);
  R.interiorGroups[it.kind] = g;
  return g;
}

export function renderInterior3D(game, dt) {
  if (!R || !game.interior) return;
  R.clock += dt;
  updateLighting(game);
  const group = buildInterior3D(game);
  for (const k of Object.keys(R.interiorGroups)) {
    R.interiorGroups[k].visible = k === game.interior.kind;
  }
  // Dario, on foot in the room — the same person mesh as the city.
  if (!R.interiorPlayer) {
    R.interiorPlayer = makePersonMesh(game.player, false, true);
    R.scene.add(R.interiorPlayer);
  }
  const p = game.player;
  const pp = roomTo3D(p.x, p.y);
  R.interiorPlayer.visible = true;
  R.interiorPlayer.position.set(pp.x, 0, pp.z);
  R.interiorPlayer.rotation.y = -p.angle;
  syncPlayerWeapon(R.interiorPlayer, game);
  const swing = p.walking ? Math.sin(walkPhase(game)) * 0.55 : 0;
  R.interiorPlayer.userData.legL.rotation.x = swing;
  R.interiorPlayer.userData.legR.rotation.x = -swing;
  // High angled camera over the player's shoulder, looking down into the
  // room: the whole layout reads at a glance, like a doll's house.
  R.camera.position.set(pp.x, 13, pp.z + 9);
  R.camera.lookAt(pp.x, 0.5, pp.z - 2);
  R.heroLight.position.set(INT_X, 4, INT_Z);
  R.renderer.render(R.scene, R.camera);
  window.__sky = {
    time: game.time,
    light: lightFactor(game),
    phase: phaseAt(game.time),
    sky: '#' + R.scene.background.getHexString(),
    fog: R.scene.fog.density,
    sun: R.sunSprite.material.opacity,
    moon: R.moonSprite.material.opacity,
    glow: R.glowSprite.material.opacity,
    stars: R.starPoints ? R.starPoints.material.opacity : 0,
  };
}

export function hideInteriorPlayer() {
  if (R && R.interiorPlayer) R.interiorPlayer.visible = false;
  if (R) {
    for (const k of Object.keys(R.interiorGroups)) R.interiorGroups[k].visible = false;
  }
}
