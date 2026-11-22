// Vehicles: definitions, driving physics and damage. A car is a circle with
// a heading; steering bites harder the faster it goes, and the handbrake
// throws the tail out. Buildings stop cars dead (with damage); other cars
// bump and scrape.
import { VEHICLES } from './config.js';

export function vehicleDef(id) {
  return VEHICLES.find((v) => v.id === id) || VEHICLES[0];
}

export function createVehicle(defId, x, y, angle) {
  const def = vehicleDef(defId);
  return {
    def, x, y, angle: angle || 0, speed: 0,
    health: def.health, color: def.color, dead: false,
    skid: 0, honk: 0,
  };
}

// Move a vehicle one step. input: {forward, back, left, right, brake}.
// Returns true when it hit something solid this step.
export function updateVehicle(v, input, dt, world, others) {
  const def = v.def;
  if (input.forward) v.speed += def.accel * dt;
  if (input.back) v.speed -= def.accel * 0.9 * dt;
  if (!input.forward && !input.back) v.speed -= Math.sign(v.speed) * 60 * dt;
  if (input.brake) v.speed -= Math.sign(v.speed) * 320 * dt;
  const max = def.topSpeed;
  if (v.speed > max) v.speed = max;
  if (v.speed < -max * 0.45) v.speed = -max * 0.45;
  if (Math.abs(v.speed) < 4 && !input.forward && !input.back) v.speed = 0;

  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const grip = input.brake ? def.grip * 1.9 : def.grip;
  v.angle += steer * grip * (v.speed / max) * dt * (v.speed >= 0 ? 1 : -1);
  v.skid = input.brake && Math.abs(v.speed) > 120 ? 1 : Math.max(0, v.skid - dt * 3);

  const nx = v.x + Math.cos(v.angle) * v.speed * dt;
  const ny = v.y + Math.sin(v.angle) * v.speed * dt;
  let hit = false;
  if (world.buildingAt(nx, ny)) {
    hit = true;
    if (Math.abs(v.speed) > 140) {
      v.health -= Math.abs(v.speed) * 0.06;
      v.speed *= -0.25;
    } else {
      v.speed *= -0.15;
    }
  } else {
    v.x = nx;
    v.y = ny;
  }
  for (const o of others) {
    if (o === v || o.dead) continue;
    const dx = o.x - v.x;
    const dy = o.y - v.y;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < 34) {
      const push = (34 - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      v.x -= ux * push;
      v.y -= uy * push;
      o.x += ux * push;
      o.y += uy * push;
      v.speed *= 0.92;
      o.speed *= 0.92;
      hit = true;
    }
  }
  if (v.health <= 0 && !v.dead) {
    v.dead = true;
    v.speed = 0;
  }
  return hit;
}

export function damageVehicle(v, amount) {
  v.health -= amount;
  if (v.health <= 0) {
    v.health = 0;
    v.dead = true;
    v.speed = 0;
  }
  return v.dead;
}
