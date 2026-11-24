// Vehicles: definitions, driving physics and damage. A car is a circle with
// a heading; steering bites harder the faster it goes, and the handbrake
// throws the tail out. Buildings stop cars dead (with damage); other cars
// bump and scrape.
import { VEHICLES } from './config.js';

// Per-type body shapes the renderer draws (and the harness checks):
// length/width in px, cabin offset from center (+ = toward the front),
// cabin length, and the extras that make each type read at a glance.
export const CAR_SHAPES = {
  sedan: { len: 46, wid: 22, cabin: 4, cabinLen: 18, kind: 'sedan' },
  taxi: { len: 46, wid: 22, cabin: 4, cabinLen: 18, kind: 'sedan', taxi: true },
  coupe: { len: 44, wid: 20, cabin: 2, cabinLen: 16, kind: 'coupe' },
  van: { len: 54, wid: 24, cabin: -8, cabinLen: 22, kind: 'van' },
  truck: { len: 58, wid: 24, cabin: 14, cabinLen: 12, kind: 'truck' },
  sports: { len: 48, wid: 20, cabin: 0, cabinLen: 16, kind: 'sports', spoiler: true },
  police: { len: 46, wid: 22, cabin: 4, cabinLen: 18, kind: 'sedan', police: true },
};

export function carShape(id) {
  return CAR_SHAPES[id] || CAR_SHAPES.sedan;
}

export function vehicleDef(id) {
  return VEHICLES.find((v) => v.id === id) || VEHICLES[0];
}

export function createVehicle(defId, x, y, angle) {
  const def = vehicleDef(defId);
  // A deterministic shade variation so two sedans on the street never look
  // identical: -2..2 steps of lightness from the base colour.
  const tint = (((Math.round(x) * 13 + Math.round(y) * 7) % 5) + 5) % 5 - 2;
  return {
    def, x, y, angle: angle || 0, speed: 0,
    health: def.health, color: def.color, tint,
    dead: false, skid: 0, honk: 0,
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
    // Slide along the wall: try each axis separately, so a diagonal
    // approach to a building corner glides around it instead of wedging
    // the car forever. The point check above rejects the whole step, so
    // without this a car aimed at a corner just judders in place: the
    // playthrough wedged 6x at the same corner (1345,1216) this way.
    let slid = false;
    if (!world.buildingAt(nx, v.y)) { v.x = nx; slid = true; }
    else if (!world.buildingAt(v.x, ny)) { v.y = ny; slid = true; }
    if (!slid) {
      // Head-on: stop dead with a small bounce (and damage if fast).
      if (Math.abs(v.speed) > 140) {
        v.health -= Math.abs(v.speed) * 0.06;
        v.speed *= -0.25;
      } else {
        v.speed *= -0.15;
      }
    } else {
      // A graze: scrub a little speed, keep rolling along the wall.
      v.speed *= 0.98;
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

// Full repair: back to factory health, alive again, kept rolling at its
// current speed. One place for it, so the garage shop, Nia's Field Repair
// and any future fix can never drift apart (a repaired car that stayed
// dead was the old inline bug waiting to happen).
export function repairVehicle(v) {
  if (!v) return false;
  v.health = v.def.health;
  v.dead = false;
  v.exploded = false;
  v.explodedShown = false;
  return true;
}
