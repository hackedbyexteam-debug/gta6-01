// Solmar City: a seeded 64x64 tile grid, denser and smaller than before.
// Roads run every 8 tiles, blocks hold ONE well-built building each (fewer,
// much nicer than 257 flat boxes), and five districts give the city its
// character — Downtown towers, Ironworks warehouses, Central Park green,
// Harbor containers and the southern beach. Key buildings have a door on
// their south face: walk into it and you step inside (see interior.js).
// Everything is deterministic from the seed.
import { TILE, MAP_W, MAP_H, T, DISTRICTS } from './config.js';

const ROAD_AT = [8, 16, 24, 32, 40, 48, 56];

function districtAt(tx, ty) {
  for (const d of DISTRICTS) {
    if (tx >= d.x0 && tx <= d.x1 && ty >= d.y0 && ty <= d.y1) return d;
  }
  return DISTRICTS[0];
}

// Roof palettes by building style.
const ROOFS = {
  house: ['#a85a3a', '#7a4a3a', '#5a6b4a', '#8a6b3a', '#6b4a5a'],
  tower: ['#2a2f3a', '#3a3f4a', '#232830'],
  warehouse: ['#4a3d33', '#5c4a3a', '#3d3a35'],
  apartment: ['#3a2f2a', '#2f3a2f', '#4a3a2f'],
  shop: ['#2f4a5c', '#5c3a4a', '#3a4a3a'],
};

