const SAFE_TARGET_KINDS = new Set(["profile-avatar"]);
const HIT_TARGET_SELECTOR = "[data-plugin-hit-target]";

let nextTargetId = 1;
const targetIds = new WeakMap();
const targetsById = new Map();

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
  targetsById.set(
    id,
    typeof WeakRef === "function" ? new WeakRef(element) : element,
  );
  return id;
}

function circleFromRect(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    radius: Math.min(rect.width, rect.height) / 2,
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function closestPointOnSegment({ start, end, point }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { x: start.x, y: start.y };
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return {
    x: start.x + projection * dx,
    y: start.y + projection * dy,
  };
}

function normalizedPointInRect(point, rect) {
  return {
    x: clamp01((point.x - rect.left) / rect.width),
    y: clamp01((point.y - rect.top) / rect.height),
  };
}

export function getPluginHitTargetElement(targetId) {
  if (typeof targetId !== "string") return null;
  const stored = targetsById.get(targetId) ?? null;
  const element =
    stored && typeof stored.deref === "function" ? stored.deref() : stored;
  if (!element || !element.isConnected) {
    targetsById.delete(targetId);
    return null;
  }
  return element;
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
  const closest = closestPointOnSegment({ start, end, point: circle });
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
        impact: normalizedPointInRect(
          closestPointOnSegment({
            start: previousTip,
            end: currentTip,
            point: target.circle,
          }),
          target.rect,
        ),
      };
    }
  }
  return null;
}
