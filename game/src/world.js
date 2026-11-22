// Solmar City: a seeded 96x96 tile grid. Roads run every 8 tiles, blocks fill
// with buildings, and five districts give the city its character — Downtown
// towers, Ironworks warehouses, Central Park green, Harbor containers and the
// southern beach. Everything is deterministic from the seed.
import { TILE, MAP_W, MAP_H, T, DISTRICTS } from './config.js';

const ROAD_AT = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88];

function districtAt(tx, ty) {
  for (const d of DISTRICTS) {
    if (tx >= d.x0 && tx <= d.x1 && ty >= d.y0 && ty <= d.y1) return d;
  }
  return DISTRICTS[0];
}

export function createWorld(rng) {
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const buildings = [];
  const isRoadLine = (v) => ROAD_AT.includes(v) || ROAD_AT.includes(v - 1);

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (ty >= 92) tiles[ty * MAP_W + tx] = T.WATER;
      else if (ty >= 88) tiles[ty * MAP_W + tx] = T.BEACH;
      else if (isRoadLine(tx) || isRoadLine(ty)) tiles[ty * MAP_W + tx] = T.ROAD;
      else tiles[ty * MAP_W + tx] = T.BLOCK;
    }
  }

  // Central Park: a green rectangle in the middle of the central district.
  for (let ty = 48; ty <= 60; ty++) {
    for (let tx = 16; tx <= 40; tx++) {
      if (tiles[ty * MAP_W + tx] === T.BLOCK) tiles[ty * MAP_W + tx] = T.PARK;
    }
  }

  // Buildings fill every block that is not road, park, beach or water.
  for (let by = 0; by < 12; by++) {
    for (let bx = 0; bx < 12; bx++) {
      const x0 = bx * 8 + 2;
      const y0 = by * 8 + 2;
      if (y0 >= 88) continue;
      const cx = x0 + 2;
      const cy = y0 + 2;
      if (tiles[cy * MAP_W + cx] === T.PARK) continue;
      const d = districtAt(cx, cy);
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i++) {
        const bw = rng.int(2, 3) * TILE;
        const bh = rng.int(2, 3) * TILE;
        const px = (x0 + rng.int(0, Math.max(0, 6 - Math.ceil(bw / TILE)))) * TILE;
        const py = (y0 + rng.int(0, Math.max(0, 6 - Math.ceil(bh / TILE)))) * TILE;
        const floors = d.skyline ? rng.int(3, 9) : rng.int(1, 3);
        buildings.push({
          x: px, y: py, w: bw, h: bh, floors,
          color: rng.pick(d.palette), district: d.id,
          roof: rng.pick(['#2a2f3a', '#3a2f2a', '#2f3a2f']),
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
    gunsmith: { ...nearRoad(64, 24), name: 'Ironworks Gunsmith' },
    garage: { ...nearRoad(72, 56), name: 'Pit Stop Garage' },
    clinic: { ...nearRoad(40, 80), name: 'Sunshine Clinic' },
  };
  const bank = { ...nearRoad(24, 16), name: 'Solmar National Bank' };
  const pizza = { ...nearRoad(32, 32), name: 'Slice House Pizza' };
  const hideout = { ...nearRoad(24, 52), name: 'Rico\u2019s Hideout' };
  const spawn = { x: hideout.x + 40, y: hideout.y + 40 };
  const beach = { ...nearRoad(48, 88), name: 'Solmar Beach' };

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
    const along = rng.int(6, 90);
    if (vertical) return { x: (line + 0.5) * TILE, y: along * TILE };
    return { x: along * TILE, y: (line + 0.5) * TILE };
  }

  return {
    tiles, buildings, shops, bank, pizza, hideout, spawn, beach,
    tileAt, isRoadTile, isWalkableTile, buildingAt, randomRoadPoint,
  };
}
