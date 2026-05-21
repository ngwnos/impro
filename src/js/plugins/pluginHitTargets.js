const SAFE_TARGET_KINDS = new Set(["profile-avatar"]);
const HIT_TARGET_SELECTOR = "[data-plugin-hit-target]";

let nextTargetId = 1;
const targetIds = new WeakMap();

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeTargetKinds(targetKinds) {
  if (!Array.isArray(targetKinds)) return [];
  return [
    ...new Set(
      targetKinds.filter(
        (kind) => typeof kind === "string" && SAFE_TARGET_KINDS.has(kind),
      ),
    ),
  ];
}

function getOpaqueTargetId(element, kind) {
  let id = targetIds.get(element);
  if (!id) {
    id = `${kind}:${nextTargetId}`;
    nextTargetId += 1;
    targetIds.set(element, id);
  }
  return id;
}

function circleFromRect(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    radius: Math.min(rect.width, rect.height) / 2,
  };
}

export function getPluginHitTargets({ targetKinds }) {
  const allowedKinds = new Set(normalizeTargetKinds(targetKinds));
  if (allowedKinds.size === 0) return [];
  const targets = [];
  for (const element of document.querySelectorAll(HIT_TARGET_SELECTOR)) {
    const kind = element.dataset.pluginHitTarget;
    if (!allowedKinds.has(kind)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    targets.push({
      element,
      id: getOpaqueTargetId(element, kind),
      kind,
      rect,
      circle: circleFromRect(rect),
    });
  }
  return targets;
}

export function segmentIntersectsCircle({ start, end, circle }) {
  if (
    !start ||
    !end ||
    !circle ||
    !isFiniteNumber(start.x) ||
    !isFiniteNumber(start.y) ||
    !isFiniteNumber(end.x) ||
    !isFiniteNumber(end.y) ||
    !isFiniteNumber(circle.x) ||
    !isFiniteNumber(circle.y) ||
    !isFiniteNumber(circle.radius)
  ) {
    return false;
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return (
      (start.x - circle.x) * (start.x - circle.x) +
        (start.y - circle.y) * (start.y - circle.y) <=
      circle.radius * circle.radius
    );
  }
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((circle.x - start.x) * dx + (circle.y - start.y) * dy) / lengthSquared,
    ),
  );
  const closest = {
    x: start.x + projection * dx,
    y: start.y + projection * dy,
  };
  const distanceSquared =
    (closest.x - circle.x) * (closest.x - circle.x) +
    (closest.y - circle.y) * (closest.y - circle.y);
  return distanceSquared <= circle.radius * circle.radius;
}

export function findProjectileHit({ previousTip, currentTip, targetKinds }) {
  for (const target of getPluginHitTargets({ targetKinds })) {
    if (
      segmentIntersectsCircle({
        start: previousTip,
        end: currentTip,
        circle: target.circle,
      })
    ) {
      // Deliberately return only an opaque target id and public target kind.
      // Plugins do not receive DOM nodes, rects, profile DIDs, handles, or URLs.
      return {
        targetKind: target.kind,
        targetId: target.id,
      };
    }
  }
  return null;
}
