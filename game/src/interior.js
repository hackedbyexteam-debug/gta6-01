// Interiors: walk into a door on a key building's south face and you step
// inside a real place — not one empty generic room. Every building has its
// OWN layout: a living room with sofa + TV, a kitchen with stove + fridge,
// a bedroom with bed + wardrobe + lamp, a bathroom with tub + sink, a
// hallway, shop racks + a cashier, a hideout with a map table and weapons
// on the wall. Partition walls split the rooms; furniture is decorative
// (collision only) — no new mechanics, the harness still drives enter/exit
// through these exact functions. Pure logic, no DOM.
import { TILE } from './config.js';

export const ROOM_W = 18; // tiles
export const ROOM_H = 12; // tiles
export const ROOM_PX_W = ROOM_W * TILE;
export const ROOM_PX_H = ROOM_H * TILE;
const WALL = TILE; // wall thickness in px

// 3D presence for every furniture kind: height in three.js units and the
// colour the 3D room builder (render.js) gives the box. Rugs lie flat,
// wardrobes and racks stand tall — the same layout data drives the 2D
// overlay fallback and the 3D room, so the two can never disagree about
// where anything is.
export const FURNITURE_3D = {
  bed: { h: 0.8, color: '#e8e4da' },
  wardrobe: { h: 2.0, color: '#5c4028' },
  lamp: { h: 1.2, color: '#ffd94a' },
  maptable: { h: 1.0, color: '#e8dcc0' },
  rack: { h: 2.2, color: '#3a2f26' },
  shelf: { h: 2.0, color: '#5c4028' },
  crate: { h: 0.8, color: '#8a6b3a' },
  bench: { h: 0.9, color: '#6b6f76' },
  tires: { h: 0.7, color: '#14161a' },
  tools: { h: 0.4, color: '#6b4a2f' },
  cabinet: { h: 1.8, color: '#7a7f86' },
  drums: { h: 1.1, color: '#3a5a7d' },
  desk: { h: 1.0, color: '#a87d4a' },
  table: { h: 0.9, color: '#6b4a2f' },
  chair: { h: 0.9, color: '#5c4028' },
  sofa: { h: 0.9, color: '#5a4a7d' },
  tv: { h: 0.7, color: '#1a1d22' },
  rug: { h: 0.06, color: '#7d3a3a' },
  counter: { h: 1.1, color: '#c8b89a' },
  cashier: { h: 1.1, color: '#8a7a5a' },
  plant: { h: 1.0, color: '#3a7d45' },
  bookshelf: { h: 2.2, color: '#5c4028' },
  lift: { h: 0.5, color: '#3a3a3a' },
  stove: { h: 1.0, color: '#2a2f36' },
  fridge: { h: 1.9, color: '#c8ccd2' },
  sink: { h: 0.9, color: '#8a8f96' },
  tub: { h: 0.7, color: '#f2f2f2' },
  toilet: { h: 0.6, color: '#f2f2f2' },
};

export function furniture3D(kind) {
  return FURNITURE_3D[kind] || { h: 0.9, color: '#8a8f96' };
}

