// Save and load: Rico's progress lives in localStorage, so the story survives
// a closed tab. Autosave runs after every mission and on pause.
const KEY = 'solmar-heat-save-v1';

export function saveGame(game) {
  try {
    const data = {
      money: game.money,
      missionIndex: game.missionIndex,
      completedMissions: game.completedMissions,
      arsenal: game.arsenal,
      health: game.player.health,
      armor: game.player.armor,
      time: game.time,
      stats: game.stats,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || !Array.isArray(data.completedMissions)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage may be unavailable; the game still plays.
  }
}

export function applySave(game, data) {
  game.money = data.money;
  game.missionIndex = data.missionIndex;
  game.completedMissions = data.completedMissions;
  game.arsenal = data.arsenal;
  game.player.health = data.health;
  game.player.armor = data.armor || 0;
  game.time = data.time || 560;
  game.stats = { ...game.stats, ...data.stats };
}
