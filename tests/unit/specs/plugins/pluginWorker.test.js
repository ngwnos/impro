import { TestSuite } from "../../testSuite.js";
import { assert, assertEquals } from "../../testHelpers.js";

// pluginWorker.js uses the worker global `self` for postMessage/addEventListener
// and is imported only for its side effects (registering a message listener).
// We install a mock `self` BEFORE importing so the listener is captured here.
const postedMessages = [];
let messageListener = null;

globalThis.self = {
  postMessage(message) {
    postedMessages.push(message);
  },
  addEventListener(event, listener) {
    if (event === "message") messageListener = listener;
  },
};

const worker = await import("../../../../pluginWorker.js");
const {
  SimpleUUID,
  MenuItem,
  Menu,
  Notice,
  StyleSnippet,
  Plugin,
  Modal,
  Overlay,
  PluginSettingTab,
  Setting,
} = worker;

function lastMessage() {
  return postedMessages[postedMessages.length - 1];
}

function clearMessages() {
  postedMessages.length = 0;
}

// Dispatches a message to the worker's registered listener.
function dispatch(data) {
  return messageListener({ data });
}

// Waits for queued microtasks to flush.
function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

const t = new TestSuite("pluginWorker");

t.describe("SimpleUUID", (it) => {
  it("returns sequential ids starting from 0", () => {
    const uuid = new SimpleUUID();
    assertEquals(uuid.create(), 0);
    assertEquals(uuid.create(), 1);
    assertEquals(uuid.create(), 2);
  });
});

t.describe("MenuItem", (it) => {
  it("setters return the item for chaining and apply values", () => {
    const item = new MenuItem();
    const result = item
      .setTitle("Hello")
      .setIcon("star")
      .onClick(() => 42);
    assert(result === item, "chained setters should return the item");
    assertEquals(item.title, "Hello");
    assertEquals(item.icon, "star");
    assertEquals(item._callback(), 42);
  });

  it("has sensible defaults", () => {
    const item = new MenuItem();
    assertEquals(item.title, "");
    assertEquals(item.icon, null);
    // Default callback is a no-op that returns undefined.
    assertEquals(item._callback(), undefined);
  });
});

t.describe("Menu", (it) => {
  it("addItem invokes the builder and serializes items with handlerIds", () => {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("One").setIcon("a"));
    menu.addItem((item) => item.setTitle("Two"));
    const serialized = menu._serialize();
    assertEquals(serialized.length, 2);
    assertEquals(serialized[0].title, "One");
    assertEquals(serialized[0].icon, "a");
    assertEquals(serialized[1].title, "Two");
    assertEquals(serialized[1].icon, null);
    assert(
      typeof serialized[0].handlerId === "number",
      "each item gets a numeric handlerId",
    );
    assert(
      serialized[0].handlerId !== serialized[1].handlerId,
      "handlerIds are unique",
    );
  });
});

