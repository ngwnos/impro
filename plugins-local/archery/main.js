// src/pluginWorker.js
var SimpleUUID = class {
  constructor() {
    this._id = 0;
  }
  create() {
    return this._id++;
  }
};
var uuid = new SimpleUUID();
var callHandlers = /* @__PURE__ */ new Map();
var pendingHostCalls = /* @__PURE__ */ new Map();
function hostCall(method, ...args) {
  const hostCallId = uuid.create();
  return new Promise((resolve, reject) => {
    pendingHostCalls.set(hostCallId, { resolve, reject });
    self.postMessage({ type: "hostCall", method, hostCallId, args });
  });
}
var eventListeners = /* @__PURE__ */ new Map();
function addEventListener(event, listener) {
  let listeners = eventListeners.get(event);
  if (!listeners) {
    listeners = /* @__PURE__ */ new Set();
    eventListeners.set(event, listeners);
    const handlerId = uuid.create();
    callHandlers.set(handlerId, async (...args) => {
      const menu = new Menu();
      for (const eventListener of listeners) {
        try {
          await eventListener(menu, ...args);
        } catch (error) {
          console.error(`"${event}" listener threw:`, error);
        }
      }
      return menu._serialize();
    });
    self.postMessage({
      type: "register",
      target: "eventListener",
      event,
      handlerId,
    });
  }
  listeners.add(listener);
}
var TargetSurface = class {
  attach(
    {
      targetId,
      attachmentId,
      anchor = { x: 0.5, y: 0.5 },
      rotationDeg = 0,
      layer = "foreground",
    },
    render,
  ) {
    const contentEl = new VirtualEl("div");
    if (typeof render === "function") render(contentEl);
    return hostCall("attachTargetAttachment", {
      targetId,
      attachmentId,
      anchor,
      rotationDeg,
      layer,
      content: contentEl._serialize(),
    });
  }
  remove({ targetId, attachmentId }) {
    return hostCall("removeTargetAttachment", {
      targetId,
      attachmentId,
    });
  }
  clear({ targetId } = {}) {
    return hostCall("clearTargetAttachments", {
      targetId,
    });
  }
};
var MenuItem = class {
  constructor() {
    this.title = "";
    this.icon = null;
    this._callback = () => {};
  }
  setTitle(title) {
    this.title = title;
    return this;
  }
  setIcon(icon) {
    this.icon = icon;
    return this;
  }
  onClick(callback) {
    this._callback = callback;
    return this;
  }
};
var Menu = class {
  constructor() {
    this.items = [];
  }
  addItem(builder) {
    const item = new MenuItem();
    builder(item);
    this.items.push(item);
    return this;
  }
  _serialize() {
    return this.items.map((item) => {
      const handlerId = uuid.create();
      callHandlers.set(handlerId, item._callback);
      return { title: item.title, icon: item.icon, handlerId };
    });
  }
};
var App = class {
  constructor() {
    this.currentUser = null;
    this.targets = new TargetSurface();
  }
  on(event, listener) {
    addEventListener(event, listener);
  }
  refreshFeedFilters(feedURI = null) {
    return hostCall("refreshFeedFilters", feedURI);
  }
};
var Notice = class {
  constructor(message, timeout = 0) {
    this._toastId = uuid.create();
    this._timeout = timeout;
    this._hidden = false;
    this.noticeEl = new VirtualEl("div");
    this.noticeEl.addClass("toast");
    this.noticeEl.setText(message);
    queueMicrotask(() => {
      if (this._hidden) return;
      hostCall("showToast", {
        toastId: this._toastId,
        element: this.noticeEl._serialize(),
        timeout: this._timeout,
      });
    });
  }
  setMessage(message) {
    this.noticeEl.setText(message);
    return this;
  }
  hide() {
    if (this._hidden) return;
    this._hidden = true;
    hostCall("hideToast", { toastId: this._toastId });
  }
};
var registered = false;
var Plugin = class {
  constructor() {
    this.app = new App();
  }
  addSidebarItem(icon, title, callback = () => {}) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, callback);
    self.postMessage({
      type: "register",
      target: "sidebarItem",
      icon,
      title,
      handlerId,
    });
  }
  async loadData() {
    return hostCall("loadData");
  }
  async saveData(data) {
    await hostCall("saveData", { data });
  }
  addSettingTab(tab) {
    tab.plugin = this;
    const displayHandlerId = uuid.create();
    callHandlers.set(displayHandlerId, () => {
      tab.containerEl = new VirtualEl("div");
      tab.display();
      return tab.containerEl._serialize();
    });
    self.postMessage({
      type: "register",
      target: "settingTab",
      name: tab.name ?? null,
      displayHandlerId,
    });
    this._settingTab = tab;
  }
  addFeedFilter(callback = () => {}) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, callback);
    self.postMessage({
      type: "register",
      target: "feedFilter",
      handlerId,
    });
  }
  onload() {}
  onunload() {}
  static register() {
    if (registered) return;
    registered = true;
    const instance = new this();
    hostCall("getCurrentUser")
      .then((user) => {
        instance.app.currentUser = user;
        return instance.onload();
      })
      .then(
        () => self.postMessage({ type: "ready" }),
        (error) =>
          self.postMessage({
            type: "ready",
            error: error?.message ?? String(error),
          }),
      );
  }
};
var openModals = /* @__PURE__ */ new Map();
var openOverlays = /* @__PURE__ */ new Map();
var Overlay = class {
  constructor(overlayId, { position = "bottom-right" } = {}) {
    this._overlayId = overlayId ?? uuid.create();
    this.position = position;
    this.contentEl = new VirtualEl("div");
    this._open = false;
  }
  get isOpen() {
    return this._open;
  }
  async open() {
    if (this._open || openOverlays.has(this._overlayId)) return;
    this.onOpen();
    await hostCall("openOverlay", {
      overlayId: this._overlayId,
      position: this.position,
      content: this.contentEl._serialize(),
    });
    openOverlays.set(this._overlayId, this);
    this._open = true;
  }
  async close() {
    if (!this._open || !openOverlays.has(this._overlayId)) return;
    await hostCall("closeOverlay", { overlayId: this._overlayId });
    this._open = false;
    openOverlays.delete(this._overlayId);
    this.onClose();
  }
  async update() {
    if (!this._open || !openOverlays.has(this._overlayId)) return;
    await hostCall("openOverlay", {
      overlayId: this._overlayId,
      position: this.position,
      content: this.contentEl._serialize(),
    });
  }
  bindRelationship(binding) {
    return hostCall("bindOverlayRelationship", {
      overlayId: this._overlayId,
      binding,
    });
  }
  unbindRelationship(bindingId) {
    return hostCall("unbindOverlayRelationship", {
      overlayId: this._overlayId,
      bindingId,
    });
  }
  launchProjectile(projectile) {
    return hostCall("launchOverlayProjectile", {
      overlayId: this._overlayId,
      projectile,
    });
  }
  onOpen() {}
  onClose() {}
};
var VirtualEl = class _VirtualEl {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.text = null;
    this.children = [];
    this.events = {};
  }
  _on(event, fn) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, fn);
    this.events[event] = handlerId;
    return this;
  }
  onClick(fn) {
    return this._on("click", fn);
  }
  onPointerDown(fn) {
    return this._on("pointerdown", fn);
  }
  onPointerUp(fn) {
    return this._on("pointerup", fn);
  }
  onPointerCancel(fn) {
    return this._on("pointercancel", fn);
  }
  onPointerLeave(fn) {
    return this._on("pointerleave", fn);
  }
  onAnimationEnd(fn) {
    return this._on("animationend", fn);
  }
  onChange(fn) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, fn);
    this.events.change = handlerId;
    return this;
  }
  onInput(fn) {
    const handlerId = uuid.create();
    callHandlers.set(handlerId, fn);
    this.events.input = handlerId;
    return this;
  }
  setText(text) {
    this.text = text;
    this.children = [];
    return this;
  }
  empty() {
    this.text = null;
    this.children = [];
    return this;
  }
  addClass(cls) {
    this.attrs.class = this.attrs.class ? `${this.attrs.class} ${cls}` : cls;
    return this;
  }
  setAttr(name, value) {
    this.attrs[name] = value === void 0 ? "" : value;
    return this;
  }
  setAnimationTarget(targetId) {
    this.attrs["data-plugin-animation-target"] = targetId;
    return this;
  }
  createEl(tag, options = {}, callback) {
    const child = new _VirtualEl(tag);
    if (options.text != null) child.text = options.text;
    if (options.cls) {
      child.attrs.class = Array.isArray(options.cls)
        ? options.cls.join(" ")
        : options.cls;
    }
    if (options.attr) Object.assign(child.attrs, options.attr);
    this.children.push(child);
    if (typeof callback === "function") callback(child);
    return child;
  }
  createDiv(options = {}, callback) {
    return this.createEl("div", options, callback);
  }
  createSpan(options = {}, callback) {
    return this.createEl("span", options, callback);
  }
  _serialize() {
    return {
      tag: this.tag,
      attrs: this.attrs,
      text: this.text,
      children: this.children.map((child) => child._serialize()),
      events: this.events,
    };
  }
};
self.addEventListener("message", async (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.type === "call") {
    const fn = callHandlers.get(message.handlerId);
    if (!fn) {
      self.postMessage({
        type: "result",
        callId: message.callId,
        error: `unknown handler ${message.handlerId}`,
      });
      return;
    }
    try {
      const value = await fn(...message.args);
      self.postMessage({ type: "result", callId: message.callId, value });
    } catch (error) {
      self.postMessage({
        type: "result",
        callId: message.callId,
        error: error.message ?? String(error),
      });
    }
    return;
  }
  if (message.type === "hostResult") {
    const pending = pendingHostCalls.get(message.hostCallId);
    if (!pending) return;
    pendingHostCalls.delete(message.hostCallId);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.value);
    return;
  }
  if (message.type === "event") {
    switch (message.event) {
      case "modalDismissed": {
        const modal = openModals.get(message.data.modalId);
        if (modal) {
          openModals.delete(message.data.modalId);
          modal.onClose();
        }
        return;
      }
    }
    const listeners = eventListeners.get(message.event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          await listener(message.data);
        } catch (error) {
          console.error(`"${message.event}" listener threw:`, error);
        }
      }
    }
    return;
  }
});

