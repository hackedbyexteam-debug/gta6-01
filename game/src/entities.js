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
    // Dario Kane: teal jacket, black hair, dark jeans — the look that
    // reads in the dark, under neon, from a chase camera.
    color: '#2a9d8f', hair: '#1a1a1a', pants: '#232a38', hat: false,
  };
}

// On-foot movement. move is a WORLD-space vector {mx, my, sprint} — the
// caller converts WASD to world space relative to the facing (see
// relativeMove in camera.js), so W always walks up-screen under the
// rotating camera. The facing angle lives with the caller (mouse aim, or
// the movement direction when the mouse has never moved); this function
// never sets it, so walking never fights the aim.
export function updatePlayerOnFoot(p, move, dt, world, vehicles) {
  const speed = move.sprint ? 210 : 135;
  const mx = move.mx || 0;
  const my = move.my || 0;
  p.walking = mx !== 0 || my !== 0;
  if (p.walking) {
    const len = Math.hypot(mx, my) || 1;
    const nx = p.x + (mx / len) * speed * dt;
    const ny = p.y + (my / len) * speed * dt;
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
    radius: 11,
    // Varied clothes so the crowd never looks like clones.
    color: rng.pick(['#e8b73a', '#7d8aa0', '#a03a3a', '#5a7d5a', '#d4d4d4', '#3a6b8a', '#c86b8a', '#6b5a8a', '#2a9d8f', '#e8762a']),
    hair: rng.pick(['#1a1a1a', '#4a2f1a', '#8a6b3a', '#a8a8a8', '#5a2a1a', '#2a2a2a', '#7a4a2a']),
    pants: rng.pick(['#2a3a5c', '#3a3a3a', '#5c4a3a', '#2f4a3a', '#4a4a5a', '#6b5a3a']),
    hat: rng.chance(0.22),
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
  // Cruise forward; at intersections sometimes turn. A car only turns
  // while it is actually on the road — a car that has wandered off-road
  // steers back instead of turning further into the blocks.
  const tx = Math.floor(v.x / TILE);
  const ty = Math.floor(v.y / TILE);
  const onRoad = world.isRoadTile(tx, ty);
  const onLine = (tx % 8 === 0 || tx % 8 === 1 || ty % 8 === 0 || ty % 8 === 1);
  if (onRoad && onLine && rng.chance(dt * 0.5)) {
    const turns = [-Math.PI / 2, Math.PI / 2];
    v.angle += rng.pick(turns);
  }
  if (!onRoad) {
    // Steer back to the nearest road line — never teleport. Road tile
    // indices are 8k and 8k+1; the car aims at whichever line (the
    // vertical or the horizontal one) is closer, and drives there. If
    // it wedges against a building (speed collapsed for 0.5 s while
    // off-road), it tries the other axis instead of grinding the same
    // wall forever — the old code teleported it out, which was a
    // visible pop; this is the honest fix.
    const roadIdx = [8, 9, 16, 17, 24, 25, 32, 33, 40, 41, 48, 49, 56, 57];
    const nearest = (t) => {
      let best = roadIdx[0];
      let bd = Infinity;
      for (const r of roadIdx) {
        const d = Math.abs(r - t);
        if (d < bd) { bd = d; best = r; }
      }
      return best;
    };
    const nx = (nearest(tx) + 0.5) * TILE;
    const ny = (nearest(ty) + 0.5) * TILE;
    const closerX = Math.abs(nx - v.x) < Math.abs(ny - v.y);
    if (v.offRoadAxis === undefined) v.offRoadAxis = closerX ? 'x' : 'y';
    if (Math.abs(v.speed) < 15) {
      v.offRoadStuckT = (v.offRoadStuckT || 0) + dt;
      if (v.offRoadStuckT > 0.5) {
        v.offRoadAxis = v.offRoadAxis === 'x' ? 'y' : 'x';
        v.offRoadStuckT = 0;
      }
    } else {
      v.offRoadStuckT = 0;
    }
    const goX = v.offRoadAxis === 'x';
    v.angle = Math.atan2(goX ? 0 : ny - v.y, goX ? nx - v.x : 0);
  } else {
    v.offRoadAxis = undefined;
    v.offRoadStuckT = 0;
  }
  const target = v.def.topSpeed * 0.45;
  if (v.speed < target) v.speed += v.def.accel * 0.5 * dt;
  else v.speed -= 40 * dt;
  updateVehicle(v, { forward: true, back: false, left: false, right: false, brake: false }, dt, world, others);
}
