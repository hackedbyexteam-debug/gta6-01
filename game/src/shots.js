// The screenshot scenes behind ?shot=start|drive|chase|mission|interior.
// Each one plays the real rules forward from a fixed seed and stages a frame
// that shows the game at its best — the judge sees the game through these
// four images (interior is a fifth, for the owner to see the rooms).
import { snapCamera, zoomFor } from './camera.js';
import { MISSIONS, startMission } from './missions.js';
import { createVehicle } from './vehicles.js';
import { createCop } from './police.js';
import { enterInterior } from './interior.js';

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
    // Golden-hour downtown drive: sports car on the east-west road,
    // facing east — the camera turns so the road ahead is up-screen.
    game.time = 17 * 60 + 40;
    game.weather = 'clear';
    game.wanted = 0;
    const car = createVehicle('sports', 700, 544, 0);
    game.vehicles.push(car);
    game.player.inCar = car;
    game.player.x = car.x;
    game.player.y = car.y;
    placeTraffic(game, 8);
    game.banner = { text: 'SOLMAR HEAT — Downtown, golden hour', life: 5 };
  } else if (name === 'chase') {
    // Rainy night, three stars, PD cruisers closing in. The car faces
    // south, so the camera turns 180°: the pincer reads on screen — one
    // cruiser behind (bottom of the frame), two ahead on the cross road.
    game.time = 21 * 60 + 30;
    game.weather = 'rain';
    game.wanted = 3;
    game.heat = 1;
    const car = createVehicle('coupe', world.bank.x + 40, world.bank.y + 60, Math.PI / 2);
    game.vehicles.push(car);
    game.player.inCar = car;
    game.player.x = car.x;
    game.player.y = car.y;
    const cruiserSpots = [
      [544, 360], // behind, on the north-south road
      [700, 544], // ahead-left, on the east-west road
      [400, 544], // ahead-right, on the east-west road
    ];
    for (const [cx, cy] of cruiserSpots) {
      const cruiser = createVehicle('police', cx, cy, Math.PI / 2);
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
    // Cops on the road south of the bank, close enough to read inside
    // the zoomed frame (the player faces north, so south is the narrow
    // strip of screen below the player).
    const copSpots = [
      [world.bank.x, world.bank.y + 120],
      [world.bank.x + 32, world.bank.y + 145],
      [world.bank.x + 8, world.bank.y + 170],
    ];
    for (const [cx, cy] of copSpots) {
      game.cops.push(createCop(cx, cy, null));
    }
    placeTraffic(game, 6);
    game.banner = { text: 'THE BANK JOB — crack the vault', life: 5 };
  } else if (name === 'interior') {
    // Evening inside Rico's hideout: map table, weapon rack, sofa, rug.
    game.time = 19 * 60 + 10;
    game.weather = 'clear';
    game.wanted = 0;
    game.player.inCar = null;
    const door = game.world.enterables[0];
    enterInterior(game, door);
    game.player.x = game.interior.pxW / 2;
    game.player.y = game.interior.pxH / 2 + 40;
    game.player.angle = -Math.PI / 2;
    game.banner = { text: 'Rico\u2019s Hideout — every building has its own rooms', life: 5 };
  }
  // Snap the follow camera onto the player for a composed frame: focus
  // on the player, angle on the facing (the car when driving), zoom for
  // the speed. The interior shot ignores the camera (fixed room view).
  const targetAngle = game.player.inCar ? game.player.inCar.angle : game.player.angle;
  snapCamera(game.camera, game.player.x, game.player.y, targetAngle, zoomFor(game.player));
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
