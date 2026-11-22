// World and entity rendering: real asphalt with lane markings, sidewalks and
// zebra crossings, buildings with pseudo-3D extrusion and per-district
// styles (pitched house roofs, tower AC units, warehouse skylights, shop
// awnings), people drawn as actual figures with legs, arms, hair and a
// held weapon, cars as real shapes per type, and furnished interiors.
// 2.5D Canvas only — no WebGL, so every frame can be verified headlessly.
import { TILE, T, MAP_W, MAP_H, WORLD_W, WORLD_H } from './config.js';
import { viewBounds, worldToScreen } from './camera.js';
import { carShape } from './vehicles.js';
import { weaponShape } from './combat.js';

const ROAD_AT = [8, 16, 24, 32, 40, 48, 56];
// Arterial roads get a double yellow centre line; side streets a white dash.
const ARTERIAL = new Set([8, 24, 40, 56]);

const TILE_COLORS = {
  [T.BLOCK]: '#23272e',
  [T.ROAD]: '#22252a',
  [T.WALK]: '#3a3f46',
  [T.PARK]: '#2f5c3a',
  [T.BEACH]: '#c2a878',
  [T.WATER]: '#2a5a7a',
};

// Deterministic 0..1 hash for tile decoration (no rng in the render loop).
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 1000) / 1000;
}