export function createWorld(rng) {
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const buildings = [];
  const isRoadLine = (v) => ROAD_AT.includes(v) || ROAD_AT.includes(v - 1);

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (ty >= 60) tiles[ty * MAP_W + tx] = T.WATER;
      else if (ty >= 56) tiles[ty * MAP_W + tx] = T.BEACH;
      else if (isRoadLine(tx) || isRoadLine(ty)) tiles[ty * MAP_W + tx] = T.ROAD;
      else tiles[ty * MAP_W + tx] = T.BLOCK;
    }
  }

  // Central Park: a green rectangle in the middle of the central district.
  for (let ty = 31; ty <= 41; ty++) {
    for (let tx = 11; tx <= 29; tx++) {
      if (tiles[ty * MAP_W + tx] === T.BLOCK) tiles[ty * MAP_W + tx] = T.PARK;
    }
  }

  // One or two well-built buildings per block (never in the park, beach or water).
  for (let by = 0; by < 8; by++) {
    for (let bx = 0; bx < 8; bx++) {
      const x0 = bx * 8 + 2;
      const y0 = by * 8 + 2;
      if (y0 >= 56) continue;
      const cx = x0 + 2;
      const cy = y0 + 2;
      if (tiles[cy * MAP_W + cx] === T.PARK) continue;
      const d = districtAt(cx, cy);
      const count = rng.int(1, 2);
      for (let i = 0; i < count; i++) {
        const bw = rng.int(3, 5) * TILE;
        const bh = rng.int(3, 4) * TILE;
        const px = (x0 + rng.int(0, Math.max(0, 6 - Math.ceil(bw / TILE)))) * TILE;
        const py = (y0 + rng.int(0, Math.max(0, 6 - Math.ceil(bh / TILE)))) * TILE;
        // Don't stack two buildings on top of each other in one block.
        if (buildings.some((b) => px < b.x + b.w + 8 && px + bw + 8 > b.x && py < b.y + b.h + 8 && py + bh + 8 > b.y)) continue;
        const floors = d.skyline ? rng.int(3, 9) : rng.int(1, 3);
        let style;
        if (d.id === 'downtown') style = rng.pick(['tower', 'tower', 'apartment']);
        else if (d.id === 'ironworks') style = 'warehouse';
        else if (d.id === 'harbor') style = rng.pick(['apartment', 'warehouse']);
        else if (d.id === 'beach') style = 'house';
        else style = rng.pick(['house', 'house', 'apartment']);
        buildings.push({
          id: buildings.length,
          x: px, y: py, w: bw, h: bh, floors, style,
          color: rng.pick(d.palette), district: d.id,
          roof: rng.pick(ROOFS[style]),
          enterable: false, kind: null, doorX: 0, doorY: 0,
        });
      }
    }
  }

  function roadPoint(tx, ty) {
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  function nearRoad(tx, ty) {
    return roadPoint(tx, ty);
  }

  const shops = {
    gunsmith: { ...nearRoad(44, 16), name: 'Ironworks Gunsmith' },
    garage: { ...nearRoad(48, 36), name: 'Pit Stop Garage' },
    clinic: { ...nearRoad(28, 52), name: 'Sunshine Clinic' },
  };
  const bank = { ...nearRoad(16, 12), name: 'Solmar National Bank' };
  const pizza = { ...nearRoad(24, 24), name: 'Slice House Pizza' };
  const hideout = { ...nearRoad(16, 36), name: 'Rico\u2019s Hideout' };
  const spawn = { x: hideout.x + 40, y: hideout.y + 40 };
  const beach = { ...nearRoad(32, 56), name: 'Solmar Beach' };

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return T.BLOCK;
    return tiles[ty * MAP_W + tx];
  }
  function isRoadTile(tx, ty) {
    const t = tileAt(tx, ty);
    return t === T.ROAD || t === T.WALK;
  }
  function isWalkableTile(tx, ty) {
    const t = tileAt(tx, ty);
    return t === T.ROAD || t === T.WALK || t === T.PARK || t === T.BEACH;
  }
  function buildingAt(px, py) {
    for (const b of buildings) {
      if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) return b;
    }
    return null;
  }
  function randomRoadPoint() {
    const vertical = rng.chance(0.5);
    const line = rng.pick(ROAD_AT);
    const along = rng.int(6, 58);
    if (vertical) return { x: (line + 0.5) * TILE, y: along * TILE };
    return { x: along * TILE, y: (line + 0.5) * TILE };
  }

  // Enterable buildings: a door on the south face, just outside the wall.
  // The door spot must be free ground (not inside another building).
  function freeDoorSpot(b) {
    for (let dx = 16; dx <= b.w - 16; dx += 16) {
      const x = b.x + dx;
      const y = b.y + b.h + 8;
      if (!buildingAt(x, y) && !buildingAt(x, y + 14)) return { x, y };
    }
    return null;
  }
  function nearestBuilding(pt) {
    let best = null;
    let bestD = Infinity;
    for (const b of buildings) {
      const d = Math.hypot(b.x + b.w / 2 - pt.x, b.y + b.h / 2 - pt.y);
      if (d < bestD) { best = b; bestD = d; }
    }
    return best;
  }
  function markEnterable(pt, kind, name) {
    const b = nearestBuilding(pt);
    if (!b || b.enterable) return null;
    const door = freeDoorSpot(b);
    if (!door) return null;
    b.enterable = true;
    b.kind = kind;
    b.doorX = door.x;
    b.doorY = door.y;
    return { building: b, kind, name, doorX: door.x, doorY: door.y };
  }
  const enterables = [];
  const e1 = markEnterable(hideout, 'hideout', 'Rico\u2019s Hideout');
  if (e1) enterables.push(e1);
  const e2 = markEnterable(shops.gunsmith, 'gunsmith', 'Ironworks Gunsmith');
  if (e2) enterables.push(e2);
  const e3 = markEnterable(shops.garage, 'garage', 'Pit Stop Garage');
  if (e3) enterables.push(e3);
  const e4 = markEnterable(shops.clinic, 'clinic', 'Sunshine Clinic');
  if (e4) enterables.push(e4);
  // Four ordinary houses spread across the residential districts — each
  // with its OWN interior layout (Beach Cottage, Parkside Home, Harbor
  // Flat, Downtown Loft), never the same room twice.
  const houseSpots = [
    { pt: { x: (20 + 0.5) * TILE, y: (52 + 0.5) * TILE }, kind: 'house1', name: 'Beach Cottage' },
    { pt: { x: (12 + 0.5) * TILE, y: (44 + 0.5) * TILE }, kind: 'house2', name: 'Parkside Home' },
    { pt: { x: (44 + 0.5) * TILE, y: (52 + 0.5) * TILE }, kind: 'house3', name: 'Harbor Flat' },
    { pt: { x: (52 + 0.5) * TILE, y: (12 + 0.5) * TILE }, kind: 'house4', name: 'Downtown Loft' },
  ];
  for (const s of houseSpots) {
    const e = markEnterable(s.pt, s.kind, s.name);
    if (e) enterables.push(e);
  }

  return {
    tiles, buildings, shops, bank, pizza, hideout, spawn, beach, enterables,
    tileAt, isRoadTile, isWalkableTile, buildingAt, randomRoadPoint,
  };
}