t.describe("VirtualEl (via Setting & friends)", (it) => {
  it("setText replaces content and createEl appends children with attrs", () => {
    const container = new Setting(
      new (class {
        createDiv(options) {
          // delegate to a real VirtualEl via plugin worker's serialize chain:
          // build a minimal VirtualEl by constructing a Plugin's settingTab.
          return makeVirtualEl().createDiv(options);
        }
      })(),
    );
    // Use the Setting's name/desc/control to exercise VirtualEl indirectly.
    container.setName("Hello").setDesc("World");
    const serialized = container.settingEl._serialize();
    assertEquals(serialized.tag, "div");
    // settingEl has info + control children
    assertEquals(serialized.children.length, 2);
    const info = serialized.children[0];
    assertEquals(info.attrs.class, "plugin-setting-item-info");
    assertEquals(info.children[0].text, "Hello");
    assertEquals(info.children[1].text, "World");
  });

  it("addClass concatenates classes and setAttr stores attributes", () => {
    const el = makeVirtualEl();
    el.addClass("a").addClass("b").setAttr("data-x", "1");
    const serialized = el._serialize();
    assertEquals(serialized.attrs.class, "a b");
    assertEquals(serialized.attrs["data-x"], "1");
  });

  it("setAttr with an omitted value still sets the attribute as an empty string", () => {
    const el = makeVirtualEl();
    el.setAttr("disabled");
    const serialized = el._serialize();
    assertEquals(serialized.attrs.disabled, "");
  });

  it("setAnimationTarget serializes a scoped data marker", () => {
    const el = makeVirtualEl();
    el.setAnimationTarget("bow");
    const serialized = el._serialize();
    assertEquals(serialized.attrs["data-plugin-animation-target"], "bow");
  });

  it("empty() clears text and children", () => {
    const el = makeVirtualEl();
    el.createDiv({ text: "child" });
    el.setText("hi");
    el.empty();
    const serialized = el._serialize();
    assertEquals(serialized.text, null);
    assertEquals(serialized.children, []);
  });

  it("createEl supports text, cls (string or array), and attr options", () => {
    const el = makeVirtualEl();
    el.createEl("span", { text: "x", cls: ["one", "two"], attr: { id: "z" } });
    const serialized = el._serialize();
    assertEquals(serialized.children[0].tag, "span");
    assertEquals(serialized.children[0].text, "x");
    assertEquals(serialized.children[0].attrs.class, "one two");
    assertEquals(serialized.children[0].attrs.id, "z");
  });

  it("event handlers register a handlerId in the events map", () => {
    const el = makeVirtualEl();
    el.onClick(() => {});
    el.onChange(() => {});
    el.onInput(() => {});
    el.onPointerDown(() => {});
    el.onPointerUp(() => {});
    el.onPointerCancel(() => {});
    el.onPointerLeave(() => {});
    el.onAnimationEnd(() => {});
    const serialized = el._serialize();
    assert(typeof serialized.events.click === "number");
    assert(typeof serialized.events.change === "number");
    assert(typeof serialized.events.input === "number");
    assert(typeof serialized.events.pointerdown === "number");
    assert(typeof serialized.events.pointerup === "number");
    assert(typeof serialized.events.pointercancel === "number");
    assert(typeof serialized.events.pointerleave === "number");
    assert(typeof serialized.events.animationend === "number");
  });
});

// Helper: create a VirtualEl by leveraging Modal.contentEl (which is a VirtualEl).
function makeVirtualEl() {
  return new Modal().contentEl;
}

t.describe("Plugin sidebar/feedFilter registration", (it) => {
  it("addSidebarItem posts a register message with title and icon", () => {
    clearMessages();
    const plugin = new Plugin();
    plugin.addSidebarItem("⭐", "Stars", () => {});
    const msg = lastMessage();
    assertEquals(msg.type, "register");
    assertEquals(msg.target, "sidebarItem");
    assertEquals(msg.icon, "⭐");
    assertEquals(msg.title, "Stars");
    assert(typeof msg.handlerId === "number");
  });

  it("addFeedFilter posts a register message", () => {
    clearMessages();
    const plugin = new Plugin();
    plugin.addFeedFilter(() => true);
    const msg = lastMessage();
    assertEquals(msg.type, "register");
    assertEquals(msg.target, "feedFilter");
    assert(typeof msg.handlerId === "number");
  });

  it("addSettingTab posts a register message and remembers the tab", () => {
    clearMessages();
    const plugin = new Plugin();
    const tab = new PluginSettingTab().setName("Prefs");
    plugin.addSettingTab(tab);
    const msg = lastMessage();
    assertEquals(msg.type, "register");
    assertEquals(msg.target, "settingTab");
    assertEquals(msg.name, "Prefs");
    assert(tab.plugin === plugin, "tab.plugin is set to its owning plugin");
  });
});

