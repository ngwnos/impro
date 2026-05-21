export function createArrowProjectile({ power, pullDistance }) {
  return {
    projectileId: "arrow-shot",
    target: "flying-arrow",
    aimTarget: "bow",
    power,
    pullDistance,
    collision: {
      targetKinds: ["profile-avatar"],
      shape: "tip",
      stopOnHit: true,
    },
  };
}