// src/shot.js
var DRAW_DURATION_MS = 1300;
var MAX_DRAW_DISTANCE = 48;
var MAX_SHOT_POWER = 5;
function getDrawDistance(holdTimeMs) {
  const clamped = Math.max(0, Math.min(holdTimeMs, DRAW_DURATION_MS));
  return (clamped / DRAW_DURATION_MS) * MAX_DRAW_DISTANCE;
}
function getShotPower(holdTimeMs) {
  const clamped = Math.max(0, Math.min(holdTimeMs, DRAW_DURATION_MS));
  return Math.max(
    1,
    Math.min(
      MAX_SHOT_POWER,
      Math.floor(clamped / (DRAW_DURATION_MS / MAX_SHOT_POWER)),
    ),
  );
}
function shotClass(power) {
  return `archery-shot-power-${Math.max(1, Math.min(MAX_SHOT_POWER, power))}`;
}

// src/scene.js
function arrowChildren() {
  return [
    {
      tag: "div",
      cls: "archery-arrow-shaft",
      children: [],
    },
    {
      tag: "div",
      cls: "archery-arrow-head",
      children: [],
    },
    {
      tag: "div",
      cls: "archery-arrow-fletching archery-arrow-fletching-top",
      children: [],
    },
    {
      tag: "div",
      cls: "archery-arrow-fletching archery-arrow-fletching-bottom",
      children: [],
    },
  ];
}
function stageClass({ isDrawing, shotPower }) {
  const classes = ["archery-stage"];
  if (isDrawing) classes.push("archery-is-drawing");
  if (shotPower != null) {
    classes.push("archery-is-flying", shotClass(shotPower));
  }
  return classes.join(" ");
}
function createStaticBowScene({ isDrawing = false, shotPower = null } = {}) {
  return {
    tag: "div",
    cls: stageClass({ isDrawing, shotPower }),
    children: [
      {
        tag: "span",
        cls: "archery-fallback-label",
        text: "Archery",
        children: [],
      },
      {
        tag: "div",
        cls: "archery-bow-aim",
        animationTarget: "bow",
        children: [
          {
            tag: "div",
            cls: "archery-bow-string",
            children: [
              {
                tag: "div",
                cls: "archery-bow-string-line archery-bow-string-line-top",
                children: [],
              },
              {
                tag: "div",
                cls: "archery-bow-string-line archery-bow-string-line-bottom",
                children: [],
              },
            ],
          },
          {
            tag: "div",
            cls: "archery-arrow",
            children: arrowChildren(),
          },
          {
            tag: "div",
            cls: "archery-bow archery-bow-wood",
            children: [],
          },
        ],
      },
      {
        tag: "div",
        cls: "archery-arrow archery-flying-arrow",
        animationTarget: "flying-arrow",
        children: arrowChildren(),
      },
      {
        tag: "div",
        cls: "archery-cursor-dot",
        animationTarget: "cursor-dot",
        children: [],
      },
    ],
  };
}
function createStuckArrowScene() {
  return {
    tag: "div",
    cls: "archery-stuck-arrow",
    children: arrowChildren(),
  };
}
function renderSceneNode(parentEl, node) {
  const child = parentEl.createEl(node.tag, {
    cls: node.cls,
    text: node.text,
    attr: node.attr,
  });
  if (node.animationTarget) child.setAnimationTarget(node.animationTarget);
  for (const childNode of node.children ?? []) {
    renderSceneNode(child, childNode);
  }
  return child;
}

