import { findProjectileHit } from "/js/plugins/pluginHitTargets.js";

const activeProjectiles = new Map();

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const GRAVITY_PX_PER_MS_SQUARED = 0.0024;
const DEFAULT_MAX_PULL_DISTANCE = 48;
const MAX_PLUGIN_PULL_DISTANCE = 240;
const POWER_SPEEDS = {
  1: 0.7,
  2: 1.05,
  3: 1.45,
  4: 1.9,
  5: 2.35,
};
const ALLOWED_COLLISION_SHAPES = new Set(["tip"]);

function projectileKey(pluginId, overlayId, projectileId) {
  return `${pluginId}:${overlayId}:${projectileId}`;
}

function assertSafeId(kind, value) {
  if (typeof value !== "string" || !SAFE_ID_RE.test(value)) {
    throw new Error(`Invalid ${kind}`);
  }
}

function clampPower(power) {
  const numeric = Number(power);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(5, Math.round(numeric)));
}

function clampPullDistance(pullDistance, fallback) {
  const numeric = Number(pullDistance);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(MAX_PLUGIN_PULL_DISTANCE, numeric));
}

function normalizeCollision(collision) {
  if (!collision || typeof collision !== "object") return null;
  const targetKinds = Array.isArray(collision.targetKinds)
    ? collision.targetKinds.filter((kind) => typeof kind === "string")
    : [];
  if (targetKinds.length === 0) return null;
  const shape = ALLOWED_COLLISION_SHAPES.has(collision.shape)
    ? collision.shape
    : "tip";
  return {
    targetKinds,
    shape,
    stopOnHit: collision.stopOnHit === true,
  };
}

function findPluginOverlay(pluginId, overlayId) {
  for (const overlay of document.querySelectorAll(".plugin-overlay")) {
    if (
      overlay.dataset.pluginId === pluginId &&
      overlay.dataset.overlayId === String(overlayId)
    ) {
      return overlay;
    }
  }
  return null;
}

function findAnimationTarget(overlay, targetId) {
  if (!overlay) return null;
  for (const target of overlay.querySelectorAll(
    "[data-plugin-animation-target]",
  )) {
    if (target.dataset.pluginAnimationTarget === targetId) return target;
  }
  return null;
}

function angleFromTransform(transform) {
  if (!transform || transform === "none") return 0;
  const matrix = /^matrix\(([^)]+)\)$/.exec(transform);
  if (matrix) {
    const [a, b] = matrix[1].split(",").map((part) => Number(part.trim()));
    return (Math.atan2(b, a) * 180) / Math.PI;
  }
  const matrix3d = /^matrix3d\(([^)]+)\)$/.exec(transform);
  if (matrix3d) {
    const values = matrix3d[1].split(",").map((part) => Number(part.trim()));
    return (Math.atan2(values[1], values[0]) * 180) / Math.PI;
  }
  return 0;
}

