// SOLMAR HEAT — the game itself. Boots the world, runs the loop, and wires
// every system together: driving, combat, police (cruisers, roadblocks,
// helicopter), missions, shops, the taxi side job, street races, crew
// abilities, day and night, and the save. ?seed=N fixes the world; ?shot=
// stages one deterministic screenshot scene instead of the loop.
//
// Rendering is split in two: the city is true 3D (three.js, render.js) on
// the #game canvas, and the HUD, minimap and menus are 2D (hud.js) on the
// #hud overlay canvas above it.
import { START_MINUTES, DAY_LENGTH, RACE, WEAPONS, districtAtPoint } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createInput, ACTION } from './input.js';
import { createAudio } from './audio.js';
import { createVehicle, updateVehicle, damageVehicle, repairVehicle } from './vehicles.js';
import { createPlayer, updatePlayerOnFoot, createPed, updatePed, createTrafficCar, updateTrafficCar } from './entities.js';
import { createArsenal, weaponDef, shoot, reloadWeapon, updatePickups, buyWeapon, updateProjectiles } from './combat.js';
import { updatePolice, damagePlayer, clearWantedAtGarage } from './police.js';
import { MISSIONS as MISSION_DEFS, startMission, updateMission, currentStep, locationPoint, objectivePoint } from './missions.js';
import { enterInterior, exitInterior, interiorDoorAt, updateInteriorPlayer } from './interior.js';
import { createCamera, updateCamera, snapCamera, relativeMove, zoomFor } from './camera.js';
import { init3D, render3D, renderInterior3D, drawInterior, projectToScreen, screenToWorld3D } from './render.js';
import { drawHUD, drawTitle, drawBriefing, drawPhone, drawPaused, drawDead, drawBusted, drawComplete } from './hud.js';
import { saveGame, loadGame, clearSave, applySave } from './save.js';
import { stageShot } from './shots.js';
import { createCrewState, triggerCrew, updateCrew, slipstreamActive } from './crew.js';
import { createRaceState, tryStartRace, updateRace, raceActive } from './race.js';

const VIEW_W = 1280;
const VIEW_H = 720;

const canvas = document.getElementById('game');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const hudCanvas = document.getElementById('hud');
hudCanvas.width = VIEW_W;
hudCanvas.height = VIEW_H;
const ctx = hudCanvas.getContext('2d');

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261122;
const shot = params.get('shot');

const game = {
  seed,
  rng: createRandom(seed),
  world: null,
  player: null,
  vehicles: [],
  peds: [],
  cops: [],
  particles: [],
  pickups: [],
  tracers: [],
  explosions: [],
  money: 150,
  wanted: 0,
  heat: 0,
  arsenal: createArsenal(),
  time: START_MINUTES,
  weather: 'clear',
  weatherTimer: 45,
  camera: createCamera(0, 0),
  // The world point under the mouse cursor, set only when the mouse moves
  // (see the aim note in updatePlaying). The aim line points at it.
  aimWorld: null,
  state: 'title',
  stats: { kills: 0, shotsFired: 0, carsStolen: 0, missionsDone: 0, moneyEarned: 0 },
  completedMissions: [],
  missionIndex: 0,
  mission: null,
  pendingMission: null,
  banner: null,
  input: createInput(canvas),
  audio: createAudio(),
  images: {},
  saveExists: false,
  shop: null,
  fare: null,
  fareTimer: 20,
  bustedTimer: 0,
  savedMissions: 0,
  // Interiors: 'outdoor' (the city) or 'interior' (inside a building).
  mode: 'outdoor',
  interior: null,
  interiorReturn: null,
  interiorCooldown: 0,
  muzzle: null,
  projectiles: [],
  scoped: false,
  // Title intro clock (real seconds, not game dt — at SwiftShader speed
  // game dt would stretch a 2.5 s intro into a minute). Drives the logo
  // entrance in drawTitle and the slow camera pan behind the menu.
  titleT: 0,
  // Round-3 systems.
  crew: createCrewState(),
  race: createRaceState(),
  standing: { downtown: 0, ironworks: 0, central: 0, harbor: 0, beach: 0 },
  standingDistrict: 'downtown',
  heli: null,
  roadblocks: [],
  roadblockSet: false,
  settings: { music: true, camera: 'near' },
  titleSel: 0,
  settingsOpen: false,
  // The E-key's current target, recomputed every frame (see
  // interactTarget): what E will actually do, and the HUD hint for it.
  interact: null,
  _frame: 0,
  _lastKills: 0,
  _lastDt: 0.016,
};

