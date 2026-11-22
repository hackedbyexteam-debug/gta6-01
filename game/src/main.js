// SOLMAR HEAT — the game itself. Boots the world, runs the loop, and wires
// every system together: driving, combat, police, missions, shops, the taxi
// side job, day and night, and the save. ?seed=N fixes the world; ?shot=
// stages one deterministic screenshot scene instead of the loop.
import { START_MINUTES, DAY_LENGTH } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createInput, ACTION } from './input.js';
import { createAudio } from './audio.js';
import { createVehicle, updateVehicle, damageVehicle } from './vehicles.js';
import { createPlayer, updatePlayerOnFoot, createPed, updatePed, createTrafficCar, updateTrafficCar } from './entities.js';
import { createArsenal, weaponDef, shoot, reloadWeapon, updatePickups, buyWeapon } from './combat.js';
import { updatePolice, damagePlayer, clearWantedAtGarage } from './police.js';
import { MISSIONS as MISSION_DEFS, startMission, updateMission, currentStep, locationPoint, objectivePoint } from './missions.js';
import { enterInterior, exitInterior, interiorDoorAt, updateInteriorPlayer } from './interior.js';
import { createCamera, updateCamera, snapCamera, worldToScreen, screenToWorld, relativeMove, zoomFor, PLAYER_SCREEN_Y } from './camera.js';
import { drawWorld, drawPickups, drawVehicles, drawPeople, drawEffects, drawLighting, drawObjectiveMarker, drawInterior, lightFactor } from './render.js';
import { drawHUD, drawTitle, drawBriefing, drawPhone, drawPaused, drawDead, drawBusted, drawComplete } from './hud.js';
import { saveGame, loadGame, clearSave, applySave } from './save.js';
import { stageShot } from './shots.js';

const VIEW_W = 1280;
const VIEW_H = 720;

const canvas = document.getElementById('game');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');

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
  // Parked cars around the hideout so the player always has wheels nearby.
  for (let i = 0; i < 10; i++) {
    const p = game.world.randomRoadPoint();
    const v = createVehicle(['sedan', 'taxi', 'coupe', 'van'][i % 4], p.x, p.y, (i % 4) * (Math.PI / 2));
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
  if (game.mission || game.missionIndex >= MISSION_DEFS.length) return;
  const pt = game.objectivePoint();
  if (!pt) return;
  if (Math.hypot(game.player.x - pt.x, game.player.y - pt.y) < 90) {
    game.pendingMission = MISSION_DEFS[game.missionIndex];
    game.state = 'briefing';
    game.audio.ui();
  }
}