t.describe("hostCall round-trip", (it) => {
  it("loadData posts a hostCall and resolves with the host result", async () => {
    clearMessages();
    const plugin = new Plugin();
    const promise = plugin.loadData();
    const sent = lastMessage();
    assertEquals(sent.type, "hostCall");
    assertEquals(sent.method, "loadData");
    assert(typeof sent.hostCallId === "number");
    dispatch({
      type: "hostResult",
      hostCallId: sent.hostCallId,
      value: { foo: 1 },
    });
    assertEquals(await promise, { foo: 1 });
  });

  it("rejects when host returns an error", async () => {
    clearMessages();
    const plugin = new Plugin();
    const promise = plugin.saveData({ a: 1 });
    const sent = lastMessage();
    assertEquals(sent.method, "saveData");
    assertEquals(sent.args[0], { data: { a: 1 } });
    dispatch({
      type: "hostResult",
      hostCallId: sent.hostCallId,
      error: "nope",
    });
    let caught = null;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof Error && caught.message === "nope");
  });

  it("app.refreshFeedFilters forwards feedURI in args", () => {
    clearMessages();
    const plugin = new Plugin();
    plugin.app.refreshFeedFilters("at://example/feed");
    const sent = lastMessage();
    assertEquals(sent.method, "refreshFeedFilters");
    assertEquals(sent.args[0], "at://example/feed");
  });
});

t.describe("Notice", (it) => {
  it("posts a showToast hostCall on next microtask", async () => {
    clearMessages();
    new Notice("Saved!", 1000);
    await flushMicrotasks();
    const sent = postedMessages.find(
      (message) => message.method === "showToast",
    );
    assert(sent, "expected a showToast hostCall");
    assertEquals(sent.args[0].timeout, 1000);
    assertEquals(sent.args[0].element.tag, "div");
    assertEquals(sent.args[0].element.text, "Saved!");
  });

  it("hide() before the microtask suppresses the showToast", async () => {
    clearMessages();
    const notice = new Notice("Temp");
    notice.hide();
    await flushMicrotasks();
    const showToast = postedMessages.find(
      (message) => message.method === "showToast",
    );
    assert(
      !showToast,
      "showToast should not be sent when hidden synchronously",
    );
  });

  it("hide() after display posts hideToast exactly once", async () => {
    clearMessages();
    const notice = new Notice("Hello");
    await flushMicrotasks();
    notice.hide();
    notice.hide(); // second call is a no-op
    const hideCalls = postedMessages.filter(
      (message) => message.method === "hideToast",
    );
    assertEquals(hideCalls.length, 1);
  });
});

t.describe("StyleSnippet", (it) => {
  it("posts applyStyleSnippet on next microtask", async () => {
    clearMessages();
    new StyleSnippet(".x { color: red; }");
    await flushMicrotasks();
    const sent = postedMessages.find(
      (message) => message.method === "applyStyleSnippet",
    );
    assert(sent, "expected applyStyleSnippet hostCall");
    assertEquals(sent.args[0].cssText, ".x { color: red; }");
  });

  it("remove() before microtask cancels apply", async () => {
    clearMessages();
    const snippet = new StyleSnippet(".y { }");
    snippet.remove();
    await flushMicrotasks();
    const apply = postedMessages.find(
      (message) => message.method === "applyStyleSnippet",
    );
    assert(!apply, "apply should be suppressed");
  });

  it("remove() after apply posts removeStyleSnippet once", async () => {
    clearMessages();
    const snippet = new StyleSnippet(".z {}");
    await flushMicrotasks();
    snippet.remove();
    snippet.remove();
    const removes = postedMessages.filter(
      (message) => message.method === "removeStyleSnippet",
    );
    assertEquals(removes.length, 1);
  });
});

t.describe("Modal", (it) => {
  it("open() posts openModal hostCall and invokes onOpen", () => {
    clearMessages();
    const modal = new Modal();
    modal.titleEl.setText("Title");
    modal.contentEl.setText("Body");
    let opened = false;
    modal.onOpen = () => {
      opened = true;
    };
    modal.open();
    assert(opened, "onOpen should fire");
    const sent = lastMessage();
    assertEquals(sent.type, "hostCall");
    assertEquals(sent.method, "openModal");
    assertEquals(sent.args[0].title.text, "Title");
    assertEquals(sent.args[0].content.text, "Body");
  });

  it("calling open() twice only sends one openModal", () => {
    clearMessages();
    const modal = new Modal();
    modal.open();
    modal.open();
    const opens = postedMessages.filter(
      (message) => message.method === "openModal",
    );
    assertEquals(opens.length, 1);
  });

  it("close() posts closeModal and invokes onClose", () => {
    const modal = new Modal();
    modal.open();
    clearMessages();
    let closed = false;
    modal.onClose = () => {
      closed = true;
    };
    modal.close();
    assert(closed, "onClose should fire");
    assertEquals(lastMessage().method, "closeModal");
  });

  it("modalDismissed event closes the modal and fires onClose", () => {
    const modal = new Modal();
    let closed = false;
    modal.onClose = () => {
      closed = true;
    };
    modal.open();
    const modalId = modal._modalId;
    dispatch({ type: "event", event: "modalDismissed", data: { modalId } });
    assert(closed, "onClose fires when host dismisses the modal");
  });
});

