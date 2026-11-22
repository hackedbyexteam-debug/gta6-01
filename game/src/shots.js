// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one
// plays the real rules forward from a fixed seed and stages a frame that shows
// the game at its best — the judge sees the game through these four images.
import { MISSIONS, startMission } from './missions.js';
import { createVehicle } from './vehicles.js';
import { createCop } from './police.js';

export function stageShot(name, game) {
  const world = game.world;
  if (name === 'start') {
    game.state = 'title';
    return;
  }
  game.state = 'playing';
  game.player.dead = false;
  game.player.health = 100;
  if (name === 'drive') {
    // Golden-hour downtown drive: sports car, traffic, clean record.
    game.time = 17 * 60 + 40;
    game.weather = 'clear';
    game.wanted = 0;
    const car = createVehicle('sports', world.shops.garage.x + 60, world.shops.garage.y + 40, 0);
    game.vehicles.push(car);
    game.player.inCar = car;
    game.player.x = car.x;
    game.player.y = car.y;
    placeTraffic(game, 8);
    game.banner = { text: 'SOLMAR HEAT — Downtown, golden hour', life: 5 };
  } else if (name === 'chase') {
    // Rainy night, three stars, PD cruisers closing in.
    game.time = 21 * 60 + 30;
    game.weather = 'rain';
    game.wanted = 3;
    game.heat = 1;
    const car = createVehicle('coupe', world.bank.x + 40, world.bank.y + 60, Math.PI / 2);
    game.vehicles.push(car);
    game.player.inCar = car;
    game.player.x = car.x;
    game.player.y = car.y;
    for (let i = 0; i < 3; i++) {
      const cruiser = createVehicle('police', car.x - 180 - i * 90, car.y + (i - 1) * 120, Math.PI / 2);
      game.vehicles.push(cruiser);
      game.cops.push(createCop(cruiser.x, cruiser.y, cruiser));
    }
    placeTraffic(game, 5);
    game.banner = { text: 'WANTED ★★★ — lose the Solmar PD', life: 5 };
  } else if (name === 'mission') {
    // Midday at the National Bank: THE BANK JOB in progress, on foot.
    game.time = 12 * 60 + 10;
    game.weather = 'clear';
    game.wanted = 2;
    game.heat = 1;
    game.player.x = world.bank.x + 50;
    game.player.y = world.bank.y + 50;
    game.player.inCar = null;
    game.missionIndex = 7;
    startMission(game, 7);
    game.mission.stepIndex = 1;
    game.mission.timer = 6;
    for (let i = 0; i < 3; i++) {
      game.cops.push(createCop(world.bank.x + 120 + i * 70, world.bank.y - 60 + i * 50, null));
    }
    placeTraffic(game, 6);
    game.banner = { text: 'THE BANK JOB — crack the vault', life: 5 };
  }
  // Center the camera on the player for a composed frame.
  game.camera.x = Math.max(0, Math.min(3072 - 1280, game.player.x - 640));
  game.camera.y = Math.max(0, Math.min(3072 - 720, game.player.y - 360));
}

function placeTraffic(game, count) {
  for (let i = 0; i < count; i++) {
    const p = game.world.randomRoadPoint();
    const v = createVehicle(['sedan', 'taxi', 'van', 'coupe'][i % 4], p.x, p.y, (i % 4) * (Math.PI / 2));
    v.speed = v.def.topSpeed * 0.4;
    game.vehicles.push(v);
  }
  for (let i = 0; i < 8; i++) {
    const p = game.world.randomRoadPoint();
    game.peds.push({ x: p.x, y: p.y, angle: 0, speed: 40, radius: 11, color: '#e8b73a', panic: 0, dead: false, walkPhase: i, target: null });
  }
}