function shopItems(key) {
  if (key === 'gunsmith') {
    return game.arsenal.owned.length < 5
      ? [
          { label: 'Buy SMG — $1200', key: '1', run: () => { const r = buyWeapon(game.arsenal, 'smg', game.money); if (r.ok) game.money = r.money; return r.ok ? 'SMG bought' : r.reason; } },
          { label: 'Buy Shotgun — $900', key: '2', run: () => { const r = buyWeapon(game.arsenal, 'shotgun', game.money); if (r.ok) game.money = r.money; return r.ok ? 'Shotgun bought' : r.reason; } },
          { label: 'Buy Rifle — $2400', key: '3', run: () => { const r = buyWeapon(game.arsenal, 'rifle', game.money); if (r.ok) game.money = r.money; return r.ok ? 'Rifle bought' : r.reason; } },
          { label: 'Ammo for current weapon — $50', key: '4', run: () => { const def = weaponDef(game.arsenal.current); if (def.id === 'fists' || game.money < 50) return 'no ammo for fists / not enough cash'; game.money -= 50; game.arsenal.reserve[def.id] += def.mag; return 'Ammo bought'; } },
        ]
      : [{ label: 'Ammo for current weapon — $50', key: '1', run: () => { const def = weaponDef(game.arsenal.current); if (def.id === 'fists' || game.money < 50) return 'no ammo for fists / not enough cash'; game.money -= 50; game.arsenal.reserve[def.id] += def.mag; return 'Ammo bought'; } }];
  }
  if (key === 'garage') {
    return [
      { label: 'Repair your car — $100', key: '1', run: () => { if (!game.player.inCar || game.money < 100) return 'need a car / not enough cash'; game.money -= 100; game.player.inCar.health = game.player.inCar.def.health; game.player.inCar.dead = false; return 'Car repaired'; } },
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
    if (Math.hypot(p.x - ex.x, p.y - ex.y) < 28) exitInterior(game);
    for (const pt of game.particles) pt.life -= dt;
    game.particles = game.particles.filter((pt) => pt.life > 0);
    if (game.banner) {
      game.banner.life -= dt;
      if (game.banner.life <= 0) game.banner = null;
    }
    return;
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
    // Facing: the mouse aims the character. The aim is recomputed ONLY
    // when the mouse moves this frame — recomputing it every frame against
    // a rotating camera would chase its own tail and the camera would
    // never settle. Keyboard-only play (mouse never moved) faces the
    // direction you walk instead.
    if (input.mouse.moved) {
      const w = screenToWorld(game.camera, input.mouse.x, input.mouse.y);
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
    // Weapon select 1-5.
    const numKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
    numKeys.forEach((code, i) => {
      if (game._numPressed && game._numPressed.has(code)) {
        const def = weaponDef(['fists', 'pistol', 'smg', 'shotgun', 'rifle'][i]);
        if (game.arsenal.owned.includes(def.id)) game.arsenal.current = def.id;
      }
    });
  }

  // Walk into a building's door and you step inside (on foot only).
  if (!p.inCar && game.interiorCooldown <= 0) {
    const door = interiorDoorAt(game.world, p.x, p.y);
    if (door) enterInterior(game, door);
  }

  // Enter / exit cars, shops, missions.
  if (input.pressed(ACTION.ENTER)) {
    if (p.inCar) exitCar();
    else {
      const shop = nearestShop(80);
      if (shop) {
        game.shop = { key: shop, items: shopItems(shop), message: '' };
        game.state = 'shop';
      } else if (!game.mission) tryStartMission();
      else enterCar();
    }
  }
  if (input.pressed(ACTION.PAUSE)) {
    game.state = 'paused';
    saveGame(game);
  }
  if (input.pressed(ACTION.PHONE)) game.state = 'phone';
  if (input.pressed(ACTION.MUSIC)) {
    const on = game.audio.toggleMusic();
    game.banner = { text: on ? 'Music ON' : 'Music OFF', life: 1.5 };
  }

  // Missions, police, pickups.
  updateMission(game, dt);
  updatePolice(game, dt, game.rng);
  updatePickups(game, dt);

  // Peds and traffic near the camera.
  for (const ped of game.peds) {
    updatePed(ped, dt, game.world, game.wanted > 0 ? p : null);
  }
  for (const v of game.vehicles) {
    if (v.traffic) updateTrafficCar(v, dt, game.world, game.rng, game.vehicles);
  }
  game.peds = game.peds.filter((pd) => !pd.dead && Math.hypot(pd.x - p.x, pd.y - p.y) < 1600);
  while (game.peds.length < 12) {
    const pt = game.world.randomRoadPoint();
    if (Math.hypot(pt.x - p.x, pt.y - p.y) < 1400) game.peds.push(createPed(pt.x, pt.y, game.rng));
  }
  const trafficCount = game.vehicles.filter((v) => v.traffic).length;
  if (trafficCount < 8) {
    const v = createTrafficCar(game.world, game.rng);
    if (Math.hypot(v.x - p.x, v.y - p.y) < 1500) game.vehicles.push(v);
  }
  game.vehicles = game.vehicles.filter((v) => v.traffic || v === p.inCar || Math.hypot(v.x - p.x, v.y - p.y) < 1600 || !v.dead);
  game.vehicles = game.vehicles.filter((v) => !(v.dead && v.traffic));

  // Taxi side job: fares find you while you drive a cab.
  updateTaxi(dt);

  // Particles, tracers, banner.
  for (const pt of game.particles) pt.life -= dt;
  game.particles = game.particles.filter((pt) => pt.life > 0);
  for (const t of game.tracers) t.life -= dt;
  game.tracers = game.tracers.filter((t) => t.life > 0);
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

  // GTA-style follow camera: zoomed in, rotating so the facing is always
  // up-screen, the player below centre so the road ahead reads wider.
  // On foot the camera turns with you; in a car it turns with the car
  // and pulls back as speed rises.
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
        game.audio.cash();
        game.banner = { text: `Fare complete +$${game.fare.reward}`, life: 3 };
        game.fare = null;
        game.fareTimer = 15;
      }
    }
  }
}