// Furniture: {x, y, w, h, kind, solid?} in room-local px. Partitions in
// `walls` are solid rects that split the room into living/kitchen/bed/bath.
const LAYOUTS = {
  hideout: {
    floor: 'wood', wall: '#6b5138',
    walls: [{ x: 176, y: 32, w: 12, h: 128 }],
    furniture: [
      { x: 48, y: 48, w: 96, h: 64, kind: 'bed' },
      { x: 48, y: 140, w: 48, h: 72, kind: 'wardrobe' },
      { x: 48, y: 240, w: 32, h: 32, kind: 'lamp' },
      { x: 216, y: 48, w: 120, h: 56, kind: 'maptable' },
      { x: 360, y: 40, w: 160, h: 20, kind: 'rack' },
      { x: 256, y: 176, w: 96, h: 56, kind: 'table' },
      { x: 232, y: 192, w: 24, h: 24, kind: 'chair' },
      { x: 368, y: 192, w: 24, h: 24, kind: 'chair' },
      { x: 240, y: 166, w: 128, h: 88, kind: 'rug', solid: false },
      { x: 448, y: 160, w: 80, h: 40, kind: 'counter' },
      { x: 400, y: 300, w: 96, h: 40, kind: 'sofa' },
      { x: 520, y: 48, w: 24, h: 24, kind: 'plant' },
    ],
  },
  gunsmith: {
    floor: 'concrete', wall: '#4a4a52',
    walls: [],
    furniture: [
      { x: 48, y: 40, w: 120, h: 20, kind: 'rack' },
      { x: 200, y: 40, w: 120, h: 20, kind: 'rack' },
      { x: 400, y: 40, w: 120, h: 20, kind: 'shelf' },
      { x: 180, y: 120, w: 120, h: 40, kind: 'counter' },
      { x: 320, y: 120, w: 96, h: 40, kind: 'counter' },
      { x: 252, y: 168, w: 56, h: 40, kind: 'cashier' },
      { x: 48, y: 280, w: 64, h: 48, kind: 'crate' },
      { x: 128, y: 280, w: 64, h: 48, kind: 'crate' },
      { x: 400, y: 280, w: 120, h: 48, kind: 'bench' },
      { x: 240, y: 280, w: 64, h: 48, kind: 'tires' },
    ],
  },
  garage: {
    floor: 'concrete', wall: '#3d4a3a',
    walls: [{ x: 384, y: 32, w: 12, h: 128 }],
    furniture: [
      { x: 48, y: 40, w: 160, h: 40, kind: 'bench' },
      { x: 240, y: 40, w: 64, h: 48, kind: 'tires' },
      { x: 320, y: 40, w: 56, h: 16, kind: 'tools' },
      { x: 416, y: 40, w: 80, h: 40, kind: 'cabinet' },
      { x: 48, y: 280, w: 48, h: 48, kind: 'drums' },
      { x: 112, y: 280, w: 48, h: 48, kind: 'drums' },
      { x: 400, y: 280, w: 120, h: 48, kind: 'bench' },
      { x: 240, y: 200, w: 128, h: 80, kind: 'lift', solid: false },
    ],
  },
  clinic: {
    floor: 'tile', wall: '#7db8c8',
    walls: [{ x: 176, y: 32, w: 12, h: 112 }],
    furniture: [
      { x: 48, y: 48, w: 96, h: 56, kind: 'bed' },
      { x: 48, y: 140, w: 48, h: 48, kind: 'sink' },
      { x: 216, y: 48, w: 96, h: 56, kind: 'bed' },
      { x: 336, y: 48, w: 96, h: 56, kind: 'bed' },
      { x: 180, y: 160, w: 216, h: 40, kind: 'desk' },
      { x: 216, y: 216, w: 24, h: 24, kind: 'chair' },
      { x: 288, y: 216, w: 24, h: 24, kind: 'chair' },
      { x: 360, y: 216, w: 24, h: 24, kind: 'chair' },
      { x: 448, y: 280, w: 80, h: 40, kind: 'cabinet' },
      { x: 48, y: 280, w: 80, h: 40, kind: 'cabinet' },
      { x: 520, y: 48, w: 24, h: 24, kind: 'plant' },
    ],
  },
  // House 1 — Beach Cottage: living room + kitchen, split by a counter wall.
  house1: {
    floor: 'wood', wall: '#8a7a5a',
    walls: [{ x: 320, y: 32, w: 12, h: 160 }],
    furniture: [
      { x: 48, y: 48, w: 112, h: 40, kind: 'sofa' },
      { x: 48, y: 104, w: 80, h: 16, kind: 'tv' },
      { x: 200, y: 160, w: 96, h: 56, kind: 'table' },
      { x: 176, y: 176, w: 24, h: 24, kind: 'chair' },
      { x: 312, y: 176, w: 24, h: 24, kind: 'chair' },
      { x: 160, y: 150, w: 160, h: 96, kind: 'rug', solid: false },
      { x: 352, y: 48, w: 64, h: 48, kind: 'fridge' },
      { x: 432, y: 48, w: 64, h: 48, kind: 'stove' },
      { x: 352, y: 120, w: 160, h: 40, kind: 'counter' },
      { x: 352, y: 200, w: 64, h: 48, kind: 'sink' },
      { x: 448, y: 280, w: 80, h: 40, kind: 'counter' },
      { x: 48, y: 280, w: 24, h: 24, kind: 'plant' },
    ],
  },
  // House 2 — Parkside Home: bedroom + bathroom in the corner.
  house2: {
    floor: 'wood', wall: '#6b5a6b',
    walls: [
      { x: 320, y: 224, w: 12, h: 128 },
      { x: 320, y: 224, w: 160, h: 12 },
    ],
    furniture: [
      { x: 48, y: 48, w: 96, h: 64, kind: 'bed' },
      { x: 160, y: 48, w: 48, h: 72, kind: 'wardrobe' },
      { x: 48, y: 140, w: 32, h: 32, kind: 'lamp' },
      { x: 240, y: 48, w: 96, h: 56, kind: 'table' },
      { x: 240, y: 160, w: 128, h: 88, kind: 'rug', solid: false },
      { x: 352, y: 48, w: 112, h: 40, kind: 'sofa' },
      { x: 352, y: 104, w: 80, h: 16, kind: 'tv' },
      { x: 352, y: 256, w: 72, h: 40, kind: 'tub' },
      { x: 440, y: 256, w: 48, h: 40, kind: 'sink' },
      { x: 496, y: 256, w: 28, h: 32, kind: 'toilet' },
      { x: 48, y: 280, w: 24, h: 24, kind: 'plant' },
    ],
  },
  // House 3 — Harbor Flat: living room + big dining table + kitchenette.
  house3: {
    floor: 'wood', wall: '#5a6b7d',
    walls: [],
    furniture: [
      { x: 48, y: 48, w: 112, h: 40, kind: 'sofa' },
      { x: 48, y: 104, w: 80, h: 16, kind: 'tv' },
      { x: 200, y: 48, w: 48, h: 96, kind: 'bookshelf' },
      { x: 288, y: 48, w: 160, h: 72, kind: 'table' },
      { x: 264, y: 64, w: 24, h: 24, kind: 'chair' },
      { x: 264, y: 96, w: 24, h: 24, kind: 'chair' },
      { x: 448, y: 64, w: 24, h: 24, kind: 'chair' },
      { x: 448, y: 96, w: 24, h: 24, kind: 'chair' },
      { x: 272, y: 40, w: 192, h: 104, kind: 'rug', solid: false },
      { x: 48, y: 200, w: 64, h: 48, kind: 'fridge' },
      { x: 128, y: 200, w: 64, h: 48, kind: 'stove' },
      { x: 208, y: 200, w: 120, h: 40, kind: 'counter' },
      { x: 352, y: 200, w: 64, h: 48, kind: 'sink' },
      { x: 448, y: 280, w: 80, h: 40, kind: 'counter' },
      { x: 48, y: 280, w: 24, h: 24, kind: 'plant' },
    ],
  },
  // House 4 — Downtown Loft: bedroom corner + living room + kitchen.
  house4: {
    floor: 'wood', wall: '#7d5a4a',
    walls: [
      { x: 176, y: 32, w: 12, h: 112 },
      { x: 384, y: 224, w: 12, h: 128 },
      { x: 384, y: 224, w: 128, h: 12 },
    ],
    furniture: [
      { x: 48, y: 48, w: 96, h: 64, kind: 'bed' },
      { x: 48, y: 140, w: 48, h: 72, kind: 'wardrobe' },
      { x: 216, y: 48, w: 112, h: 40, kind: 'sofa' },
      { x: 216, y: 104, w: 80, h: 16, kind: 'tv' },
      { x: 352, y: 48, w: 96, h: 56, kind: 'table' },
      { x: 352, y: 160, w: 128, h: 88, kind: 'rug', solid: false },
      { x: 48, y: 240, w: 64, h: 48, kind: 'fridge' },
      { x: 128, y: 240, w: 64, h: 48, kind: 'stove' },
      { x: 208, y: 240, w: 120, h: 40, kind: 'counter' },
      { x: 416, y: 256, w: 72, h: 40, kind: 'tub' },
      { x: 496, y: 256, w: 28, h: 32, kind: 'toilet' },
      { x: 48, y: 300, w: 32, h: 32, kind: 'lamp' },
    ],
  },
};