game.objectivePoint = () => {
  if (game.mission) return objectivePoint(game);
  if (game.missionIndex < MISSION_DEFS.length) {
    const def = MISSION_DEFS[game.missionIndex];
    return locationPoint(game.world, def.steps[0].at || 'hideout');
  }
  return null;
};

function loadImage(name, src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { game.images[name] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = src;
  });
}

function bootWorld() {
  game.world = createWorld(game.rng);
  game.player = createPlayer(game.world.spawn.x, game.world.spawn.y);
  // Parked cars ON the road by the hideout, so the player always has wheels
  // within one keypress of spawning (E to enter). They sit on the east edge
  // of the road, clear of the player's north walking line.
  const nearHideout = [
    [game.world.hideout.x + 38, game.world.hideout.y, 0],
    [game.world.hideout.x + 38, game.world.hideout.y - 96, Math.PI / 2],
    [game.world.hideout.x + 38, game.world.hideout.y + 96, -Math.PI / 2],
  ];
  for (const [cx, cy, ang] of nearHideout) {
    game.vehicles.push(createVehicle(['sedan', 'coupe', 'taxi'][game.vehicles.length % 3], cx, cy, ang));
  }
  // Parked cars around the hideout so the player always has wheels nearby.
  // Types shuffled on the seeded stream: same seed, same street.
  const parkedTypes = game.rng.shuffle(['sedan', 'taxi', 'coupe', 'van']);
  for (let i = 0; i < 10; i++) {
    const p = game.world.randomRoadPoint();
    const v = createVehicle(parkedTypes[i % 4], p.x, p.y, (i % 4) * (Math.PI / 2));
    game.vehicles.push(v);
  }
  for (let i = 0; i < 8; i++) {
    game.vehicles.push(createTrafficCar(game.world, game.rng));
  }
  for (let i = 0; i < 12; i++) {
    const p = game.world.randomRoadPoint();
    game.peds.push(createPed(p.x, p.y, game.rng));
  }
  // A little cash and health lying around the hideout.
  game.pickups.push({ x: game.world.spawn.x + 60, y: game.world.spawn.y, kind: 'cash', value: 50, life: 999, bob: 0 });
  game.pickups.push({ x: game.world.spawn.x - 60, y: game.world.spawn.y, kind: 'health', value: 25, life: 999, bob: 0 });
  // The particle pool: 300 preallocated spark slots (see combat.js).
  // Nothing in the game ever pushes a particle object again — spawning
  // reuses a dead slot, so combat never allocates mid-frame.
  for (let i = 0; i < 300; i++) {
    game.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0.4, color: '#ffffff' });
  }
  const saved = loadGame();
  game.saveExists = !!saved;
  if (saved && shot) applySave(game, saved);
}

