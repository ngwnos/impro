const relationshipBindings = new Map();
let latestPointer = null;
let frameScheduled = false;
let pointerListenerAttached = false;

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_EXPRESSION_DEPTH = 12;
const ALLOWED_EASINGS = new Set([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
]);

function relationshipKey(pluginId, overlayId, bindingId) {
  return `${pluginId}:${overlayId}:${bindingId}`;
}

function assertSafeId(kind, value) {
  if (typeof value !== "string" || !SAFE_ID_RE.test(value)) {
    throw new Error(`Invalid ${kind}`);
  }
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

function rectPoint({ x, y }) {
  return { x, y };
}

function centerPoint({ x, y, width, height }) {
  return { x: x + width / 2, y: y + height / 2 };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isPoint(value) {
  return value && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function assertAllowedExpression(expression, depth = 0) {
  if (depth > MAX_EXPRESSION_DEPTH) {
    throw new Error("Animation expression is too deep");
  }
  if (isFiniteNumber(expression) || isPoint(expression)) return;
  if (!expression || typeof expression !== "object") {
    throw new Error("Invalid animation expression");
  }
  if (expression.source) {
    if (
      !["pointer", "targetCenter", "overlayOrigin"].includes(expression.source)
    ) {
      throw new Error(`Unsupported animation source "${expression.source}"`);
    }
    return;
  }
  switch (expression.op) {
    case "add": {
      if (!Array.isArray(expression.values) || expression.values.length === 0) {
        throw new Error("add animation expression requires values");
      }
      expression.values.forEach((value) =>
        assertAllowedExpression(value, depth + 1),
      );
      return;
    }
    case "subtract":
      assertAllowedExpression(expression.left, depth + 1);
      assertAllowedExpression(expression.right, depth + 1);
      return;
    case "angleBetween":
      assertAllowedExpression(expression.from, depth + 1);
      assertAllowedExpression(expression.to, depth + 1);
      return;
    default:
      throw new Error(`Unsupported animation op "${expression.op}"`);
  }
}

function expressionTargetIds(expression, targetIds = new Set()) {
  if (!expression || typeof expression !== "object") return targetIds;
  if (expression.source === "targetCenter" && expression.target) {
    targetIds.add(expression.target);
  }
  if (Array.isArray(expression.values)) {
    expression.values.forEach((value) => expressionTargetIds(value, targetIds));
  }
  expressionTargetIds(expression.left, targetIds);
  expressionTargetIds(expression.right, targetIds);
  expressionTargetIds(expression.from, targetIds);
  expressionTargetIds(expression.to, targetIds);
  return targetIds;
}

function relationshipUsesPointer(binding) {
  function usesPointer(expression) {
    if (!expression || typeof expression !== "object") return false;
    if (expression.source === "pointer") return true;
    return (
      (Array.isArray(expression.values) &&
        expression.values.some(usesPointer)) ||
      usesPointer(expression.left) ||
      usesPointer(expression.right) ||
      usesPointer(expression.from) ||
      usesPointer(expression.to)
    );
  }
  return Object.values(binding.transform).some(usesPointer);
}

function normalizeTiming(timing = {}) {
  const duration = isFiniteNumber(timing.duration)
    ? Math.min(Math.max(timing.duration, 0), 1000)
    : 0;
  const easing = ALLOWED_EASINGS.has(timing.easing) ? timing.easing : "linear";
  return { duration, easing };
}

function normalizeBinding(binding) {
  if (!binding || typeof binding !== "object") {
    throw new Error("Invalid animation relationship");
  }
  assertSafeId("animation relationship id", binding.id);
  assertSafeId("animation target", binding.target);
  const transform = binding.transform;
  if (!transform || typeof transform !== "object") {
    throw new Error("Animation relationship requires a transform");
  }
  for (const property of Object.keys(transform)) {
    if (!["rotate", "translate"].includes(property)) {
      throw new Error(`Unsupported animation transform "${property}"`);
    }
    assertAllowedExpression(transform[property]);
  }
  return {
    id: binding.id,
    target: binding.target,
    transform,
    timing: normalizeTiming(binding.timing),
  };
}

function assertTargetsExist({ pluginId, overlayId, binding }) {
  const overlay = findPluginOverlay(pluginId, overlayId);
  if (!overlay) throw new Error(`Unknown plugin overlay "${overlayId}"`);
  const targetIds = expressionTargetIds(binding.transform.rotate);
  expressionTargetIds(binding.transform.translate, targetIds);
  targetIds.add(binding.target);
  for (const targetId of targetIds) {
    assertSafeId("animation target", targetId);
    if (!findAnimationTarget(overlay, targetId)) {
      throw new Error(`Unknown animation target "${targetId}"`);
    }
  }
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function formatNumber(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function evaluateExpression(expression, context, depth = 0) {
  if (depth > MAX_EXPRESSION_DEPTH) return null;
  if (isFiniteNumber(expression)) return expression;
  if (isPoint(expression)) return { x: expression.x, y: expression.y };
  if (!expression || typeof expression !== "object") return null;

  switch (expression.source) {
    case "pointer":
      return latestPointer ? { ...latestPointer } : null;
    case "overlayOrigin":
      return rectPoint(context.overlay.getBoundingClientRect());
    case "targetCenter": {
      const targetId = expression.target ?? context.targetId;
      const target = findAnimationTarget(context.overlay, targetId);
      return target ? centerPoint(target.getBoundingClientRect()) : null;
    }
  }

  switch (expression.op) {
    case "add": {
      const values = expression.values.map((value) =>
        evaluateExpression(value, context, depth + 1),
      );
      if (!values.every(isPoint)) return null;
      return values.reduce(
        (sum, value) => ({ x: sum.x + value.x, y: sum.y + value.y }),
        { x: 0, y: 0 },
      );
    }
    case "subtract": {
      const left = evaluateExpression(expression.left, context, depth + 1);
      const right = evaluateExpression(expression.right, context, depth + 1);
      if (isPoint(left) && isPoint(right)) {
        return { x: left.x - right.x, y: left.y - right.y };
      }
      if (isFiniteNumber(left) && isFiniteNumber(right)) return left - right;
      return null;
    }
    case "angleBetween": {
      const from = evaluateExpression(expression.from, context, depth + 1);
      const to = evaluateExpression(expression.to, context, depth + 1);
      if (!isPoint(from) || !isPoint(to)) return null;
      return normalizeDegrees(
        (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI,
      );
    }
    default:
      return null;
  }
}

function transitionForTiming({ duration, easing }) {
  return duration > 0 ? `transform ${formatNumber(duration)}ms ${easing}` : "";
}

function applyRelationship(entry) {
  const overlay = findPluginOverlay(entry.pluginId, entry.overlayId);
  const target = findAnimationTarget(overlay, entry.binding.target);
  if (!overlay || !target) return;

  const context = {
    pluginId: entry.pluginId,
    overlay,
    overlayId: entry.overlayId,
    targetId: entry.binding.target,
  };
  const parts = [];
  const translate = entry.binding.transform.translate
    ? evaluateExpression(entry.binding.transform.translate, context)
    : null;
  const rotate = entry.binding.transform.rotate
    ? evaluateExpression(entry.binding.transform.rotate, context)
    : null;

  if (entry.binding.transform.translate) {
    if (!isPoint(translate)) return;
    parts.push(
      `translate(${formatNumber(translate.x)}px, ${formatNumber(translate.y)}px)`,
    );
  }
  if (entry.binding.transform.rotate) {
    if (!isFiniteNumber(rotate)) return;
    parts.push(`rotate(${formatNumber(rotate)}deg)`);
  }

  target.style.transition = transitionForTiming(entry.binding.timing);
  target.style.transform = parts.join(" ");
}

function clearRelationshipStyle(entry) {
  const overlay = findPluginOverlay(entry.pluginId, entry.overlayId);
  const target = findAnimationTarget(overlay, entry.binding.target);
  if (!target) return;
  target.style.transition = "";
  target.style.transform = "";
}

function applyAllRelationships() {
  frameScheduled = false;
  for (const entry of relationshipBindings.values()) applyRelationship(entry);
}

function scheduleApplyRelationships() {
  if (frameScheduled) return;
  frameScheduled = true;
  const requestFrame =
    window.requestAnimationFrame ?? ((callback) => setTimeout(callback, 0));
  requestFrame(applyAllRelationships);
}

function handlePointerMove(event) {
  latestPointer = { x: event.clientX, y: event.clientY };
  scheduleApplyRelationships();
}

function hasPointerRelationships() {
  for (const entry of relationshipBindings.values()) {
    if (entry.usesPointer) return true;
  }
  return false;
}

function updatePointerListener() {
  const shouldListen = hasPointerRelationships();
  if (shouldListen && !pointerListenerAttached) {
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    pointerListenerAttached = true;
  } else if (!shouldListen && pointerListenerAttached) {
    window.removeEventListener("pointermove", handlePointerMove);
    pointerListenerAttached = false;
    latestPointer = null;
    frameScheduled = false;
  }
}

export function bindPluginOverlayRelationship(plugin, { overlayId, binding }) {
  const pluginId = plugin.pluginId;
  assertSafeId("plugin overlay id", String(overlayId));
  const normalized = normalizeBinding(binding);
  assertTargetsExist({ pluginId, overlayId, binding: normalized });
  const entry = {
    pluginId,
    overlayId,
    binding: normalized,
    usesPointer: relationshipUsesPointer(normalized),
  };
  relationshipBindings.set(
    relationshipKey(pluginId, overlayId, normalized.id),
    entry,
  );
  updatePointerListener();
  applyRelationship(entry);
}

export function unbindPluginOverlayRelationship(
  pluginId,
  { overlayId, bindingId },
) {
  const key = relationshipKey(pluginId, overlayId, bindingId);
  const entry = relationshipBindings.get(key);
  if (!entry) return;
  clearRelationshipStyle(entry);
  relationshipBindings.delete(key);
  updatePointerListener();
}

export function clearPluginOverlayRelationships({ pluginId, overlayId }) {
  for (const [key, entry] of relationshipBindings) {
    if (entry.pluginId !== pluginId || entry.overlayId !== overlayId) continue;
    clearRelationshipStyle(entry);
    relationshipBindings.delete(key);
  }
  updatePointerListener();
}

export function clearPluginOverlayRelationshipsForPlugin(pluginId) {
  for (const [key, entry] of relationshipBindings) {
    if (entry.pluginId !== pluginId) continue;
    clearRelationshipStyle(entry);
    relationshipBindings.delete(key);
  }
  updatePointerListener();
}