function render() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (game.state === 'title') {
    drawTitle(ctx, game);
    return;
  }
  if (game.mode === 'interior' && game.interior) {
    drawInterior(ctx, game);
    drawHUD(ctx, game);
    if (game.state === 'paused') drawPaused(ctx);
    else if (game.state === 'phone') drawPhone(ctx, game);
    return;
  }
  // The world is drawn in WORLD coords under the camera transform:
  // translate to the player's screen spot, scale by the zoom, rotate so
  // the facing is up-screen, then shift by the camera focus. HUD, lighting
  // and the objective marker are screen space and drawn after the restore.
  const cam = game.camera;
  ctx.save();
  ctx.translate(VIEW_W / 2, VIEW_H * PLAYER_SCREEN_Y);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.rotate(-(cam.angle + Math.PI / 2));
  ctx.translate(-cam.x, -cam.y);
  drawWorld(ctx, game, cam);
  drawPickups(ctx, game, cam);
  drawVehicles(ctx, game, cam);
  drawPeople(ctx, game, cam);
  drawEffects(ctx, game, cam);
  ctx.restore();
  drawObjectiveMarker(ctx, game, cam);
  drawLighting(ctx, game);
  if (game.fare) {
    const fs = worldToScreen(cam, game.fare.at.x, game.fare.at.y);
    ctx.fillStyle = '#3ecf6e';
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(game.fare.stage === 'pickup' ? 'FARE' : 'DROP OFF', fs.x, fs.y - 18);
    ctx.textAlign = 'left';
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

function handleStateInput() {
  const input = game.input;
  if (game.state === 'title') {
    if (input.pressed(ACTION.CONFIRM)) {
      if (game.saveExists) {
        const saved = loadGame();
        if (saved) applySave(game, saved);
        game.state = 'playing';
      } else {
        game.state = 'playing';
      }
      game.audio.unlock();
      game.audio.ui();
    }
    if (input.pressed(ACTION.RELOAD)) {
      // N is mapped to RELOAD (KeyR) — start a new game.
      clearSave();
      game.saveExists = false;
      game.money = 150;
      game.missionIndex = 0;
      game.completedMissions = [];
      game.arsenal = createArsenal();
      game.player.health = 100;
      game.state = 'playing';
      game.audio.ui();
    }
    return;
  }
  if (game.state === 'briefing') {
    if (input.pressed(ACTION.CONFIRM) && game.pendingMission) {
      startMission(game, game.missionIndex);
      game.pendingMission = null;
      game.state = 'playing';
    } else if (input.pressed(ACTION.PAUSE)) {
      game.pendingMission = null;
      game.state = 'playing';
    }
    return;
  }
  if (game.state === 'phone' || game.state === 'paused') {
    if (input.pressed(ACTION.PAUSE) || input.pressed(ACTION.PHONE)) game.state = 'playing';
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
  last = now;
  // Number-key presses are tracked outside the ACTION map.
  game._numPressed = game._numPressed || new Set();
  handleStateInput();
  if (game.state === 'playing') updatePlaying(dt);
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

const imageLoads = Promise.all([
  loadImage('title', 'assets/title.jpg'),
  loadImage('maya', 'assets/maya.jpg'),
  loadImage('sal', 'assets/sal.jpg'),
  loadImage('lena', 'assets/lena.jpg'),
  loadImage('eddie', 'assets/eddie.jpg'),
]);
const imageTimeout = new Promise((resolve) => setTimeout(resolve, 2500));

if (shot) {
  Promise.race([imageLoads, imageTimeout]).then(() => {
    stageShot(shot, game);
    render();
    render();
    window.__shotReady = true;
  });
} else {
  imageLoads.catch(() => {});
  requestAnimationFrame(loop);
}
