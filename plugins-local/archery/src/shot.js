export const DRAW_DURATION_MS = 1300;
export const MAX_DRAW_DISTANCE = 48;
export const MAX_SHOT_POWER = 5;

export function getDrawDistance(holdTimeMs) {
  const clamped = Math.max(0, Math.min(holdTimeMs, DRAW_DURATION_MS));
  return (clamped / DRAW_DURATION_MS) * MAX_DRAW_DISTANCE;
}

export function getShotPower(holdTimeMs) {
  const clamped = Math.max(0, Math.min(holdTimeMs, DRAW_DURATION_MS));
  return Math.max(
    1,
    Math.min(
      MAX_SHOT_POWER,
      Math.floor(clamped / (DRAW_DURATION_MS / MAX_SHOT_POWER)),
    ),
  );
}

export function shotClass(power) {
  return `archery-shot-power-${Math.max(1, Math.min(MAX_SHOT_POWER, power))}`;
}
