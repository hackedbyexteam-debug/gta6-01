// People and traffic: the player on foot, pedestrians who stroll the
// sidewalks, and traffic cars that cruise the road grid. Collision is circle
// against building rectangles and against other circles.
import { TILE, WORLD_W, WORLD_H } from './config.js';
import { createVehicle, updateVehicle } from './vehicles.js';

export function collideCircleBuildings(x, y, r, world) {
  // Returns the corrected position after pushing the circle out of buildings.
  let cx = x;
  let cy = y;
  for (const b of world.buildings) {
    const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
    const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
    const dx = cx - nx;
    const dy = cy - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      cx = nx + (dx / d) * r;
      cy = ny + (dy / d) * r;
    }
  }
  return { x: cx, y: cy };
}

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0, radius: 13,
    health: 100, armor: 0, inCar: null, walking: false,
    punchTimer: 0, shootTimer: 0, dead: false,
  };
}

export function updatePlayerOnFoot(p, move, dt, world, vehicles) {
  const speed = move.sprint ? 210 : 135;
  const mx = (move.right ? 1 : 0) - (move.left ? 1 : 0);
  const my = (move.down ? 1 : 0) - (move.up ? 1 : 0);
  p.walking = mx !== 0 || my !== 0;
  if (p.walking) {
    const len = Math.hypot(mx, my) || 1;
    const nx = p.x + (mx / len) * speed * dt;
    const ny = p.y + (my / len) * speed * dt;
    p.angle = Math.atan2(my, mx);
    const c = collideCircleBuildings(nx, ny, p.radius, world);
    p.x = Math.max(16, Math.min(WORLD_W - 16, c.x));
    p.y = Math.max(16, Math.min(WORLD_H - 16, c.y));
  }
  // Bump into parked cars instead of walking through them.
  for (const v of vehicles) {
    if (v.dead) continue;
    const dx = p.x - v.x;
    const dy = p.y - v.y;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < 30) {
      p.x = v.x + (dx / d) * 30;
      p.y = v.y + (dy / d) * 30;
    }
  }
  p.punchTimer = Math.max(0, p.punchTimer - dt);
  p.shootTimer = Math.max(0, p.shootTimer - dt);
}

export function createPed(x, y, rng) {
  return {
    x, y, angle: rng.range(0, Math.PI * 2), speed: rng.range(28, 52),
    radius: 11, color: rng.pick(['#e8b73a', '#7d8aa0', '#a03a3a', '#5a7d5a', '#d4d4d4', '#3a6b8a']),
    panic: 0, dead: false, walkPhase: rng.range(0, Math.PI * 2),
    target: null,
  };
}

export function updatePed(ped, dt, world, danger) {
  if (ped.dead) return;
  ped.panic = Math.max(0, ped.panic - dt);
  if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 24) {
    const t = world.randomRoadPoint();
    ped.target = t;
  }
  const dx = ped.target.x - ped.x;
  const dy = ped.target.y - ped.y;
  const d = Math.hypot(dx, dy) || 1;
  let ang = Math.atan2(dy, dx);
  if (danger && Math.hypot(danger.x - ped.x, danger.y - ped.y) < 220) {
    // Run away from the danger.
    ang = Math.atan2(ped.y - danger.y, ped.x - danger.x);
    ped.panic = 1.5;
  }
  ped.angle = ang;
  const sp = ped.speed * (ped.panic > 0 ? 2.6 : 1);
  const nx = ped.x + Math.cos(ang) * sp * dt;
  const ny = ped.y + Math.sin(ang) * sp * dt;
  const c = collideCircleBuildings(nx, ny, ped.radius, world);
  ped.x = Math.max(16, Math.min(WORLD_W - 16, c.x));
  ped.y = Math.max(16, Math.min(WORLD_H - 16, c.y));
  ped.walkPhase += dt * (ped.panic > 0 ? 14 : 7);
}

export function createTrafficCar(world, rng) {
  const p = world.randomRoadPoint();
  const vertical = rng.chance(0.5);
  const angle = vertical ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
  const defId = rng.pick(['sedan', 'sedan', 'taxi', 'coupe', 'van', 'truck', 'sports']);
  const v = createVehicle(defId, p.x, p.y, angle);
  v.speed = v.def.topSpeed * rng.range(0.35, 0.55);
  v.traffic = true;
  return v;
}

export function updateTrafficCar(v, dt, world, rng, others) {
  if (v.dead) return;
  // Cruise forward; at intersections sometimes turn.
  const tx = Math.floor(v.x / TILE);
  const ty = Math.floor(v.y / TILE);
  const onLine = (tx % 8 === 0 || tx % 8 === 1 || ty % 8 === 0 || ty % 8 === 1);
  if (onLine && rng.chance(dt * 0.5)) {
    const turns = [-Math.PI / 2, Math.PI / 2];
    v.angle += rng.pick(turns);
  }
  const target = v.def.topSpeed * 0.45;
  if (v.speed < target) v.speed += v.def.accel * 0.5 * dt;
  else v.speed -= 40 * dt;
  updateVehicle(v, { forward: true, back: false, left: false, right: false, brake: false }, dt, world, others);
  // Keep traffic on the road grid: if it wanders off-road, steer back.
  if (!world.isRoadTile(Math.floor(v.x / TILE), Math.floor(v.y / TILE))) {
    const p = world.randomRoadPoint();
    v.x = p.x;
    v.y = p.y;
    v.angle = rng.chance(0.5) ? 0 : Math.PI / 2;
  }
}