function formatNumber(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function calculateProjectileFrame({
  origin,
  angleDeg,
  power,
  elapsedMs,
}) {
  const powerLevel = clampPower(power);
  const speed = POWER_SPEEDS[powerLevel];
  const radians = (angleDeg * Math.PI) / 180;
  const vx = Math.cos(radians) * speed;
  const initialVy = Math.sin(radians) * speed;
  const vy = initialVy + GRAVITY_PX_PER_MS_SQUARED * elapsedMs;
  const x = origin.x + vx * elapsedMs;
  const y =
    origin.y +
    initialVy * elapsedMs +
    0.5 * GRAVITY_PX_PER_MS_SQUARED * elapsedMs * elapsedMs;
  return {
    x,
    y,
    rotationDeg: (Math.atan2(vy, vx) * 180) / Math.PI,
  };
}

export function calculateProjectileOrigin({
  stringPoint,
  aimCenter,
  angleDeg,
  pullDistance,
}) {
  const radians = (angleDeg * Math.PI) / 180;
  const pulledPoint = {
    x: stringPoint.x - pullDistance,
    y: stringPoint.y,
  };
  const dx = pulledPoint.x - aimCenter.x;
  const dy = pulledPoint.y - aimCenter.y;
  return {
    x: aimCenter.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: aimCenter.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export function calculateProjectileTransform({
  frame,
  targetBase,
  targetHeight,
}) {
  const x = frame.x - targetBase.x;
  const y = frame.y - targetHeight / 2 - targetBase.y;
  return `translate(${formatNumber(x)}px, ${formatNumber(y)}px) rotate(${formatNumber(frame.rotationDeg)}deg)`;
}

export function calculateProjectileTip({ frame, targetWidth }) {
  const radians = (frame.rotationDeg * Math.PI) / 180;
  return {
    x: frame.x + Math.cos(radians) * targetWidth,
    y: frame.y + Math.sin(radians) * targetWidth,
  };
}

function toViewportPoint(point, overlay) {
  const rect = overlay.getBoundingClientRect();
  return {
    x: rect.left + point.x,
    y: rect.top + point.y,
  };
}

export function isRectOffscreen(rect, viewportWidth, viewportHeight) {
  return (
    rect.right < 0 ||
    rect.left > viewportWidth ||
    rect.bottom < 0 ||
    rect.top > viewportHeight
  );
}

function setProjectileFrame(target, frame, targetBase, targetHeight) {
  target.style.transform = calculateProjectileTransform({
    frame,
    targetBase,
    targetHeight,
  });
}

function hideProjectile(target) {
  target.style.opacity = "0";
  target.style.transform = "";
  target.style.transition = "";
  target.style.willChange = "";
}

export function launchPluginOverlayProjectile(
  plugin,
  { overlayId, projectile },
) {
  const pluginId = plugin.pluginId;
  const projectileId = projectile?.projectileId;
  const targetId = projectile?.target;
  const aimTargetId = projectile?.aimTarget;
  assertSafeId("plugin overlay id", String(overlayId));
  assertSafeId("projectile id", projectileId);
  assertSafeId("projectile target", targetId);
  assertSafeId("projectile aim target", aimTargetId);

  const overlay = findPluginOverlay(pluginId, overlayId);
  if (!overlay) throw new Error(`Unknown plugin overlay "${overlayId}"`);
  const target = findAnimationTarget(overlay, targetId);
  if (!target) throw new Error(`Unknown projectile target "${targetId}"`);
  const aimTarget = findAnimationTarget(overlay, aimTargetId);
  if (!aimTarget)
    throw new Error(`Unknown projectile aim target "${aimTargetId}"`);

  const key = projectileKey(pluginId, overlayId, projectileId);
  activeProjectiles.get(key)?.cancel();

  const overlayRect = overlay.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetHeight = targetRect.height || 18;
  const targetWidth = targetRect.width || 0;
  const targetBase = {
    x: targetRect.left - overlayRect.left,
    y: targetRect.top - overlayRect.top,
  };
  const angleDeg = angleFromTransform(getComputedStyle(aimTarget).transform);
  const fallbackPullDistance =
    (clampPower(projectile.power) / 5) * DEFAULT_MAX_PULL_DISTANCE;
  const pullDistance = clampPullDistance(
    projectile.pullDistance,
    fallbackPullDistance,
  );
  const stringPoint = {
    x: targetBase.x,
    y: targetBase.y + targetHeight / 2,
  };
  const aimRect = aimTarget.getBoundingClientRect();
  const aimCenter = {
    x: aimRect.left - overlayRect.left + aimRect.width / 2,
    y: aimRect.top - overlayRect.top + aimRect.height / 2,
  };
  const origin = calculateProjectileOrigin({
    stringPoint,
    aimCenter,
    angleDeg,
    pullDistance,
  });
  const collision = normalizeCollision(projectile.collision);

  target.style.opacity = "1";
  target.style.transition = "none";
  target.style.willChange = "transform";
  target.style.transformOrigin = "0 50%";

  return new Promise((resolve) => {
    let frameId = null;
    let startedAt = null;
    let done = false;
    let previousTip = null;
    let hitSent = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (frameId != null) cancelAnimationFrame(frameId);
      activeProjectiles.delete(key);
      hideProjectile(target);
      resolve();
    };
    activeProjectiles.set(key, { cancel: finish });

    // Projectile motion is host-owned because it depends on viewport gravity and
    // the current host-applied aim transform. The plugin supplies only ids and
    // power, never viewport coordinates or arbitrary DOM/style access.
    const tick = (time) => {
      if (startedAt == null) startedAt = time;
      const elapsedMs = time - startedAt;
      const frame = calculateProjectileFrame({
        origin,
        angleDeg,
        power: projectile.power,
        elapsedMs,
      });
      setProjectileFrame(target, frame, targetBase, targetHeight);
      if (collision?.shape === "tip") {
        const currentTip = toViewportPoint(
          calculateProjectileTip({ frame, targetWidth }),
          overlay,
        );
        if (previousTip && !hitSent) {
          const hit = findProjectileHit({
            previousTip,
            currentTip,
            targetKinds: collision.targetKinds,
          });
          if (hit) {
            hitSent = true;
            // Collision geometry is evaluated in the host. The plugin receives
            // only a sanitized event identifying its projectile and an opaque
            // host target id, never raw document layout or profile identity.
            plugin.sendEvent("projectileHit", {
              overlayId: String(overlayId),
              projectileId,
              ...hit,
            });
            if (collision.stopOnHit) {
              finish();
              return;
            }
          }
        }
        previousTip = currentTip;
      }
      const rect = target.getBoundingClientRect();
      if (
        elapsedMs > 50 &&
        isRectOffscreen(rect, window.innerWidth, window.innerHeight)
      ) {
        finish();
        return;
      }
      if (elapsedMs > 5000) {
        finish();
        return;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
  });
}

export function clearPluginOverlayProjectiles({ pluginId, overlayId }) {
  for (const [key, entry] of activeProjectiles) {
    if (!key.startsWith(`${pluginId}:${overlayId}:`)) continue;
    entry.cancel();
  }
}

export function clearPluginProjectilesForPlugin(pluginId) {
  for (const [key, entry] of activeProjectiles) {
    if (!key.startsWith(`${pluginId}:`)) continue;
    entry.cancel();
  }
}