function shade(hex, pct) {
  // pct -100..100: darken / lighten a #rrggbb colour.
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const f = pct / 100;
  if (f >= 0) {
    r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f;
  } else {
    r *= 1 + f; g *= 1 + f; b *= 1 + f;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function lightFactor(game) {
  // 0 = deep night, 1 = full day.
  const m = game.time % 1440;
  if (m >= 420 && m < 1020) return 1;
  if (m >= 1020 && m < 1140) return 1 - (m - 1020) / 120 * 0.55;
  if (m >= 1140 || m < 300) return 0.45;
  if (m >= 300 && m < 420) return 0.45 + (m - 300) / 120 * 0.55;
  return 1;
}

export function drawWorld(ctx, game, cam) {
  // Everything here is drawn in WORLD coords: render() wraps the call in
  // the camera transform (translate -> scale -> rotate -> translate), so
  // the view zooms and turns with the player. Culling uses the view's
  // world-space AABB (viewBounds), never screen px.
  const { world } = game;
  const bounds = viewBounds(cam);
  const x0 = Math.max(0, Math.floor(bounds.x0 / TILE));
  const y0 = Math.max(0, Math.floor(bounds.y0 / TILE));
  const x1 = Math.min(MAP_W - 1, Math.ceil(bounds.x1 / TILE));
  const y1 = Math.min(MAP_H - 1, Math.ceil(bounds.y1 / TILE));

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = world.tileAt(tx, ty);
      const px = tx * TILE;
      const py = ty * TILE;
      ctx.fillStyle = TILE_COLORS[t];
      ctx.fillRect(px, py, TILE, TILE);
      if (t === T.ROAD) {
        // Asphalt speckle, cracks, patches and the odd manhole.
        const h = hash2(tx, ty);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(px + ((tx * 11) % 20), py + ((ty * 7) % 20), 3, 2);
        ctx.fillRect(px + ((tx * 5 + 9) % 24), py + ((ty * 13 + 5) % 24), 2, 2);
        if (h < 0.07) {
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 6, py + 8);
          ctx.lineTo(px + 16, py + 14);
          ctx.lineTo(px + 12, py + 26);
          ctx.stroke();
        } else if (h < 0.12) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(px + 4, py + 6, 20, 14);
        } else if (h < 0.15) {
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.beginPath();
          ctx.arc(px + 16, py + 16, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.beginPath();
          ctx.arc(px + 16, py + 16, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Close-up detail the zoom exposes: skid marks, oil stains, drains.
        if (h >= 0.15 && h < 0.20) {
          ctx.strokeStyle = 'rgba(0,0,0,0.28)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(px + 8, py + 4);
          ctx.quadraticCurveTo(px + 14, py + 16, px + 10, py + 28);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(px + 20, py + 4);
          ctx.quadraticCurveTo(px + 26, py + 16, px + 22, py + 28);
          ctx.stroke();
          ctx.lineWidth = 1;
        } else if (h >= 0.20 && h < 0.24) {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(px + 16, py + 16, 9, 6, 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.beginPath();
          ctx.ellipse(px + 20, py + 20, 5, 3, 0.4, 0, Math.PI * 2);
          ctx.fill();
        } else if (h >= 0.24 && h < 0.28) {
          ctx.fillStyle = '#14161a';
          ctx.fillRect(px + TILE - 10, py + 8, 6, 16);
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 1;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(px + TILE - 9, py + 11 + i * 5);
            ctx.lineTo(px + TILE - 5, py + 11 + i * 5);
            ctx.stroke();
          }
        }
        // Sidewalk strip where the road meets a block.
        const isV = ROAD_AT.includes(tx) || ROAD_AT.includes(tx - 1);
        const isH = ROAD_AT.includes(ty) || ROAD_AT.includes(ty - 1);
        ctx.fillStyle = '#3d424b';
        if (isV) {
          if (world.tileAt(tx - 1, ty) === T.BLOCK) ctx.fillRect(px, py, 7, TILE);
          if (world.tileAt(tx + 1, ty) === T.BLOCK) ctx.fillRect(px + TILE - 7, py, 7, TILE);
        }
        if (isH) {
          if (world.tileAt(tx, ty - 1) === T.BLOCK) ctx.fillRect(px, py, TILE, 7);
          if (world.tileAt(tx, ty + 1) === T.BLOCK) ctx.fillRect(px, py + TILE - 7, TILE, 7);
        }
      } else if (t === T.WALK) {
        // Paving seams + the odd fallen leaf / bit of litter: the sidewalk
        // reads as slabs up close instead of one flat grey sheet.
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + 16, py); ctx.lineTo(px + 16, py + TILE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px, py + 16); ctx.lineTo(px + TILE, py + 16); ctx.stroke();
        const hw = hash2(tx, ty);
        if (hw < 0.2) {
          ctx.fillStyle = hw < 0.1 ? '#b98a3a' : '#7d8a4a';
          ctx.beginPath();
          ctx.ellipse(px + 8 + (tx % 14), py + 10 + (ty % 12), 3, 2, 0.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (hw < 0.28) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(px + 6 + (tx % 18), py + 8 + (ty % 14), 3, 2);
        }
      } else if (t === T.PARK) {
        // Grass texture + trees with shadows, bushes.
        const h = hash2(tx, ty);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(px + ((tx * 9) % 22), py + ((ty * 11) % 22), 4, 2);
        if (h < 0.22) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.ellipse(px + 18, py + 20, 12, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = h < 0.11 ? '#3a7d45' : '#2a6b35';
          ctx.beginPath();
          ctx.arc(px + 16, py + 14, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#4a8d55';
          ctx.beginPath();
          ctx.arc(px + 12, py + 10, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#4a3a28';
          ctx.fillRect(px + 14, py + 20, 4, 6);
        } else if (h < 0.3) {
          ctx.fillStyle = '#27512f';
          ctx.beginPath();
          ctx.arc(px + 16, py + 16, 6, 0, Math.PI * 2);
          ctx.fill();
        } else if (h < 0.38) {
          // Wildflowers: tiny coloured dots in the grass.
          const cols = ['#e8b73a', '#c86b8a', '#e8e8e8'];
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = cols[(i + tx + ty) % 3];
            ctx.fillRect(px + 6 + i * 9 + (ty % 5), py + 8 + (tx % 7) + i * 4, 2, 2);
          }
        }
      } else if (t === T.BEACH) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(px, py + ((tx * 3 + ty) % 4) * 8, TILE, 2);
        const hb = hash2(tx, ty);
        if (hb < 0.1) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(px + 10 + (tx % 12), py + 12 + (ty % 10), 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (hb < 0.16) {
          // A shell washed up on the sand.
          ctx.fillStyle = '#e8a87d';
          ctx.beginPath();
          ctx.arc(px + 20, py + 20, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.arc(px + 19, py + 19, 1, 0, Math.PI * 2);
          ctx.fill();
        }
        if (ty === 59) {
          ctx.fillStyle = 'rgba(42, 90, 122, 0.35)';
          ctx.fillRect(px, py + 22, TILE, 10);
        }
      } else if (t === T.WATER) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        const drift = (performance.now() / 900 + tx * 0.7) % 3;
        ctx.fillRect(px, py + ((tx + ty * 2) % 3) * 10 + drift * 2, TILE, 2);
      }
    }
  }

  drawRoadMarkings(ctx, cam);

  // Buildings: shadow, extruded walls, roof with style, windows and doors.
  const light = lightFactor(game);
  for (const b of world.buildings) {
    const px = b.x;
    const py = b.y;
    if (px > bounds.x1 || py > bounds.y1 || px + b.w < bounds.x0 || py + b.h < bounds.y0) continue;
    const hgt = Math.min(b.floors * 4, 26);
    const ox = hgt * 0.22;
    const oy = hgt * 0.55;
    // Ground shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(px + ox * 0.6, py + oy * 0.6, b.w, b.h);
    // South + east wall faces (the extrusion).
    ctx.fillStyle = shade(b.color, -28);
    ctx.fillRect(px - ox, py - oy + b.h, b.w, oy);
    ctx.fillStyle = shade(b.color, -16);
    ctx.fillRect(px - ox + b.w, py - oy, ox, b.h + oy);
    // Roof.
    ctx.fillStyle = b.roof;
    ctx.fillRect(px - ox, py - oy, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - ox, py - oy, b.w, b.h);
    ctx.lineWidth = 1;
    drawRoofDetails(ctx, b, px - ox, py - oy);
    // Windows + doors on the south wall face.
    drawWallFace(ctx, b, px - ox, py - oy + b.h, b.w, oy, light, game);
  }

  // Landmarks: bank, shops, hideout — drawn as labelled plaques on the road.
  drawLabel(ctx, game, cam, world.bank, 'BANK');
  drawLabel(ctx, game, cam, world.shops.gunsmith, 'GUNSMITH');
  drawLabel(ctx, game, cam, world.shops.garage, 'GARAGE');
  drawLabel(ctx, game, cam, world.shops.clinic, 'CLINIC');
  drawLabel(ctx, game, cam, world.hideout, 'HIDEOUT');
  drawLabel(ctx, game, cam, world.pizza, 'PIZZA');

  // Enterable doors: a doormat + a soft pulse so players find them.
  const pulse = 0.5 + Math.sin(performance.now() / 400) * 0.2;
  for (const e of world.enterables) {
    const dx = e.doorX;
    const dy = e.doorY;
    if (dx < bounds.x0 - 40 || dy < bounds.y0 - 40 || dx > bounds.x1 + 40 || dy > bounds.y1 + 40) continue;
    ctx.fillStyle = '#5c4028';
    ctx.fillRect(dx - 10, dy - 2, 20, 8);
    ctx.strokeStyle = `rgba(255, 217, 74, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(dx - 12, dy - 4, 24, 12);
    ctx.lineWidth = 1;
  }
}

function drawRoadMarkings(ctx, cam) {
  // Centre dashes (continuous in world space) + solid edge lines.
  const bounds = viewBounds(cam);
  const y0 = Math.max(0, bounds.y0);
  const y1 = Math.min(WORLD_H, bounds.y1);
  const x0 = Math.max(0, bounds.x0);
  const x1 = Math.min(WORLD_W, bounds.x1);
  for (const L of ROAD_AT) {
    const cx = (L + 1) * TILE; // centre of the 2-wide vertical road
    if (cx < bounds.x0 - 10 || cx > bounds.x1 + 10) continue;
    const arterial = ARTERIAL.has(L);
    ctx.fillStyle = arterial ? 'rgba(232, 183, 58, 0.85)' : 'rgba(240, 240, 230, 0.7)';
    const offs = arterial ? [-3, 1] : [0];
    for (let y = Math.floor(y0 / 30) * 30; y < y1; y += 30) {
      for (const o of offs) ctx.fillRect(cx - 1.5 + o, y, 3, 16);
    }
    ctx.fillStyle = 'rgba(240, 240, 230, 0.45)';
    ctx.fillRect(L * TILE, y0, 2, y1 - y0);
    ctx.fillRect((L + 2) * TILE - 2, y0, 2, y1 - y0);
  }
  for (const L of ROAD_AT) {
    const cy = (L + 1) * TILE;
    if (cy < bounds.y0 - 10 || cy > bounds.y1 + 10) continue;
    const arterial = ARTERIAL.has(L);
    ctx.fillStyle = arterial ? 'rgba(232, 183, 58, 0.85)' : 'rgba(240, 240, 230, 0.7)';
    const offs = arterial ? [-3, 1] : [0];
    for (let x = Math.floor(x0 / 30) * 30; x < x1; x += 30) {
      for (const o of offs) ctx.fillRect(x, cy - 1.5 + o, 16, 3);
    }
    ctx.fillStyle = 'rgba(240, 240, 230, 0.45)';
    ctx.fillRect(x0, L * TILE, x1 - x0, 2);
    ctx.fillRect(x0, (L + 2) * TILE - 2, x1 - x0, 2);
  }
  // Zebra crossings at every intersection: stripes parallel to traffic.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  for (const Lx of ROAD_AT) {
    for (const Ly of ROAD_AT) {
      const ix = Lx * TILE;
      const iy = Ly * TILE;
      if (ix < bounds.x0 - 80 || iy < bounds.y0 - 80 || ix > bounds.x1 + 80 || iy > bounds.y1 + 80) continue;
      for (let i = 0; i < 5; i++) {
        const bx = ix + 6 + i * 11;
        ctx.fillRect(bx, iy + 3, 6, 22); // north approach, vertical road
        ctx.fillRect(bx, iy + TILE * 2 - 25, 6, 22); // south approach
        const by = iy + 6 + i * 11;
        ctx.fillRect(ix + 3, by, 22, 6); // west approach, horizontal road
        ctx.fillRect(ix + TILE * 2 - 25, by, 22, 6); // east approach
      }
    }
  }
}

function drawRoofDetails(ctx, b, rx, ry) {
  const h = hash2(b.x, b.y);
  if (b.style === 'house') {
    // Pitched roof: ridge line, two shaded planes, a chimney.
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(rx + 4, ry + 4, b.w - 8, Math.floor(b.h / 2) - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(rx + 4, ry + Math.floor(b.h / 2), b.w - 8, Math.floor(b.h / 2) - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(rx + 4, ry + Math.floor(b.h / 2) - 1, b.w - 8, 2);
    ctx.fillStyle = '#6b4a3a';
    ctx.fillRect(rx + b.w - 18 - ((b.id * 7) % Math.max(1, b.w - 30)), ry + 8, 10, 10);
  } else if (b.style === 'tower') {
    // Parapet + AC units + the odd water tank.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(rx + 4, ry + 4, b.w - 8, b.h - 8);
    ctx.fillStyle = '#8a8f96';
    const n = 1 + Math.floor(h * 3);
    for (let i = 0; i < n; i++) {
      const ux = rx + 10 + i * 22;
      const uy = ry + 10 + ((i * 13) % Math.max(1, b.h - 30));
      ctx.fillRect(ux, uy, 14, 10);
      ctx.fillStyle = '#5a5f66';
      ctx.fillRect(ux + 2, uy + 2, 10, 3);
      ctx.fillStyle = '#8a8f96';
    }
    if (h > 0.6) {
      ctx.fillStyle = '#7a6550';
      ctx.beginPath();
      ctx.arc(rx + b.w - 16, ry + b.h - 16, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (b.style === 'warehouse') {
    // Skylight strips + big vents.
    ctx.fillStyle = 'rgba(220, 230, 240, 0.5)';
    ctx.fillRect(rx + 8, ry + 10, b.w - 16, 6);
    ctx.fillRect(rx + 8, ry + b.h - 16, b.w - 16, 6);
    ctx.fillStyle = '#3a3f46';
    ctx.beginPath();
    ctx.arc(rx + b.w / 2, ry + b.h / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b6f76';
    ctx.beginPath();
    ctx.arc(rx + b.w / 2, ry + b.h / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (b.style === 'apartment') {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(rx + 4, ry + 4, b.w - 8, b.h - 8);
    if (h > 0.45) {
      ctx.fillStyle = '#3a6b45';
      ctx.fillRect(rx + 10, ry + 10, 18, 12);
      ctx.fillStyle = '#4a7d55';
      ctx.beginPath();
      ctx.arc(rx + 19, ry + 16, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#8a8f96';
    ctx.fillRect(rx + b.w - 24, ry + 10, 12, 8);
  } else {
    // shop: flat roof, a vent and a sign band on the front (drawn on the wall).
    ctx.fillStyle = '#8a8f96';
    ctx.fillRect(rx + 10, ry + 10, 14, 10);
  }
}

function drawWallFace(ctx, b, rx, ry, w, hgt, light, game) {
  // ry = top of the south wall face, hgt = its height.
  if (hgt < 6) return;
  // Windows: a grid on towers, a few on the rest. Lit warm at night.
  const cols = Math.max(1, Math.floor(w / 24));
  const rows = b.style === 'tower' ? Math.min(b.floors, 3) : 1;
  const lit = light < 0.8;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const wx = rx + 8 + i * 24;
      const wy = ry + 4 + j * Math.max(10, (hgt - 8) / rows);
      if (wx + 12 > rx + w - 6) continue;
      ctx.fillStyle = lit && ((i * 5 + j * 11 + b.floors) % 3 === 0)
        ? 'rgba(255, 210, 110, 0.9)' : 'rgba(20, 28, 40, 0.85)';
      ctx.fillRect(wx, wy, 12, 9);
    }
  }
  // A door on the south face. Enterable buildings get a real door + mat.
  // The door's world x lines up with the doormat drawn in drawWorld.
  const doorX = b.enterable ? b.doorX : rx + w / 2;
  const doorW = 14;
  ctx.fillStyle = '#4a3220';
  ctx.fillRect(doorX - doorW / 2, ry + hgt - 14, doorW, 14);
  ctx.fillStyle = 'rgba(255, 220, 140, 0.5)';
  ctx.fillRect(doorX - doorW / 2, ry + hgt - 14, doorW, 2);
  if (b.enterable) {
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(doorX - doorW / 2 - 4, ry + hgt + 1, doorW + 8, 4);
  }
  // Shop awning: a striped band under the roof edge.
  if (b.style === 'shop' || b.kind === 'gunsmith' || b.kind === 'garage' || b.kind === 'clinic') {
    const colors = b.kind === 'clinic' ? ['#e8e8e8', '#7db8c8'] : b.kind === 'gunsmith' ? ['#3a3a3a', '#c85a3a'] : ['#e8c85a', '#3a3a3a'];
    for (let i = 0; i < Math.floor(w / 12); i++) {
      ctx.fillStyle = colors[i % 2];
      ctx.fillRect(rx + 4 + i * 12, ry + 1, 12, 7);
    }
  }
}

function drawLabel(ctx, game, cam, pt, text) {
  const bounds = viewBounds(cam);
  const px = pt.x;
  const py = pt.y;
  if (px < bounds.x0 - 80 || py < bounds.y0 - 80 || px > bounds.x1 + 80 || py > bounds.y1 + 80) return;
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = 'rgba(10, 14, 20, 0.8)';
  ctx.fillRect(px - w / 2, py - 26, w, 16);
  ctx.fillStyle = '#e8c85a';
  ctx.textAlign = 'center';
  ctx.fillText(text, px, py - 14);
  ctx.textAlign = 'left';
}

export function drawPickups(ctx, game, cam) {
  const bounds = viewBounds(cam);
  for (const pk of game.pickups) {
    const px = pk.x;
    const py = pk.y + Math.sin(pk.bob + performance.now() / 300) * 3;
    if (px < bounds.x0 - 20 || py < bounds.y0 - 20 || px > bounds.x1 + 20 || py > bounds.y1 + 20) continue;
    // A soft glow pad under every pickup.
    ctx.fillStyle = 'rgba(255, 217, 74, 0.18)';
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.fill();
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#3ecf6e';
      rr(ctx, px - 11, py - 6, 22, 12, 2);
      ctx.fill();
      ctx.fillStyle = '#0a5c2a';
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', px, py + 4);
      ctx.textAlign = 'left';
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#f2f2f2';
      rr(ctx, px - 9, py - 9, 18, 18, 3);
      ctx.fill();
      ctx.fillStyle = '#e84a4a';
      ctx.fillRect(px - 2, py - 6, 4, 12);
      ctx.fillRect(px - 6, py - 2, 12, 4);
    } else {
      // Ammo: a gun silhouette, not a letter in a circle.
      drawWeaponShape(ctx, px - 9, py, 0, 'smg', 1.4);
    }
  }
}

export function drawVehicles(ctx, game, cam) {
  for (const v of game.vehicles) {
    if (v.dead) continue;
    drawCar(ctx, game, v, v.x, v.y);
    if (v.health < v.def.health * 0.5) {
      ctx.fillStyle = 'rgba(232, 118, 42, 0.7)';
      ctx.beginPath();
      ctx.arc(v.x, v.y - 8, 5 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCar(ctx, game, v, x, y) {
  const s = carShape(v.def.id);
  const len = s.len;
  const wid = s.wid;
  const body = shade(v.color, (v.tint || 0) * 9);
  const light = lightFactor(game);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(v.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rr(ctx, -len / 2 + 2, -wid / 2 + 3, len, wid, 6);
  ctx.fill();
  // Wheels: four dark tyres peeking out at the corners.
  ctx.fillStyle = '#14161a';
  const wx = len / 2 - 8;
  const wy = wid / 2 - 1;
  rr(ctx, -wx - 4, -wy - 2, 9, 5, 2); ctx.fill();
  rr(ctx, wx - 5, -wy - 2, 9, 5, 2); ctx.fill();
  rr(ctx, -wx - 4, wy - 3, 9, 5, 2); ctx.fill();
  rr(ctx, wx - 5, wy - 3, 9, 5, 2); ctx.fill();
  // Body.
  ctx.fillStyle = body;
  rr(ctx, -len / 2, -wid / 2, len, wid, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  rr(ctx, -len / 2, -wid / 2, len, wid, 6);
  ctx.stroke();
  if (s.kind === 'truck') {
    // Cab up front, ribbed cargo box behind.
    ctx.fillStyle = shade(v.color, (v.tint || 0) * 9 + 18);
    rr(ctx, -len / 2 + 4, -wid / 2 + 2, len - 26, wid - 4, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-len / 2 + 12 + i * 9, -wid / 2 + 3);
      ctx.lineTo(-len / 2 + 12 + i * 9, wid / 2 - 3);
      ctx.stroke();
    }
    ctx.fillStyle = '#1a2027';
    rr(ctx, len / 2 - 16, -wid / 2 + 3, 10, wid - 6, 2);
    ctx.fill();
  } else if (s.kind === 'van') {
    // Long cabin with side windows.
    ctx.fillStyle = '#1a2027';
    rr(ctx, -len / 2 + 6, -wid / 2 + 3, len - 12, wid - 6, 3);
    ctx.fill();
    ctx.fillStyle = '#2a3a4a';
    for (let i = 0; i < 3; i++) ctx.fillRect(-len / 2 + 12 + i * 12, -wid / 2 + 5, 8, wid - 10);
  } else {
    // Cabin glass: windshield up front, rear window, roof.
    const cx = s.cabin;
    const cl = s.cabinLen;
    ctx.fillStyle = '#1a2027';
    rr(ctx, cx - cl / 2, -wid / 2 + 3, cl, wid - 6, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(160, 200, 230, 0.55)';
    ctx.fillRect(cx + cl / 2 - 4, -wid / 2 + 5, 3, wid - 10); // windshield
    ctx.fillRect(cx - cl / 2 + 1, -wid / 2 + 5, 2, wid - 10); // rear window
    if (s.kind === 'coupe') {
      ctx.fillStyle = '#1a2027';
      ctx.fillRect(cx - 2, -wid / 2 + 6, 8, wid - 12); // sunroof
    }
  }
  // Hood + trunk shut lines.
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.moveTo(len / 2 - 8, -wid / 2 + 2);
  ctx.lineTo(len / 2 - 8, wid / 2 - 2);
  ctx.moveTo(-len / 2 + 8, -wid / 2 + 2);
  ctx.lineTo(-len / 2 + 8, wid / 2 - 2);
  ctx.stroke();
  // Headlights (front = +x) + a light cone at night; red tail lights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 4);
  ctx.fillRect(len / 2 - 2, wid / 2 - 7, 3, 4);
  ctx.fillStyle = '#e84a4a';
  ctx.fillRect(-len / 2 - 1, -wid / 2 + 3, 3, 4);
  ctx.fillRect(-len / 2 - 1, wid / 2 - 7, 3, 4);
  if (light < 0.8) {
    ctx.fillStyle = 'rgba(255, 240, 180, 0.10)';
    ctx.beginPath();
    ctx.moveTo(len / 2, -wid / 2 + 4);
    ctx.lineTo(len / 2 + 46, -wid / 2 - 8);
    ctx.lineTo(len / 2 + 46, wid / 2 + 8);
    ctx.lineTo(len / 2, wid / 2 - 4);
    ctx.closePath();
    ctx.fill();
  }
  // Type extras.
  if (s.taxi) {
    ctx.fillStyle = '#111';
    for (let i = 0; i < 6; i++) ctx.fillRect(-12 + i * 5, -2, 3, 4);
    ctx.fillStyle = '#f2f2f2';
    rr(ctx, -4, -wid / 2 - 4, 12, 5, 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 5px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 2, -wid / 2 - 0.5);
    ctx.textAlign = 'left';
  }
  if (s.police) {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-2, -wid / 2 + 1, 6, wid - 2);
    const flash = Math.floor(performance.now() / 200) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2a2a' : '#2a6bff';
    ctx.fillRect(-8, -wid / 2 - 3, 5, 4);
    ctx.fillStyle = flash ? '#2a6bff' : '#ff2a2a';
    ctx.fillRect(-8, wid / 2 - 1, 5, 4);
  }
  if (s.spoiler) {
    ctx.fillStyle = '#1a1d22';
    ctx.fillRect(-len / 2 - 2, -wid / 2 - 1, 3, wid + 2);
    ctx.fillStyle = body;
    ctx.fillRect(-len / 2 + 1, -wid / 2 - 2, 2, 3);
    ctx.fillRect(-len / 2 + 1, wid / 2 - 1, 2, 3);
  }
  // Driver inside: a head in the driver's seat (front-left of the cabin).
  const dh = (v.tint || 0) % 2 === 0 ? '#1a1a1a' : '#4a2f1a';
  ctx.fillStyle = '#d8a878';
  ctx.beginPath();
  ctx.arc(s.cabin + 2, -wid / 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dh;
  ctx.beginPath();
  ctx.arc(s.cabin + 1, -wid / 4, 4, Math.PI * 0.6, Math.PI * 1.6);
  ctx.fill();
  ctx.restore();
}

export function drawPeople(ctx, game, cam) {
  for (const ped of game.peds) {
    if (ped.dead) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped, ped.walkPhase, ped.panic > 0, 'fists');
  }
  for (const cop of game.cops) {
    if (cop.dead) continue;
    if (cop.inCar) continue;
    const copLook = { color: '#2f4a7d', hair: '#1a1a1a', pants: '#1f2f4a', hat: true };
    drawPerson(ctx, cop.x, cop.y, cop.angle, copLook, performance.now() / 120, true, 'pistol');
    ctx.fillStyle = '#e8e8e8';
    ctx.font = 'bold 8px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', cop.x, cop.y - 18);
    ctx.textAlign = 'left';
  }
  const p = game.player;
  if (!p.dead && !p.inCar) {
    drawPerson(ctx, p.x, p.y, p.angle, p, performance.now() / 120, p.walking, game.arsenal.current);
    // Aiming line: toward the world point under the mouse when the mouse
    // has aimed, else along the facing. Drawn in world coords, so the
    // camera transform carries it onto the screen.
    const aim = game.aimWorld
      ? Math.atan2(game.aimWorld.y - p.y, game.aimWorld.x - p.x)
      : p.angle;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(aim) * 46, p.y + Math.sin(aim) * 46);
    ctx.stroke();
  }
}

// A real little person, top-down 2.5D: legs that scissor when walking, a
// torso, arms, a head with hair (and a hat for some), a weapon in hand.
// look: {color (shirt), hair, pants, hat}. weapon: a weapon id or 'fists'.
function drawPerson(ctx, x, y, angle, look, phase, moving, weapon) {
  const shirt = look.color || '#7d8aa0';
  const hair = look.hair || '#1a1a1a';
  const pants = look.pants || '#2a3a5c';
  const scissor = moving ? Math.sin(phase) * 3 : 0;
  const bob = moving ? Math.sin(phase * 2) * 1 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 3, 11, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs (scissor along the facing axis).
  ctx.fillStyle = pants;
  rr(ctx, -7 + scissor, -5 + bob * 0.4, 9, 4, 2); ctx.fill();
  rr(ctx, -7 - scissor, 1 - bob * 0.4, 9, 4, 2); ctx.fill();
  // Torso.
  ctx.fillStyle = shirt;
  rr(ctx, -4, -7, 16, 14, 5); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-4, -7, 3, 14); // belt / back edge
  // Arms: one at each side; the front arm holds the weapon.
  ctx.fillStyle = shade(shirt, -18);
  rr(ctx, 2, -9, 8, 3, 1); ctx.fill();
  rr(ctx, 2, 6, 8, 3, 1); ctx.fill();
  // Head: skin + hair on the back half (+ a cap when the look has one).
  ctx.fillStyle = '#d8a878';
  ctx.beginPath();
  ctx.arc(13, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(12, 0, 5.5, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();
  if (look.hat) {
    ctx.fillStyle = '#1f2f4a';
    ctx.beginPath();
    ctx.arc(13, 0, 5.5, Math.PI * 0.7, Math.PI * 1.3);
    ctx.fill();
    ctx.fillRect(17, -3, 4, 6);
  }
  // Held weapon, pointing where the figure faces.
  if (weapon && weapon !== 'fists') {
    drawWeaponShape(ctx, 10, 0, 0, weapon, 1);
  }
  ctx.restore();
}

// Draw a held weapon shape in local coords: (hx, hy) is the hand, the
// weapon points along `angle` (0 = +x). scale lets pickups draw it bigger.
function drawWeaponShape(ctx, hx, hy, angle, id, scale) {
  const s = weaponShape(id);
  if (!s || s.len === 0) return;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  ctx.scale(scale || 1, scale || 1);
  ctx.fillStyle = '#1a1d22';
  if (s.kind === 'pistol') {
    ctx.fillRect(0, -2, 13, 4);
    ctx.fillRect(2, 2, 4, 5); // grip
  } else if (s.kind === 'smg') {
    ctx.fillRect(0, -2.5, 18, 5);
    ctx.fillRect(6, 2, 4, 6); // mag
    ctx.fillRect(14, -1.5, 6, 3); // barrel tip
  } else if (s.kind === 'shotgun') {
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(0, -2.5, 24, 5);
    ctx.fillStyle = '#1a1d22';
    ctx.fillRect(0, -3.5, 26, 2); // barrel
    ctx.fillRect(16, 1, 5, 3); // pump
  } else if (s.kind === 'rifle') {
    ctx.fillRect(0, -2, 26, 4);
    ctx.fillRect(4, 2, 4, 5); // grip
    ctx.fillRect(12, -5, 6, 3); // scope
    ctx.fillRect(22, -1.5, 6, 3); // muzzle
  }
  ctx.restore();
}

export function drawEffects(ctx, game, cam) {
  for (const t of game.tracers) {
    ctx.strokeStyle = `rgba(255, 220, 120, ${Math.max(0, t.life / 0.08)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // Muzzle flash: a star burst + glow at the weapon tip.
  if (game.muzzle && game.muzzle.life > 0) {
    const mx = game.muzzle.x;
    const my = game.muzzle.y;
    const a = game.muzzle.angle;
    const s = 10 + game.muzzle.life * 60;
    ctx.fillStyle = 'rgba(255, 240, 180, 0.35)';
    ctx.beginPath();
    ctx.arc(mx, my, s + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd94a';
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.5, s * 0.35);
    ctx.lineTo(-s * 0.3, 0);
    ctx.lineTo(-s * 0.5, -s * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.7);
    ctx.lineTo(s * 0.3, 0);
    ctx.lineTo(0, s * 0.7);
    ctx.lineTo(-s * 0.3, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  for (const pt of game.particles) {
    const a = Math.max(0, pt.life);
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = Math.min(1, a);
    for (let i = 0; i < pt.n; i++) {
      const ang = (i / pt.n) * Math.PI * 2 + pt.life * 3;
      const r = (1 - a) * 26;
      ctx.beginPath();
      ctx.arc(pt.x + Math.cos(ang) * r, pt.y + Math.sin(ang) * r, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export function drawLighting(ctx, game) {
  const light = lightFactor(game);
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  if (light < 1) {
    const dark = (1 - light) * 0.55;
    ctx.fillStyle = `rgba(8, 12, 32, ${dark})`;
    ctx.fillRect(0, 0, vw, vh);
    // Warm dusk tint.
    if (light > 0.5 && light < 0.95) {
      ctx.fillStyle = 'rgba(232, 140, 60, 0.08)';
      ctx.fillRect(0, 0, vw, vh);
    }
  }
  if (game.weather === 'rain') {
    ctx.strokeStyle = 'rgba(180, 200, 230, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const t = performance.now() / 12;
    for (let i = 0; i < 70; i++) {
      const x = (i * 173 + t * 0.6) % (vw + 40) - 20;
      const y = (i * 97 + t) % (vh + 40) - 20;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 14);
    }
    ctx.stroke();
  }
}

export function drawObjectiveMarker(ctx, game, cam) {
  // Screen space: the marker's world point is projected through the
  // camera, then clamped to the screen edge so it always points the way.
  const pt = game.objectivePoint ? game.objectivePoint() : null;
  if (!pt) return;
  const s = worldToScreen(cam, pt.x, pt.y);
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  const cx = Math.max(30, Math.min(vw - 30, s.x));
  const cy = Math.max(30, Math.min(vh - 30, s.y));
  const pulse = 1 + Math.sin(performance.now() / 300) * 0.15;
  ctx.strokeStyle = '#ffd94a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 18 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 26 * pulse);
  ctx.lineTo(cx - 7, cy - 12);
  ctx.lineTo(cx + 7, cy - 12);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
}

// ---- Interiors ----

export function drawInterior(ctx, game) {
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  const it = game.interior;
  if (!it) return;
  // Dark surround; the room sits centred in the view.
  ctx.fillStyle = '#07090e';
  ctx.fillRect(0, 0, vw, vh);
  const ox = Math.floor((vw - it.pxW) / 2);
  const oy = Math.floor((vh - it.pxH) / 2);
  // Floor.
  if (it.floor === 'wood') {
    for (let i = 0; i < it.pxH / 16; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#8a6b4a' : '#7d5f42';
      ctx.fillRect(ox, oy + i * 16, it.pxW, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(ox, oy + i * 16, it.pxW, 1);
    }
  } else if (it.floor === 'tile') {
    for (let ty = 0; ty < it.pxH / 32; ty++) {
      for (let tx = 0; tx < it.pxW / 32; tx++) {
        ctx.fillStyle = (tx + ty) % 2 === 0 ? '#c8d4d8' : '#b4c0c6';
        ctx.fillRect(ox + tx * 32, oy + ty * 32, 32, 32);
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i <= it.pxW / 32; i++) {
      ctx.beginPath(); ctx.moveTo(ox + i * 32, oy); ctx.lineTo(ox + i * 32, oy + it.pxH); ctx.stroke();
    }
    for (let i = 0; i <= it.pxH / 32; i++) {
      ctx.beginPath(); ctx.moveTo(ox, oy + i * 32); ctx.lineTo(ox + it.pxW, oy + i * 32); ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#5a5f66';
    ctx.fillRect(ox, oy, it.pxW, it.pxH);
    for (let i = 0; i < 40; i++) {
      const h = hash2(i, it.kind.length);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(ox + h * it.pxW, oy + ((i * 53) % it.pxH), 14, 8);
    }
  }
  // Furniture (under the walls, so a tall item never covers the wall).
  for (const f of it.furniture) drawFurniture(ctx, ox + f.x, oy + f.y, f);
  // Partition walls.
  for (const w of it.walls) {
    ctx.fillStyle = shade(it.wall, -12);
    ctx.fillRect(ox + w.x, oy + w.y, w.w, w.h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(ox + w.x, oy + w.y, w.w, 2);
  }
  // Outer walls (32 px), with a doorway gap in the south wall.
  ctx.fillStyle = it.wall;
  ctx.fillRect(ox, oy, it.pxW, 32); // north
  ctx.fillRect(ox, oy, 32, it.pxH); // west
  ctx.fillRect(ox + it.pxW - 32, oy, 32, it.pxH); // east
  const doorL = it.pxW / 2 - 16;
  const doorR = it.pxW / 2 + 16;
  ctx.fillRect(ox, oy + it.pxH - 32, doorL, 32); // south, left of door
  ctx.fillRect(ox + doorR, oy + it.pxH - 32, it.pxW - doorR, 32); // south, right
  // Baseboard highlight on the inner wall edge.
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(ox + 32, oy + 32, it.pxW - 64, 2);
  ctx.fillRect(ox + 32, oy + 32, 2, it.pxH - 64);
  ctx.fillRect(ox + it.pxW - 34, oy + 32, 2, it.pxH - 64);
  ctx.fillRect(ox + 32, oy + it.pxH - 34, doorL - 32, 2);
  ctx.fillRect(ox + doorR, oy + it.pxH - 34, it.pxW - doorR - 32, 2);
  // The exit door: a dark opening, a mat, and a green EXIT sign.
  ctx.fillStyle = '#1a120a';
  ctx.fillRect(ox + doorL, oy + it.pxH - 32, 32, 32);
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(ox + doorL + 2, oy + it.pxH - 44, 28, 12);
  ctx.fillStyle = '#3ecf6e';
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', ox + it.pxW / 2, oy + it.pxH - 38);
  ctx.textAlign = 'left';
  // Room name + the player.
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(it.name, vw / 2, oy - 12);
  ctx.textAlign = 'left';
  const p = game.player;
  drawPerson(ctx, ox + p.x, oy + p.y, p.angle, p, performance.now() / 120, p.walking, game.arsenal.current);
  ctx.fillStyle = '#9fb0c8';
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Walk to the EXIT door to leave', vw / 2, oy + it.pxH + 24);
  ctx.textAlign = 'left';
}

function drawFurniture(ctx, x, y, f) {
  const { w, h } = f;
  switch (f.kind) {
    case 'bed': {
      ctx.fillStyle = '#6b4a2f';
      rr(ctx, x, y, w, h, 4); ctx.fill();
      ctx.fillStyle = '#e8e4da';
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      ctx.fillStyle = '#3a6b8a';
      ctx.fillRect(x + 6, y + h * 0.45, w - 12, h - h * 0.45 - 6);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 8, y + 8, w * 0.32, 16);
      break;
    }
    case 'wardrobe': {
      ctx.fillStyle = '#5c4028';
      rr(ctx, x, y, w, h, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.moveTo(x + w / 2, y + 4); ctx.lineTo(x + w / 2, y + h - 4); ctx.stroke();
      ctx.fillStyle = '#c8a85a';
      ctx.fillRect(x + w / 2 - 5, y + h / 2 - 2, 3, 4);
      ctx.fillRect(x + w / 2 + 2, y + h / 2 - 2, 3, 4);
      break;
    }
    case 'lamp': {
      ctx.fillStyle = 'rgba(255, 220, 130, 0.22)';
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath(); ctx.arc(x + w / 2, y + h - 4, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath(); ctx.moveTo(x + w / 2 - 9, y + 8); ctx.lineTo(x + w / 2 + 9, y + 8); ctx.lineTo(x + w / 2 + 6, y + h - 8); ctx.lineTo(x + w / 2 - 6, y + h - 8); ctx.closePath(); ctx.fill();
      break;
    }
    case 'stove': {
      ctx.fillStyle = '#2a2f36';
      rr(ctx, x, y, w, h, 3); ctx.fill();
      ctx.fillStyle = '#14161a';
      for (const [bx, by] of [[0.28, 0.3], [0.72, 0.3], [0.28, 0.72], [0.72, 0.72]]) {
        ctx.beginPath(); ctx.arc(x + w * bx, y + h * by, 8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.strokeRect(x + 6, y + h - 12, w - 12, 8);
      break;
    }
    case 'fridge': {
      ctx.fillStyle = '#c8ccd2';
      rr(ctx, x, y, w, h, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.moveTo(x + 4, y + h * 0.32); ctx.lineTo(x + w - 4, y + h * 0.32); ctx.stroke();
      ctx.fillStyle = '#5a5f66';
      ctx.fillRect(x + w - 10, y + 8, 3, 14);
      ctx.fillStyle = '#e84a4a';
      ctx.fillRect(x + 8, y + h * 0.45, 5, 5);
      ctx.fillStyle = '#3a6b8a';
      ctx.fillRect(x + 16, y + h * 0.5, 5, 5);
      break;
    }
    case 'sink': {
      ctx.fillStyle = '#8a8f96';
      rr(ctx, x, y, w, h, 3); ctx.fill();
      ctx.fillStyle = '#7db8e8';
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2 + 4, w * 0.32, h * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5a5f66';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w / 2, y + 4); ctx.lineTo(x + w / 2, y + h / 2 - 4); ctx.stroke();
      ctx.lineWidth = 1;
      break;
    }
    case 'tub': {
      ctx.fillStyle = '#f2f2f2';
      rr(ctx, x, y, w, h, 8); ctx.fill();
      ctx.fillStyle = '#7db8e8';
      rr(ctx, x + 5, y + 5, w - 10, h - 10, 6); ctx.fill();
      break;
    }
    case 'toilet': {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(x, y, w, 12);
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - 8, w * 0.42, 8, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'maptable': {
      ctx.fillStyle = '#5c4028';
      rr(ctx, x, y, w, h, 4); ctx.fill();
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
      ctx.strokeStyle = '#8a7a5a';
      ctx.beginPath();
      ctx.moveTo(x + 12, y + h - 12); ctx.lineTo(x + w * 0.4, y + h * 0.5); ctx.lineTo(x + w * 0.6, y + h * 0.6); ctx.lineTo(x + w - 12, y + 12);
      ctx.stroke();
      ctx.fillStyle = '#e84a4a';
      ctx.beginPath(); ctx.arc(x + w * 0.4, y + h * 0.5, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w - 14, y + 14, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a6b8a';
      ctx.beginPath(); ctx.arc(x + w * 0.6, y + h * 0.6, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'rack': {
      ctx.fillStyle = '#3a2f26';
      ctx.fillRect(x, y, w, h);
      for (let i = 0; i < 3; i++) {
        drawWeaponShape(ctx, x + 14 + i * (w / 3), y + h / 2, 0, ['pistol', 'rifle', 'shotgun'][i], 0.9);
      }
      break;
    }
    case 'shelf': {
      ctx.fillStyle = '#5c4028';
      ctx.fillRect(x, y, w, h);
      const cols = ['#c85a3a', '#3a6b8a', '#5a7d5a', '#e8b73a'];
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = cols[i % 4];
        ctx.fillRect(x + 6 + i * (w - 12) / 6, y - 10, (w - 12) / 6 - 3, 10);
      }
      break;
    }
    case 'crate': {
      ctx.fillStyle = '#8a6b3a';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
      break;
    }
    case 'bench': {
      ctx.fillStyle = '#6b6f76';
      rr(ctx, x, y, w, h, 3); ctx.fill();
      ctx.fillStyle = '#c85a3a';
      ctx.fillRect(x + 10, y + 8, 14, 8);
      ctx.fillStyle = '#3a6b8a';
      ctx.fillRect(x + 34, y + 8, 14, 8);
      ctx.fillStyle = '#e8b73a';
      ctx.fillRect(x + 58, y + 8, 14, 8);
      break;
    }
    case 'tires': {
      ctx.fillStyle = '#14161a';
      ctx.beginPath(); ctx.arc(x + w * 0.32, y + h / 2, 15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w * 0.68, y + h / 2, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a5f66';
      ctx.beginPath(); ctx.arc(x + w * 0.32, y + h / 2, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w * 0.68, y + h / 2, 6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'tools': {
      ctx.fillStyle = '#6b4a2f';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#c8ccd2';
      for (let i = 0; i < 5; i++) ctx.fillRect(x + 6 + i * 18, y + 3, 3, 10);
      break;
    }
    case 'cabinet': {
      ctx.fillStyle = '#7a7f86';
      rr(ctx, x, y, w, h, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.moveTo(x + w / 2, y + 4); ctx.lineTo(x + w / 2, y + h - 4); ctx.stroke();
      break;
    }
    case 'drums': {
      ctx.fillStyle = '#3a5a7d';
      ctx.beginPath(); ctx.arc(x + w * 0.3, y + h / 2, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3a2a';
      ctx.beginPath(); ctx.arc(x + w * 0.72, y + h / 2, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(x + w * 0.3, y + h / 2, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + w * 0.72, y + h / 2, 13, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'desk': {
      ctx.fillStyle = '#a87d4a';
      rr(ctx, x, y, w, h, 4); ctx.fill();
      ctx.fillStyle = '#e8e4da';
      ctx.fillRect(x + 6, y + 4, w - 12, 8);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x + w / 2 - 8, y + 10, 16, 10);
      break;
    }
    case 'table': {
      ctx.fillStyle = '#6b4a2f';
      rr(ctx, x, y, w, h, 6); ctx.fill();
      ctx.fillStyle = '#f2f2f2';
      ctx.beginPath(); ctx.arc(x + w * 0.3, y + h * 0.4, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w * 0.7, y + h * 0.55, 7, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'chair': {
      ctx.fillStyle = '#5c4028';
      rr(ctx, x, y, w, h, 3); ctx.fill();
      ctx.fillStyle = '#7d5a3a';
      ctx.fillRect(x + 2, y - 4, w - 4, 6);
      break;
    }
    case 'sofa': {
      ctx.fillStyle = '#5a4a7d';
      rr(ctx, x, y, w, h, 8); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + w / 2 - 2, y + 4, 4, h - 8);
      ctx.fillStyle = '#6b5a8a';
      ctx.fillRect(x + 4, y + 4, 10, h - 8);
      ctx.fillRect(x + w - 14, y + 4, 10, h - 8);
      break;
    }
    case 'tv': {
      ctx.fillStyle = '#1a1d22';
      rr(ctx, x, y, w, h, 2); ctx.fill();
      ctx.fillStyle = '#2a5a8a';
      ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(x + 10, y + 4); ctx.lineTo(x + 26, y + 4); ctx.lineTo(x + 18, y + h - 4); ctx.lineTo(x + 8, y + h - 4); ctx.closePath(); ctx.fill();
      break;
    }
    case 'rug': {
      ctx.fillStyle = '#7d3a3a';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#c8a85a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(200,168,90,0.6)';
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 14, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'counter': {
      ctx.fillStyle = '#c8b89a';
      rr(ctx, x, y, w, h, 3); ctx.fill();
      ctx.fillStyle = '#8a7a5a';
      ctx.fillRect(x, y + h - 10, w, 10);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(x + (w / 4) * i, y + h - 10); ctx.lineTo(x + (w / 4) * i, y + h); ctx.stroke();
      }
      break;
    }
    case 'cashier': {
      ctx.fillStyle = '#8a7a5a';
      rr(ctx, x, y, w, h, 3); ctx.fill();
      ctx.fillStyle = '#2a2f36';
      ctx.fillRect(x + 8, y + 6, 28, 18);
      ctx.fillStyle = '#7db8e8';
      ctx.fillRect(x + 11, y + 9, 22, 8);
      break;
    }
    case 'plant': {
      ctx.fillStyle = '#8a5a3a';
      ctx.beginPath(); ctx.moveTo(x + 3, y + h - 4); ctx.lineTo(x + w - 3, y + h - 4); ctx.lineTo(x + w - 7, y + h / 2); ctx.lineTo(x + 7, y + h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a7d45';
      ctx.beginPath(); ctx.arc(x + w / 2, y + 6, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w / 2 - 7, y + 11, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w / 2 + 7, y + 11, 6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bookshelf': {
      ctx.fillStyle = '#5c4028';
      ctx.fillRect(x, y, w, h);
      const cols = ['#c85a3a', '#3a6b8a', '#5a7d5a', '#e8b73a', '#6b5a8a'];
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = cols[(i + r) % 5];
          ctx.fillRect(x + 4 + i * 7, y + 6 + r * 30, 5, 22);
        }
      }
      break;
    }
    case 'lift': {
      ctx.strokeStyle = 'rgba(232, 183, 58, 0.7)';
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(232, 183, 58, 0.8)';
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LIFT', x + w / 2, y + h / 2 + 4);
      ctx.textAlign = 'left';
      break;
    }
    default: {
      ctx.fillStyle = '#8a8f96';
      ctx.fillRect(x, y, w, h);
    }
  }
}