t.describe("Overlay", (it) => {
  it("open() posts openOverlay hostCall, waits for the host, and invokes onOpen", async () => {
    clearMessages();
    const overlay = new Overlay("target", { position: "bottom-right" });
    overlay.contentEl.setText("Bow");
    let opened = false;
    overlay.onOpen = () => {
      opened = true;
    };
    const promise = overlay.open();

    assert(opened, "onOpen should fire");
    const sent = lastMessage();
    assertEquals(sent.type, "hostCall");
    assertEquals(sent.method, "openOverlay");
    assert(typeof sent.hostCallId === "number");
    assertEquals(sent.args[0].overlayId, "target");
    assertEquals(sent.args[0].position, "bottom-right");
    assertEquals(sent.args[0].content.text, "Bow");
    assert(!overlay.isOpen, "overlay should wait for host confirmation");
    dispatch({ type: "hostResult", hostCallId: sent.hostCallId, value: null });
    await promise;
    assert(overlay.isOpen, "overlay should be open after host confirmation");
  });

  it("calling open() twice only sends one openOverlay", async () => {
    clearMessages();
    const overlay = new Overlay("target-once");
    const promise = overlay.open();
    const sent = lastMessage();
    dispatch({ type: "hostResult", hostCallId: sent.hostCallId, value: null });
    await promise;
    clearMessages();
    await overlay.open();
    const opens = postedMessages.filter(
      (message) => message.method === "openOverlay",
    );
    assertEquals(opens.length, 0);
  });

  it("close() posts closeOverlay, waits for the host, and invokes onClose", async () => {
    const overlay = new Overlay("target-close");
    const openPromise = overlay.open();
    const openCall = lastMessage();
    dispatch({
      type: "hostResult",
      hostCallId: openCall.hostCallId,
      value: null,
    });
    await openPromise;
    clearMessages();
    let closed = false;
    overlay.onClose = () => {
      closed = true;
    };
    const closePromise = overlay.close();

    assert(!closed, "onClose should wait for host confirmation");
    const sent = lastMessage();
    assertEquals(sent.method, "closeOverlay");
    assert(typeof sent.hostCallId === "number");
    assertEquals(sent.args[0].overlayId, "target-close");
    dispatch({ type: "hostResult", hostCallId: sent.hostCallId, value: null });
    await closePromise;
    assert(closed, "onClose should fire");
    assert(!overlay.isOpen, "overlay should be closed after host confirmation");
  });

  it("update() re-sends overlay content while open", async () => {
    clearMessages();
    const overlay = new Overlay("target-update");
    const openPromise = overlay.open();
    const openCall = lastMessage();
    dispatch({
      type: "hostResult",
      hostCallId: openCall.hostCallId,
      value: null,
    });
    await openPromise;

    overlay.contentEl.setText("Updated");
    clearMessages();
    const updatePromise = overlay.update();
    const sent = lastMessage();
    assertEquals(sent.method, "openOverlay");
    assertEquals(sent.args[0].overlayId, "target-update");
    assertEquals(sent.args[0].content.text, "Updated");
    dispatch({ type: "hostResult", hostCallId: sent.hostCallId, value: null });
    await updatePromise;
  });
});

