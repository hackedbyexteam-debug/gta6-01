// Street races: a side activity that pays. Drive to the checkered start
// line on the beachfront and press E in a car — then hit 4 checkpoints
// across Solmar before the par time. Beat par and the payout doubles.
// Pure logic; render.js draws the start line and checkpoint rings, and the
// HUD shows the race objective while a race is running.
import { RACE } from './config.js';

export function createRaceState() {
  return { active: false, checkpoint: 0, timer: 0, best: null };
}

export function raceStartPoint() {
  return RACE.start;
}

export function raceActive(game) {
  return game.race && game.race.active;
}

export function raceObjective(game) {
  if (!game.race || !game.race.active) return null;
  const cp = RACE.checkpoints[game.race.checkpoint];
  return { point: cp, index: game.race.checkpoint, total: RACE.checkpoints.length, timer: game.race.timer };
}

export function tryStartRace(game) {
  if (raceActive(game) || game.mission) return false;
  const p = game.player;
  if (!p.inCar) return false;
  if (Math.hypot(p.x - RACE.start.x, p.y - RACE.start.y) > 70) return false;
  game.race = { active: true, checkpoint: 0, timer: 0, best: game.race ? game.race.best : null };
  game.banner = { text: 'STREET RACE — hit all 4 checkpoints before par time!', life: 3.5 };
  game.audio.mission();
  return true;
}

export function updateRace(game, dt) {
  if (!raceActive(game)) return;
  const r = game.race;
  r.timer += dt;
  const cp = RACE.checkpoints[r.checkpoint];
  if (!cp) return;
  const p = game.player;
  if (Math.hypot(p.x - cp.x, p.y - cp.y) < 80) {
    r.checkpoint += 1;
    game.audio.pickup();
    if (r.checkpoint >= RACE.checkpoints.length) {
      finishRace(game);
    } else {
      game.banner = { text: `CHECKPOINT ${r.checkpoint}/${RACE.checkpoints.length} — next one marked`, life: 2 };
    }
  }
  // Out of time: the race just ends, no penalty.
  if (r.timer > RACE.parSeconds + 90) {
    game.race.active = false;
    game.banner = { text: 'RACE OVER — too slow. Come back and try again.', life: 3 };
  }
}

function finishRace(game) {
  const r = game.race;
  const fast = r.timer <= RACE.parSeconds;
  const payout = fast ? RACE.reward * 2 : RACE.reward;
  game.money += payout;
  game.stats.moneyEarned = (game.stats.moneyEarned || 0) + payout;
  r.best = r.best === null ? r.timer : Math.min(r.best, r.timer);
  r.active = false;
  game.audio.cash();
  game.banner = {
    text: `RACE WON — ${Math.round(r.timer)}s${fast ? ' (under par — double payout!)' : ''}  +$${payout}`,
    life: 4,
  };
}