function nearestVehicle(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const v of game.vehicles) {
    if (v.dead) continue;
    const d = Math.hypot(v.x - game.player.x, v.y - game.player.y);
    if (d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

function nearestShop(maxDist) {
  for (const key of Object.keys(game.world.shops)) {
    const s = game.world.shops[key];
    if (Math.hypot(s.x - game.player.x, s.y - game.player.y) < maxDist) return key;
  }
  return null;
}

function enterCar() {
  const v = nearestVehicle(56);
  if (!v) return;
  if (v.traffic) {
    v.traffic = false;
    game.stats.carsStolen += 1;
    const copNear = game.cops.some((c) => Math.hypot(c.x - game.player.x, c.y - game.player.y) < 500);
    if (copNear) {
      game.wanted = Math.min(5, game.wanted + 1);
      game.heat = 1;
    }
  }
  game.player.inCar = v;
  game.player.x = v.x;
  game.player.y = v.y;
  game.audio.ui();
}

function exitCar() {
  const v = game.player.inCar;
  if (!v) return;
  game.player.inCar = null;
  game.player.x = v.x + Math.cos(v.angle + Math.PI / 2) * 30;
  game.player.y = v.y + Math.sin(v.angle + Math.PI / 2) * 30;
  game.audio.ui();
}

function tryStartMission() {
  if (game.mission || game.missionIndex >= MISSION_DEFS.length) return false;
  const pt = game.objectivePoint();
  if (!pt) return false;
  if (Math.hypot(game.player.x - pt.x, game.player.y - pt.y) < 90) {
    game.pendingMission = MISSION_DEFS[game.missionIndex];
    game.state = 'briefing';
    game.audio.ui();
    return true;
  }
  return false;
}

// What E will do right now — the single source of truth for both the
// E-handler and the HUD hint, so the hint can never promise one thing
// while E does another. Priority, by context: a mission start beats a
// car, a car beats a shop. The old order checked the shop first, so at
// the Pit Stop Garage E opened the shop instead of starting Mission 1
// or entering the sedan parked there — and merely swapping the order
// would have shadowed something else instead. A shop only wins when no
// mission and no car is pending; it is still reachable everywhere else.
function interactTarget() {
  const p = game.player;
  if (p.inCar) {
    if (!game.mission && Math.hypot(p.x - RACE.start.x, p.y - RACE.start.y) <= 70) {
      return { kind: 'race', label: 'E start street race' };
    }
    return { kind: 'exit', label: 'E exit car' };
  }
  if (!game.mission && game.missionIndex < MISSION_DEFS.length) {
    const pt = game.objectivePoint();
    if (pt && Math.hypot(p.x - pt.x, p.y - pt.y) < 90) {
      return { kind: 'mission', label: `E start job: ${MISSION_DEFS[game.missionIndex].title}` };
    }
  }
  const car = nearestVehicle(56);
  if (car) return { kind: 'car', label: `E enter ${car.def.name}`, car };
  const shop = nearestShop(80);
  if (shop) return { kind: 'shop', label: `E open ${game.world.shops[shop].name}`, shop };
  return null;
}

function shopItems(key) {
  if (key === 'gunsmith') {
    // Every weapon the player does not own yet, in arsenal order, then
    // ammo for the current weapon — the list grows with the arsenal, so
    // the bazooka and sniper show up here exactly like the SMG does.
    const items = [];
    let n = 1;
    for (const w of WEAPONS) {
      if (w.id === 'fists' || game.arsenal.owned.includes(w.id)) continue;
      const id = w.id;
      items.push({ label: `Buy ${w.name} — $${w.price}`, key: String(n), run: () => { const r = buyWeapon(game.arsenal, id, game.money); if (r.ok) game.money = r.money; return r.ok ? `${w.name} bought` : r.reason; } });
      n++;
    }
    items.push({ label: 'Ammo for current weapon — $50', key: String(n), run: () => { const def = weaponDef(game.arsenal.current); if (def.id === 'fists' || game.money < 50) return 'no ammo for fists / not enough cash'; game.money -= 50; game.arsenal.reserve[def.id] += def.mag; return 'Ammo bought'; } });
    return items;
  }
  if (key === 'garage') {
    return [
      { label: 'Repair your car — $100', key: '1', run: () => { if (!game.player.inCar || game.money < 100) return 'need a car / not enough cash'; game.money -= 100; repairVehicle(game.player.inCar); return 'Car repaired'; } },
      { label: 'Clear wanted level — $150 + $100/star', key: '2', run: () => { const r = clearWantedAtGarage(game); return r.ok ? 'Wanted cleared' : r.reason; } },
    ];
  }
  return [
    { label: 'Heal to full — $80', key: '1', run: () => { if (game.money < 80) return 'not enough cash'; game.money -= 80; game.player.health = 100; return 'Healed'; } },
    { label: 'Buy armor — $200', key: '2', run: () => { if (game.money < 200) return 'not enough cash'; game.money -= 200; game.player.armor = 100; return 'Armor bought'; } },
  ];
}

function updatePlaying(dt) {
  const p = game.player;
  const input = game.input;
  game.audio.unlock();
  game.time = (game.time + dt * (1440 / DAY_LENGTH)) % 1440;
  game.weatherTimer -= dt;
  if (game.weatherTimer <= 0) {
    game.weatherTimer = 45 + Math.random() * 40;
    game.weather = game.weather === 'rain' ? 'clear' : (Math.random() < 0.3 ? 'rain' : 'clear');
  }
  if (game.muzzle) {
    game.muzzle.life -= dt;
    if (game.muzzle.life <= 0) game.muzzle = null;
  }
  game.interiorCooldown = Math.max(0, game.interiorCooldown - dt);
  updateCrew(game, dt);
  // Aiming down the scope: right mouse held, on foot, rifle or sniper in
  // hand. The renderer narrows the FOV for the zoom and combat drops the
  // spread to zero, so a scoped shot is the accurate one.
  game.scoped = !p.inCar && input.mouse.rightDown &&
    (game.arsenal.current === 'rifle' || game.arsenal.current === 'sniper');
  // District standing: the district you are standing in right now.
  game.standingDistrict = districtAtPoint(p.x, p.y).id;
  if (game.stats.kills > game._lastKills) {
    const d = game.standingDistrict;
    game.standing[d] = Math.max(-100, (game.standing[d] || 0) - 3 * (game.stats.kills - game._lastKills));
    game._lastKills = game.stats.kills;
  }

  // Inside a building the world pauses: just walk the room and find the exit.
  if (game.mode === 'interior' && game.interior) {
    updateInteriorPlayer(p, {
      up: input.held(ACTION.UP),
      down: input.held(ACTION.DOWN),
      left: input.held(ACTION.LEFT),
      right: input.held(ACTION.RIGHT),
      sprint: input.held(ACTION.SPRINT),
    }, dt, game.interior);
    const ex = game.interior.exit;
    // The exit sits in the wall (pxH - WALL/2) but the wall clamp holds
    // the player at WALL/2 + radius = 29 px from it, so the trigger
    // radius must exceed 29 — at 28 the door could never be reached and
    // the player was trapped in the room.
    if (Math.hypot(p.x - ex.x, p.y - ex.y) < 36) exitInterior(game);
    // The particle pool never shrinks: dead slots just sit at life 0.
    for (const pt of game.particles) {
      if (pt.life <= 0) continue;
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    if (game.banner) {
      game.banner.life -= dt;
      if (game.banner.life <= 0) game.banner = null;
    }
    return;
  }

  // Crew abilities (Q / F / C).
  if (input.pressed(ACTION.CREW_NIA)) game.banner = { text: triggerCrew(game, 'nia'), life: 2.5 };
  if (input.pressed(ACTION.CREW_IVY)) game.banner = { text: triggerCrew(game, 'ivy'), life: 2.5 };
  if (input.pressed(ACTION.CREW_ROOK)) game.banner = { text: triggerCrew(game, 'rook'), life: 2.5 };
  if (input.pressed(ACTION.CAMTOGGLE)) {
    game.settings.camera = game.settings.camera === 'far' ? 'near' : 'far';
    game.banner = { text: `Camera: ${game.settings.camera.toUpperCase()}`, life: 1.5 };
  }

  // Movement: on foot or driving.
  if (p.inCar) {
    const car = p.inCar;
    if (car.dead) {
      p.inCar = null;
      p.x = car.x + 30;
      p.y = car.y + 30;
      game.audio.crash();
    } else {
      const hit = updateVehicle(car, {
        forward: input.held(ACTION.UP),
        back: input.held(ACTION.DOWN),
        left: input.held(ACTION.LEFT),
        right: input.held(ACTION.RIGHT),
        brake: input.held(ACTION.SPRINT),
      }, dt, game.world, game.vehicles);
      if (hit && Math.abs(car.speed) > 150) game.audio.crash();
      // Slipstream (Rook): the car pulls harder while the boost lasts.
      if (slipstreamActive(game)) {
        car.speed = Math.min(car.def.topSpeed * 1.2, car.speed + 90 * dt);
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      game.audio.setEngine(Math.abs(car.speed) / car.def.topSpeed);
    }
  } else {
    // On foot: WASD moves relative to the facing, so W always walks
    // up-screen under the rotating camera (see relativeMove).
    const mv = relativeMove(p.angle,
      input.held(ACTION.UP), input.held(ACTION.DOWN),
      input.held(ACTION.LEFT), input.held(ACTION.RIGHT));
    updatePlayerOnFoot(p, {
      mx: mv.mx, my: mv.my, sprint: input.held(ACTION.SPRINT),
    }, dt, game.world, game.vehicles);
    game.audio.setEngine(0);
    // Facing: the mouse aims the character. The aim is raycast ONLY when
    // the mouse moves this frame — recomputing it every frame against a
    // moving chase camera would chase its own tail and the camera would
    // never settle. Keyboard-only play (mouse never moved) faces the
    // direction you walk instead.
    if (input.mouse.moved) {
      const w = screenToWorld3D(game, input.mouse.x, input.mouse.y);
      game.aimWorld = w;
      p.angle = Math.atan2(w.y - p.y, w.x - p.x);
    } else if (!input.mouse.seen && p.walking) {
      p.angle = Math.atan2(mv.my, mv.mx);
    }
    // Shoot along the facing (which is the aim direction).
    if (input.mouse.down || input.mouse.clicked) {
      shoot(game, p.x, p.y, p.angle);
    }
    if (input.pressed(ACTION.RELOAD)) reloadWeapon(game);
    // Weapon select 1-7.
    const numKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'];
    numKeys.forEach((code, i) => {
      if (game._numPressed && game._numPressed.has(code)) {
        const def = weaponDef(['fists', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'bazooka'][i]);
        if (game.arsenal.owned.includes(def.id)) game.arsenal.current = def.id;
      }
    });
  }

  // Walk into a building's door and you step inside (on foot only).
  if (!p.inCar && game.interiorCooldown <= 0) {
    const door = interiorDoorAt(game.world, p.x, p.y);
    if (door) enterInterior(game, door);
  }

  // Enter / exit cars, shops, missions, street race — all through the
  // one interactTarget() above, so E always does what the hint says.
  game.interact = interactTarget();
  if (input.pressed(ACTION.ENTER)) {
    const it = game.interact;
    if (p.inCar) {
      if (!tryStartRace(game)) exitCar();
    } else if (!it) {
      // Nothing in range: E does nothing (no shop, no car, no job).
    } else if (it.kind === 'mission') {
      tryStartMission();
    } else if (it.kind === 'car') {
      enterCar();
    } else if (it.kind === 'shop') {
      game.shop = { key: it.shop, items: shopItems(it.shop), message: '' };
      game.state = 'shop';
    }
  }
  if (input.pressed(ACTION.PAUSE)) {
    game.state = 'paused';
    saveGame(game);
  }
  if (input.pressed(ACTION.PHONE)) game.state = 'phone';
  if (input.pressed(ACTION.MUSIC)) {
    const on = game.audio.toggleMusic();
    game.settings.music = on;
    game.banner = { text: on ? 'Music ON' : 'Music OFF', life: 1.5 };
  }

  // Missions, police, pickups, race.
  updateMission(game, dt);
  updatePolice(game, dt, game.rng);
  updatePickups(game, dt);
  updateRace(game, dt);
  checkExplosions(game, dt);
  updateProjectiles(game, dt);

  // Peds and traffic near the camera.
  for (const ped of game.peds) {
    updatePed(ped, dt, game.world, game.wanted > 0 ? p : null);
  }
  for (const v of game.vehicles) {
    if (v.traffic) updateTrafficCar(v, dt, game.world, game.rng, game.vehicles);
  }
  // Peds: one in-place pass (dead, or wandered far from the player).
  for (let i = game.peds.length - 1; i >= 0; i--) {
    const pd = game.peds[i];
    if (pd.dead || Math.hypot(pd.x - p.x, pd.y - p.y) >= 1600) {
      game.peds[i] = game.peds[game.peds.length - 1];
      game.peds.pop();
    }
  }
  while (game.peds.length < 12) {
    const pt = game.world.randomRoadPoint();
    if (Math.hypot(pt.x - p.x, pt.y - p.y) < 1400) game.peds.push(createPed(pt.x, pt.y, game.rng));
  }
  let trafficCount = 0;
  for (const v of game.vehicles) if (v.traffic) trafficCount++;
  if (trafficCount < 8) {
    const v = createTrafficCar(game.world, game.rng);
    if (Math.hypot(v.x - p.x, v.y - p.y) < 1500) game.vehicles.push(v);
  }
  // One in-place pass over the vehicles: drop dead traffic and wrecks
  // far from the player. (The old code ran two filter() allocations
  // over the same list every frame.)
  for (let i = game.vehicles.length - 1; i >= 0; i--) {
    const v = game.vehicles[i];
    const far = Math.hypot(v.x - p.x, v.y - p.y) >= 1600;
    const drop = (v.dead && v.traffic) || (v.dead && far && v !== p.inCar && !v.traffic);
    if (drop) {
      game.vehicles[i] = game.vehicles[game.vehicles.length - 1];
      game.vehicles.pop();
    }
  }

  // Taxi side job: fares find you while you drive a cab.
  updateTaxi(dt);

  // Particles, tracers, banner: the pools never shrink or reallocate —
  // dead slots sit at life 0 and are skipped by the renderer.
  for (const pt of game.particles) {
    if (pt.life <= 0) continue;
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
  for (let i = game.tracers.length - 1; i >= 0; i--) {
    game.tracers[i].life -= dt;
    if (game.tracers[i].life <= 0) {
      game.tracers[i] = game.tracers[game.tracers.length - 1];
      game.tracers.pop();
    }
  }
  for (let i = game.explosions.length - 1; i >= 0; i--) {
    game.explosions[i].life -= dt * 1.1;
    if (game.explosions[i].life <= 0) {
      game.explosions[i] = game.explosions[game.explosions.length - 1];
      game.explosions.pop();
    }
  }
  if (game.banner) {
    game.banner.life -= dt;
    if (game.banner.life <= 0) game.banner = null;
  }

  // Busted: on foot, low health, a cop on top of you.
  if (game.wanted > 0 && !p.inCar && p.health <= 25) {
    const near = game.cops.some((c) => !c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 30);
    game.bustedTimer = near ? game.bustedTimer + dt : 0;
    if (game.bustedTimer > 1.5) {
      game.state = 'busted';
      game.bustedTimer = 0;
    }
  } else game.bustedTimer = 0;

  // Siren when the PD is close and the heat is on.
  const copNear = game.cops.some((c) => !c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 700);
  game.audio.setSiren(game.wanted >= 2 && copNear);

  // Third-person chase camera: swings onto the facing (the car when
  // driving) and pulls back as speed rises.
  const targetAngle = p.inCar ? p.inCar.angle : p.angle;
  updateCamera(game.camera, p.x, p.y, targetAngle, zoomFor(p), dt);

  // Death and story end.
  if (p.dead) {
    game.state = 'dead';
    game.audio.setSiren(false);
    game.audio.setEngine(0);
    return;
  }
  if (game.missionIndex >= MISSION_DEFS.length && !game.mission && game.state === 'playing') {
    game.state = 'complete';
    saveGame(game);
  }
  // Autosave when a mission completes.
  if (game.completedMissions.length !== game.savedMissions) {
    game.savedMissions = game.completedMissions.length;
    saveGame(game);
  }
}

// A car that just died explodes: a fireball, a shockwave that hurts
// everyone close by, and a burnt-out wreck left behind.
function checkExplosions(game, dt) {
  for (const v of game.vehicles) {
    if (v.dead && !v.exploded) {
      v.exploded = true;
      game.explosions.push({ x: v.x, y: v.y, life: 1 });
      game.audio.crash();
      const p = game.player;
      if (p.inCar !== v && Math.hypot(p.x - v.x, p.y - v.y) < 110) damagePlayer(game, 20);
      for (const ped of game.peds) {
        if (!ped.dead && Math.hypot(ped.x - v.x, ped.y - v.y) < 100) ped.dead = true;
      }
      for (const cop of game.cops) {
        if (!cop.dead && Math.hypot(cop.x - v.x, cop.y - v.y) < 100) {
          cop.health -= 60;
          if (cop.health <= 0) cop.dead = true;
        }
      }
    }
  }
}

function updateTaxi(dt) {
  const p = game.player;
  if (!p.inCar || p.inCar.def.id !== 'taxi') {
    game.fare = null;
    game.fareTimer = 20;
    return;
  }
  game.fareTimer -= dt;
  if (!game.fare && game.fareTimer <= 0) {
    game.fareTimer = 25;
    const pt = game.world.randomRoadPoint();
    if (Math.hypot(pt.x - p.x, pt.y - p.y) > 300 && Math.hypot(pt.x - p.x, pt.y - p.y) < 1200) {
      game.fare = { stage: 'pickup', at: pt, reward: 60 + Math.floor(Math.random() * 60) };
      game.banner = { text: 'Taxi fare — pick up the passenger', life: 3 };
    }
  }
  if (game.fare) {
    const d = Math.hypot(game.fare.at.x - p.x, game.fare.at.y - p.y);
    if (d < 70) {
      if (game.fare.stage === 'pickup') {
        const dest = game.world.randomRoadPoint();
        game.fare = { stage: 'drop', at: dest, reward: game.fare.reward };
        game.banner = { text: 'Passenger aboard — take them to the marker', life: 3 };
      } else {
        game.money += game.fare.reward;
        game.stats.moneyEarned += game.fare.reward;
        // A completed fare earns a little standing where it ended.
        const dist = districtAtPoint(p.x, p.y).id;
        game.standing[dist] = Math.min(100, (game.standing[dist] || 0) + 2);
        game.audio.cash();
        game.banner = { text: `Fare complete +$${game.fare.reward}`, life: 3 };
        game.fare = null;
        game.fareTimer = 15;
      }
    }
  }
}

function render() {
  const dt = game._lastDt;
  game._frame++;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (game.state === 'title') {
    // The 3D night city stays live behind the menu.
    render3D(game, dt);
    drawTitle(ctx, game);
    return;
  }
  if (game.mode === 'interior' && game.interior) {
    // Real 3D rooms now (render.js); the 2D overlay is the fallback if
    // the 3D room ever throws, so a bad room can never brick the game.
    let ok = true;
    try {
      renderInterior3D(game, dt);
    } catch {
      ok = false;
    }
    if (!ok) drawInterior(ctx, game);
    drawHUD(ctx, game);
    if (game.state === 'paused') drawPaused(ctx);
    else if (game.state === 'phone') drawPhone(ctx, game);
    return;
  }
  render3D(game, dt);
  if (game.fare) {
    const fs = projectToScreen(game, game.fare.at.x, game.fare.at.y);
    if (!fs.behind) {
      ctx.fillStyle = '#3ecf6e';
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(game.fare.stage === 'pickup' ? 'FARE' : 'DROP OFF', fs.x, fs.y - 18);
      ctx.textAlign = 'left';
    }
  }
  drawHUD(ctx, game);
  if (game.state === 'briefing') drawBriefing(ctx, game);
  else if (game.state === 'phone') drawPhone(ctx, game);
  else if (game.state === 'paused') drawPaused(ctx);
  else if (game.state === 'dead') drawDead(ctx, game);
  else if (game.state === 'busted') drawBusted(ctx, game);
  else if (game.state === 'complete') drawComplete(ctx, game);
  else if (game.state === 'shop') drawShop(ctx, game);
}

function drawShop(ctx, game) {
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  const shop = game.shop;
  ctx.fillStyle = 'rgba(5, 8, 14, 0.88)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 30px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(game.world.shops[shop.key].name, vw / 2, vh / 2 - 90);
  ctx.font = '16px "Segoe UI", sans-serif';
  ctx.fillStyle = '#dfe6f2';
  shop.items.forEach((item, i) => {
    ctx.fillText(`[${item.key}]  ${item.label}`, vw / 2, vh / 2 - 40 + i * 30);
  });
  ctx.fillStyle = '#3ecf6e';
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  ctx.fillText(`Cash: $${game.money}`, vw / 2, vh / 2 + 30);
  if (shop.message) {
    ctx.fillStyle = '#fff';
    ctx.fillText(shop.message, vw / 2, vh / 2 + 60);
  }
  ctx.fillStyle = '#9fb0c8';
  ctx.font = '14px "Segoe UI", sans-serif';
  ctx.fillText('Press a number to buy · ESC to leave', vw / 2, vh / 2 + 90);
  ctx.textAlign = 'left';
}

function titleItems(game) {
  if (game.settingsOpen) return ['Music', 'Camera', 'Back'];
  return game.saveExists
    ? ['Continue', 'New Game', 'Load Game', 'Settings']
    : ['New Game', 'Load Game', 'Settings'];
}

function titleActivate(game) {
  const items = titleItems(game);
  const choice = items[game.titleSel] || items[0];
  if (game.settingsOpen) {
    if (choice === 'Music') {
      game.settings.music = !game.settings.music;
      game.audio.toggleMusic();
    } else if (choice === 'Camera') {
      game.settings.camera = game.settings.camera === 'far' ? 'near' : 'far';
    } else {
      game.settingsOpen = false;
      game.titleSel = 0;
    }
    return;
  }
  if (choice === 'Continue' || choice === 'Load Game') {
    const saved = loadGame();
    if (saved) applySave(game, saved);
    game.state = 'playing';
  } else if (choice === 'New Game') {
    clearSave();
    game.saveExists = false;
    game.money = 150;
    game.missionIndex = 0;
    game.completedMissions = [];
    game.arsenal = createArsenal();
    game.player.health = 100;
    game.state = 'playing';
  } else if (choice === 'Settings') {
    game.settingsOpen = true;
    game.titleSel = 0;
    return;
  }
  game.audio.unlock();
  game.audio.ui();
}

function handleStateInput() {
  const input = game.input;
  if (game.state === 'title') {
    // The intro runs ~2.5 s; any key or click skips it straight to the
    // menu — and the skipping press is consumed, so it never also fires
    // a menu action (one Enter skips, the next one starts the game).
    if (game.titleT < 2.5 && input.anyKey()) {
      game.titleT = 2.5;
      input.consume(ACTION.CONFIRM);
      input.consume(ACTION.UP);
      input.consume(ACTION.DOWN);
      return;
    }
    const n = titleItems(game).length;
    if (input.pressed(ACTION.UP)) game.titleSel = (game.titleSel - 1 + n) % n;
    if (input.pressed(ACTION.DOWN)) game.titleSel = (game.titleSel + 1) % n;
    if (input.pressed(ACTION.CONFIRM)) titleActivate(game);
    if (input.pressed(ACTION.MUSIC)) {
      game.settings.music = !game.settings.music;
      game.audio.toggleMusic();
    }
    return;
  }
  if (game.state === 'briefing') {
    if (input.pressed(ACTION.CONFIRM) && game.pendingMission) {
      startMission(game, game.missionIndex);
      game.pendingMission = null;
      game.state = 'playing';
    } else if (input.pressed(ACTION.PAUSE)) {
      // Consume it: updatePlaying in this same frame must not see the
      // same ESC and pause the game it just returned to.
      input.consume(ACTION.PAUSE);
      game.pendingMission = null;
      game.state = 'playing';
    }
    return;
  }
  if (game.state === 'phone' || game.state === 'paused') {
    if (input.pressed(ACTION.PAUSE) || input.pressed(ACTION.PHONE)) {
      input.consume(ACTION.PAUSE);
      input.consume(ACTION.PHONE);
      game.state = 'playing';
    }
    return;
  }
  if (game.state === 'shop') {
    // Number keys 1-9 buy items.
    const codes = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
    codes.forEach((code, i) => {
      if (game._numPressed && game._numPressed.has(code) && game.shop.items[i]) {
        game.shop.message = game.shop.items[i].run();
        game.audio.pickup();
      }
    });
    if (input.pressed(ACTION.PAUSE)) {
      input.consume(ACTION.PAUSE);
      game.shop = null;
      game.state = 'playing';
    }
    return;
  }
  if (game.state === 'dead') {
    if (input.pressed(ACTION.CONFIRM)) {
      game.player.dead = false;
      game.player.health = 100;
      game.player.x = game.world.hideout.x;
      game.player.y = game.world.hideout.y;
      game.player.inCar = null;
      game.wanted = 0;
      game.heat = 0;
      game.cops = [];
      game.heli = null;
      game.mission = null;
      game.state = 'playing';
    }
    return;
  }
  if (game.state === 'busted') {
    if (input.pressed(ACTION.CONFIRM)) {
      game.money = Math.max(0, game.money - 500);
      game.wanted = 0;
      game.heat = 0;
      game.cops = [];
      game.heli = null;
      game.player.x = game.world.hideout.x;
      game.player.y = game.world.hideout.y;
      game.player.inCar = null;
      game.mission = null;
      game.state = 'playing';
    }
    return;
  }
  if (game.state === 'complete') {
    if (input.pressed(ACTION.CONFIRM)) game.state = 'playing';
  }
}

let last = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  const realDt = Math.min(0.25, (now - last) / 1000 || 0.016);
  last = now;
  game._lastDt = dt;
  // The audio timer only allocates while the game is actually playing
  // (audio.setState silences the music/siren timers otherwise).
  game.audio.setState(game.state);
  // Title intro: real seconds (game dt would stretch it under
  // SwiftShader), plus the slow camera pan over the city behind the
  // menu — a lazy orbit around downtown, facing along the flight path.
  if (game.state === 'title' && !game.shotFrozen) {
    game.titleT += realDt;
    const t = game.titleT * 0.06;
    updateCamera(game.camera,
      1024 + Math.cos(t) * 300, 1024 + Math.sin(t) * 300,
      t + Math.PI / 2, 1, dt);
  }
  // Number-key presses are tracked outside the ACTION map.
  game._numPressed = game._numPressed || new Set();
  handleStateInput();
  // A staged ?shot= frame must not drift: once stageShot has composed
  // the scene, gameplay updates stop so traffic, peds and cops hold
  // their places and the screenshot is reproducible frame for frame.
  if (game.state === 'playing' && !game.shotFrozen) updatePlaying(dt);
  render();
  game.input.endFrame();
  game._numPressed.clear();
  requestAnimationFrame(loop);
}

// Track Digit1-5 for weapon select and Digit1-9 for the shop.
window.addEventListener('keydown', (e) => {
  if (/^Digit[1-9]$/.test(e.code)) {
    game._numPressed = game._numPressed || new Set();
    game._numPressed.add(e.code);
  }
});

bootWorld();
snapCamera(game.camera, game.player.x, game.player.y, game.player.angle, zoomFor(game.player));
init3D(game, canvas);
window.__game = game;

const imageLoads = Promise.all([
  loadImage('nia', 'assets/maya.jpg'),
  loadImage('viktor', 'assets/sal.jpg'),
  loadImage('ivy', 'assets/lena.jpg'),
  // No portrait file exists for Marcus — the briefing falls back to his
  // initial in a circle, so no 404 is requested for him.
  // (assets/title.jpg was deleted: it was loaded but never drawn.)
]);
const imageTimeout = new Promise((resolve) => setTimeout(resolve, 2500));

if (shot) {
  Promise.race([imageLoads, imageTimeout]).then(() => {
    stageShot(shot, game);
    game.shotFrozen = true;
    render();
    render();
    window.__shotReady = true;
  });
} else {
  imageLoads.catch(() => {});
  requestAnimationFrame(loop);
}