export function createInterior(enterable) {
  const layout = LAYOUTS[enterable.kind] || LAYOUTS.house1;
  const pxW = ROOM_PX_W;
  const pxH = ROOM_PX_H;
  return {
    kind: enterable.kind,
    name: enterable.name,
    floor: layout.floor,
    wall: layout.wall,
    pxW, pxH,
    walls: layout.walls.map((w) => ({ ...w })),
    furniture: layout.furniture.map((f) => ({ ...f, solid: f.solid !== false })),
    exit: { x: pxW / 2, y: pxH - WALL / 2 },
    spawn: { x: pxW / 2, y: pxH - WALL - 56 },
  };
}

// The door (world coords) the player is standing on, if any.
export function interiorDoorAt(world, x, y) {
  for (const e of world.enterables) {
    if (Math.hypot(e.doorX - x, e.doorY - y) < 26) return e;
  }
  return null;
}

export function enterInterior(game, enterable) {
  const interior = createInterior(enterable);
  game.interiorReturn = { x: enterable.doorX, y: enterable.doorY + 26 };
  game.interior = interior;
  game.mode = 'interior';
  game.player.x = interior.spawn.x;
  game.player.y = interior.spawn.y;
  game.player.angle = -Math.PI / 2;
  game.player.inCar = null;
  game.banner = { text: `${interior.name} — walk to the door to exit`, life: 3 };
  return interior;
}