// src/relationships.js
function createBowAimRelationship() {
  return {
    id: "aim-bow",
    target: "bow",
    transform: {
      rotate: {
        op: "angleBetween",
        from: { source: "targetCenter", target: "bow" },
        to: { source: "pointer" },
      },
    },
    timing: { duration: 80, easing: "linear" },
  };
}
function createCursorDotRelationship() {
  return {
    id: "cursor-dot-follows-pointer",
    target: "cursor-dot",
    transform: {
      translate: {
        op: "add",
        values: [
          {
            op: "subtract",
            left: { source: "pointer" },
            right: { source: "overlayOrigin" },
          },
          { x: -5, y: -5 },
        ],
      },
    },
    timing: { duration: 40, easing: "linear" },
  };
}

// src/projectile.js
function createArrowProjectile({ power, pullDistance }) {
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

// src/main.js
var ArcheryOverlay = class extends Overlay {
  constructor() {
    super("archery-bow", { position: "bottom-right" });
    this.contentEl.addClass("archery-root");
    this.isDrawing = false;
    this.shotPower = null;
    this.drawStartedAt = 0;
  }
  renderBow() {
    this.contentEl.empty();
    const stage = renderSceneNode(
      this.contentEl,
      createStaticBowScene({
        isDrawing: this.isDrawing,
        shotPower: this.shotPower,
      }),
    );
    stage
      .onPointerDown(() => this.startDrawing())
      .onPointerUp(() => this.releaseArrow())
      .onPointerCancel(() => this.cancelDrawing());
  }
  async startDrawing() {
    if (this.isDrawing || this.shotPower != null) return;
    this.isDrawing = true;
    this.drawStartedAt = Date.now();
    this.renderBow();
    await this.update();
  }
  async releaseArrow() {
    if (!this.isDrawing || this.shotPower != null) return;
    const holdTime = Date.now() - this.drawStartedAt;
    this.isDrawing = false;
    this.drawStartedAt = 0;
    const shotPower = getShotPower(holdTime);
    this.shotPower = shotPower;
    this.renderBow();
    await this.update();
    try {
      await this.launchProjectile(
        createArrowProjectile({
          power: shotPower,
          pullDistance: getDrawDistance(holdTime),
        }),
      );
    } finally {
      await this.resetShot();
    }
  }
  async cancelDrawing() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.drawStartedAt = 0;
    this.renderBow();
    await this.update();
  }
  async resetShot() {
    if (this.shotPower == null) return;
    this.shotPower = null;
    this.renderBow();
    await this.update();
  }
  async bindPointerRelationships() {
    await Promise.all([
      this.bindRelationship(createBowAimRelationship()),
      this.bindRelationship(createCursorDotRelationship()),
    ]);
  }
  onOpen() {
    this.renderBow();
  }
  onClose() {
    this.isDrawing = false;
    this.shotPower = null;
    this.drawStartedAt = 0;
    this.contentEl.empty();
  }
};
var ArcheryPlugin = class extends Plugin {
  async onload() {
    this.overlay = new ArcheryOverlay();
    this.stuckArrowId = 0;
    this.app.on("projectileHit", (hit) => this.handleProjectileHit(hit));
    this.addSidebarItem("lightning-bolt", "Archery", async () => {
      try {
        if (this.overlay.isOpen) {
          await this.overlay.close();
          return;
        }
        await this.overlay.open();
        await this.overlay.bindPointerRelationships();
      } catch (error) {
        new Notice("Reload the page to enable the Archery overlay", 5e3);
        throw error;
      }
    });
  }
  async handleProjectileHit({
    projectileId,
    targetKind,
    targetId,
    impact,
    rotationDeg,
  }) {
    if (projectileId !== "arrow-shot" || targetKind !== "profile-avatar") {
      return;
    }
    this.stuckArrowId += 1;
    await this.app.targets.attach(
      {
        targetId,
        attachmentId: `arrow-${this.stuckArrowId}`,
        anchor: impact,
        rotationDeg,
        layer: "foreground",
      },
      (contentEl) => {
        renderSceneNode(contentEl, createStuckArrowScene());
      },
    );
  }
};
ArcheryPlugin.register();