t.describe("Overlay relationships", (it) => {
  it("bindRelationship sends a declarative host relationship without exposing pointer data", async () => {
    clearMessages();
    const overlay = new Overlay("archery-bow");
    const binding = {
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

    const promise = overlay.bindRelationship(binding);
    const sent = lastMessage();
    assertEquals(sent.type, "hostCall");
    assertEquals(sent.method, "bindOverlayRelationship");
    assertEquals(sent.args[0], {
      overlayId: "archery-bow",
      binding,
    });
    dispatch({ type: "hostResult", hostCallId: sent.hostCallId, value: null });
    await promise;
  });

  it("unbindRelationship asks the host to remove a relationship", async () => {
    clearMessages();
    const overlay = new Overlay("archery-bow");
    const promise = overlay.unbindRelationship("aim-bow");
    const sent = lastMessage();
    assertEquals(sent.type, "hostCall");
    assertEquals(sent.method, "unbindOverlayRelationship");
    assertEquals(sent.args[0], {
      overlayId: "archery-bow",
      bindingId: "aim-bow",
    });
    dispatch({ type: "hostResult", hostCallId: sent.hostCallId, value: null });
    await promise;
  });

  it("launchProjectile asks the host to run a scoped projectile animation", async () => {
    clearMessages();
    const overlay = new Overlay("archery-bow");
    const promise = overlay.launchProjectile({
      projectileId: "arrow-shot",
      target: "flying-arrow",
      aimTarget: "bow",
      power: 4,
    });
    const sent = lastMessage();
    assertEquals(sent.type, "hostCall");
    assertEquals(sent.method, "launchOverlayProjectile");
    assertEquals(sent.args[0], {
      overlayId: "archery-bow",
      projectile: {
        projectileId: "arrow-shot",
        target: "flying-arrow",
        aimTarget: "bow",
        power: 4,
      },
    });
    dispatch({ type: "hostResult", hostCallId: sent.hostCallId, value: null });
    await promise;
  });
});

t.describe("message dispatch — call handlers", (it) => {
  it("invokes a registered handler and posts the result", async () => {
    clearMessages();
    const plugin = new Plugin();
    let receivedArgs = null;
    plugin.addSidebarItem("i", "t", (...args) => {
      receivedArgs = args;
      return "ok";
    });
    const register = lastMessage();
    clearMessages();
    await dispatch({
      type: "call",
      handlerId: register.handlerId,
      callId: 99,
      args: [1, 2],
    });
    assertEquals(receivedArgs, [1, 2]);
    const result = postedMessages.find((message) => message.type === "result");
    assertEquals(result.callId, 99);
    assertEquals(result.value, "ok");
  });

  it("reports unknown handlerIds via the result message", async () => {
    clearMessages();
    await dispatch({
      type: "call",
      handlerId: 999999,
      callId: 7,
      args: [],
    });
    const result = postedMessages.find((message) => message.type === "result");
    assertEquals(result.callId, 7);
    assert(/unknown handler/.test(result.error));
  });

  it("captures handler errors and forwards them as result.error", async () => {
    clearMessages();
    const plugin = new Plugin();
    plugin.addSidebarItem("i", "t", () => {
      throw new Error("boom");
    });
    const register = lastMessage();
    clearMessages();
    await dispatch({
      type: "call",
      handlerId: register.handlerId,
      callId: 5,
      args: [],
    });
    const result = postedMessages.find((message) => message.type === "result");
    assertEquals(result.error, "boom");
  });
});

t.describe("app.on event listeners", (it) => {
  it("registers an eventListener target and returns serialized menu items", async () => {
    clearMessages();
    const plugin = new Plugin();
    plugin.app.on("post:menu", (menu, post) => {
      menu.addItem((item) =>
        item.setTitle(`Open ${post.id}`).onClick(() => {}),
      );
    });
    const register = postedMessages.find(
      (message) =>
        message.type === "register" && message.target === "eventListener",
    );
    assert(register, "an eventListener register message should be posted");
    assertEquals(register.event, "post:menu");

    clearMessages();
    await dispatch({
      type: "call",
      handlerId: register.handlerId,
      callId: 1,
      args: [{ id: 42 }],
    });
    const result = postedMessages.find((message) => message.type === "result");
    assertEquals(result.value.length, 1);
    assertEquals(result.value[0].title, "Open 42");
  });

  it("dispatches projectileHit events directly to app listeners", async () => {
    clearMessages();
    const plugin = new Plugin();
    const received = [];
    plugin.app.on("projectileHit", (payload) => {
      received.push(payload);
    });
    const register = postedMessages.find(
      (message) =>
        message.type === "register" && message.target === "eventListener",
    );
    assert(register, "an eventListener register message should be posted");
    assertEquals(register.event, "projectileHit");

    await dispatch({
      type: "event",
      event: "projectileHit",
      data: {
        projectileId: "arrow-shot",
        targetKind: "profile-avatar",
        targetId: "profile-avatar:1",
      },
    });

    assertEquals(received, [
      {
        projectileId: "arrow-shot",
        targetKind: "profile-avatar",
        targetId: "profile-avatar:1",
      },
    ]);
  });

  it("allows host events to trigger plugin host calls", async () => {
    clearMessages();
    const plugin = new Plugin();
    plugin.app.on("projectileHit", ({ projectileId }) => {
      if (projectileId === "arrow-shot")
        new Notice("Hit profile picture", 1200);
    });

    await dispatch({
      type: "event",
      event: "projectileHit",
      data: {
        projectileId: "arrow-shot",
        targetKind: "profile-avatar",
        targetId: "profile-avatar:1",
      },
    });
    await flushMicrotasks();

    const showToast = postedMessages.find(
      (message) => message.method === "showToast",
    );
    assert(showToast, "expected projectileHit to trigger a showToast hostCall");
    assertEquals(showToast.args[0].element.text, "Hit profile picture");
    assertEquals(showToast.args[0].timeout, 1200);
  });
});

t.describe("PluginSettingTab.refresh", (it) => {
  it("posts a refreshSettingTab hostCall", () => {
    clearMessages();
    const tab = new PluginSettingTab();
    tab.refresh();
    const sent = lastMessage();
    assertEquals(sent.type, "hostCall");
    assertEquals(sent.method, "refreshSettingTab");
  });
});

t.describe("Setting components", (it) => {
  it("addText creates a text input with placeholder and value", () => {
    const container = makeVirtualEl();
    const setting = new Setting(container);
    setting.addText((text) => text.setValue("hello").setPlaceholder("type…"));
    const input = setting.controlEl.children[0];
    assertEquals(input.tag, "input");
    assertEquals(input.attrs.type, "text");
    assertEquals(input.attrs.value, "hello");
    assertEquals(input.attrs.placeholder, "type…");
  });

  it("addToggle reflects checked state on setValue", () => {
    const container = makeVirtualEl();
    const setting = new Setting(container);
    setting.addToggle((toggle) => toggle.setValue(true));
    let toggle = setting.controlEl.children[0];
    assertEquals(toggle.attrs.type, "checkbox");
    assert("checked" in toggle.attrs);

    const setting2 = new Setting(makeVirtualEl());
    setting2.addToggle((toggle) => toggle.setValue(true).setValue(false));
    toggle = setting2.controlEl.children[0];
    assert(!("checked" in toggle.attrs));
  });

  it("addDropdown adds options and marks selected value", () => {
    const container = makeVirtualEl();
    const setting = new Setting(container);
    setting.addDropdown((dropdown) =>
      dropdown.addOptions({ a: "Alpha", b: "Beta" }).setValue("b"),
    );
    const select = setting.controlEl.children[0];
    assertEquals(select.children.length, 2);
    assertEquals(select.children[0].attrs.value, "a");
    assert(!("selected" in select.children[0].attrs));
    assert("selected" in select.children[1].attrs);
  });

  it("addButton sets text and CTA class", () => {
    const container = makeVirtualEl();
    const setting = new Setting(container);
    setting.addButton((button) =>
      button
        .setButtonText("Save")
        .setCta()
        .onClick(() => {}),
    );
    const button = setting.controlEl.children[0];
    assertEquals(button.tag, "button");
    assertEquals(button.text, "Save");
    assert(button.attrs.class.includes("primary-button"));
    assert(typeof button.events.click === "number");
  });
});

await t.run();