export function exitInterior(game) {
  const ret = game.interiorReturn || { x: game.world.hideout.x, y: game.world.hideout.y };
  game.mode = 'outdoor';
  game.interior = null;
  game.player.x = ret.x;
  game.player.y = ret.y;
  game.player.angle = Math.PI / 2;
  game.interiorCooldown = 1.2;
  return ret;
}

function pushOutCircleRect(p, r) {
  const nx = Math.max(r.x, Math.min(p.x, r.x + r.w));
  const ny = Math.max(r.y, Math.min(p.y, r.y + r.h));
  const dx = p.x - nx;
  const dy = p.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 < p.radius * p.radius) {
    const d = Math.sqrt(d2) || 0.001;
    p.x = nx + (dx / d) * p.radius;
    p.y = ny + (dy / d) * p.radius;
  }
}

// On-foot movement inside a room: walls + partitions + solid furniture stop you.
export function updateInteriorPlayer(p, move, dt, interior) {
  const speed = move.sprint ? 210 : 135;
  const mx = (move.right ? 1 : 0) - (move.left ? 1 : 0);
  const my = (move.down ? 1 : 0) - (move.up ? 1 : 0);
  p.walking = mx !== 0 || my !== 0;
  if (p.walking) {
    const len = Math.hypot(mx, my) || 1;
    const nx = p.x + (mx / len) * speed * dt;
    const ny = p.y + (my / len) * speed * dt;
    p.angle = Math.atan2(my, mx);
    p.x = nx;
    p.y = ny;
  }
  // Walls (inner face).
  p.x = Math.max(WALL + p.radius, Math.min(interior.pxW - WALL - p.radius, p.x));
  p.y = Math.max(WALL + p.radius, Math.min(interior.pxH - WALL - p.radius, p.y));
  // Partition walls + solid furniture: circle vs rect push-out.
  for (const w of interior.walls) pushOutCircleRect(p, w);
  for (const f of interior.furniture) {
    if (f.solid) pushOutCircleRect(p, f);
  }
  // A push-out near the room edge can shove the player through the wall,
  // so clamp again after resolving collisions.
  p.x = Math.max(WALL + p.radius, Math.min(interior.pxW - WALL - p.radius, p.x));
  p.y = Math.max(WALL + p.radius, Math.min(interior.pxH - WALL - p.radius, p.y));
  p.punchTimer = Math.max(0, p.punchTimer - dt);
  p.shootTimer = Math.max(0, p.shootTimer - dt);
}
