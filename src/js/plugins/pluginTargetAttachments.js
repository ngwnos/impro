import { getPluginHitTargetElement } from "/js/plugins/pluginHitTargets.js";

const targetAttachments = new Map();

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ALLOWED_LAYERS = new Set(["foreground", "background"]);

function attachmentKey(pluginId, targetId, attachmentId) {
  return `${pluginId}:${targetId}:${attachmentId}`;
}

function assertSafeId(kind, value) {
  if (typeof value !== "string" || !SAFE_ID_RE.test(value)) {
    throw new Error(`Invalid ${kind}`);
  }
}

function clamp01(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function formatNumber(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function formatPercent(value) {
  return `${formatNumber(value * 100)}%`;
}

function normalizeAnchor(anchor = {}) {
  return {
    x: clamp01(anchor.x, 0.5),
    y: clamp01(anchor.y, 0.5),
  };
}

function normalizeRotation(rotationDeg) {
  const numeric = Number(rotationDeg);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeLayer(layer) {
  return ALLOWED_LAYERS.has(layer) ? layer : "foreground";
}

function getAttachmentHost(target) {
  return target.parentElement ?? target.closest(".avatar");
}

function createAttachmentContainer({
  pluginId,
  targetId,
  attachmentId,
  layer,
}) {
  const container = document.createElement("div");
  container.classList.add("plugin-target-attachment");
  container.dataset.pluginId = pluginId;
  container.dataset.targetId = targetId;
  container.dataset.attachmentId = attachmentId;
  container.dataset.layer = layer;
  return container;
}

function setAttachmentPlacement(container, { anchor, rotationDeg, layer }) {
  container.dataset.layer = layer;
  container.style.left = formatPercent(anchor.x);
  container.style.top = formatPercent(anchor.y);
  container.style.transform = `translate(-50%, -50%) rotate(${formatNumber(rotationDeg)}deg)`;
}

export function attachPluginTargetAttachment({
  pluginRenderer,
  pluginId,
  targetId,
  attachmentId,
  content,
  anchor,
  rotationDeg,
  layer,
}) {
  assertSafeId("plugin target attachment id", attachmentId);
  const target = getPluginHitTargetElement(targetId);
  if (!target) return false;
  const host = getAttachmentHost(target);
  if (!host?.isConnected) return false;

  const normalizedAnchor = normalizeAnchor(anchor);
  const normalizedRotation = normalizeRotation(rotationDeg);
  const normalizedLayer = normalizeLayer(layer);
  const key = attachmentKey(pluginId, targetId, attachmentId);
  let entry = targetAttachments.get(key);

  if (!entry || !entry.container.isConnected || entry.host !== host) {
    entry?.container.remove();
    entry = {
      host,
      container: createAttachmentContainer({
        pluginId,
        targetId,
        attachmentId,
        layer: normalizedLayer,
      }),
      renderRoot: pluginRenderer.createRoot(),
    };
    targetAttachments.set(key, entry);
    host.classList.add("plugin-target-attachment-host");
    host.appendChild(entry.container);
  }

  setAttachmentPlacement(entry.container, {
    anchor: normalizedAnchor,
    rotationDeg: normalizedRotation,
    layer: normalizedLayer,
  });

  if (content) {
    const rendered = entry.renderRoot.render(content);
    if (
      entry.container.childNodes.length !== 1 ||
      entry.container.firstChild !== rendered
    ) {
      entry.container.replaceChildren(rendered);
    }
  } else {
    entry.container.replaceChildren();
  }

  return true;
}

export function removePluginTargetAttachment({
  pluginId,
  targetId,
  attachmentId,
}) {
  const key = attachmentKey(pluginId, targetId, attachmentId);
  const entry = targetAttachments.get(key);
  if (!entry) return;
  entry.container.remove();
  targetAttachments.delete(key);
}

export function clearPluginTargetAttachmentsForPlugin(
  pluginId,
  { targetId = null } = {},
) {
  for (const [key, entry] of targetAttachments) {
    if (entry.container.dataset.pluginId !== pluginId) continue;
    if (targetId != null && entry.container.dataset.targetId !== targetId) {
      continue;
    }
    entry.container.remove();
    targetAttachments.delete(key);
  }
}
