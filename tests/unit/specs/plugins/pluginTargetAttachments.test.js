import { TestSuite } from "../../testSuite.js";
import { assert, assertEquals } from "../../testHelpers.js";
import { PluginRenderer } from "/js/plugins/pluginRendering.js";
import { getPluginHitTargets } from "/js/plugins/pluginHitTargets.js";
import {
  attachPluginTargetAttachment,
  clearPluginTargetAttachmentsForPlugin,
  removePluginTargetAttachment,
} from "/js/plugins/pluginTargetAttachments.js";

const t = new TestSuite("Plugin Target Attachments");

function clearDOM() {
  document.body.innerHTML = "";
  clearPluginTargetAttachmentsForPlugin("archery__LOCAL");
}

function rect({ x, y, width, height }) {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

function createRenderer(pluginId = "archery__LOCAL") {
  return new PluginRenderer(
    {
      handleNodeEvent() {},
    },
    pluginId,
  );
}

function addAvatarTarget() {
  const wrapper = document.createElement("div");
  wrapper.className = "avatar";
  const link = document.createElement("a");
  link.className = "avatar-link";
  const avatar = document.createElement("img");
  avatar.dataset.pluginHitTarget = "profile-avatar";
  avatar.getBoundingClientRect = () =>
    rect({ x: 20, y: 40, width: 80, height: 80 });
  link.appendChild(avatar);
  wrapper.appendChild(link);
  document.body.appendChild(wrapper);
  const target = getPluginHitTargets({ targetKinds: ["profile-avatar"] })[0];
  return { wrapper, target };
}

t.describe("attachPluginTargetAttachment", (it) => {
  it("renders sanitized plugin content anchored to an opaque target id", () => {
    clearDOM();
    const { wrapper, target } = addAvatarTarget();

    const attached = attachPluginTargetAttachment({
      pluginRenderer: createRenderer(),
      pluginId: "archery__LOCAL",
      targetId: target.id,
      attachmentId: "arrow-1",
      content: {
        tag: "div",
        attrs: { class: "archery-stuck-arrow" },
        children: [],
      },
      anchor: { x: 0.25, y: 0.75 },
      rotationDeg: 30,
      layer: "foreground",
    });

    assert(attached, "attachment should be created for a connected target");
    const attachment = wrapper.querySelector(".plugin-target-attachment");
    assert(attachment, "attachment should render inside the avatar wrapper");
    assertEquals(attachment.dataset.pluginId, "archery__LOCAL");
    assertEquals(attachment.dataset.targetId, target.id);
    assertEquals(attachment.dataset.attachmentId, "arrow-1");
    assertEquals(attachment.dataset.layer, "foreground");
    assertEquals(attachment.style.left, "25%");
    assertEquals(attachment.style.top, "75%");
    assertEquals(
      attachment.style.transform,
      "translate(-50%, -50%) rotate(30deg)",
    );
    assert(attachment.querySelector(".archery-stuck-arrow"));
  });

  it("updates an existing attachment with the same plugin target and attachment id", () => {
    clearDOM();
    const { wrapper, target } = addAvatarTarget();
    const base = {
      pluginRenderer: createRenderer(),
      pluginId: "archery__LOCAL",
      targetId: target.id,
      attachmentId: "badge",
      content: { tag: "div", attrs: { class: "first" }, children: [] },
    };

    attachPluginTargetAttachment({
      ...base,
      anchor: { x: 0.1, y: 0.2 },
      rotationDeg: 0,
    });
    attachPluginTargetAttachment({
      ...base,
      content: { tag: "div", attrs: { class: "second" }, children: [] },
      anchor: { x: 0.8, y: 0.9 },
      rotationDeg: 15,
    });

    assertEquals(
      wrapper.querySelectorAll(".plugin-target-attachment").length,
      1,
    );
    const attachment = wrapper.querySelector(".plugin-target-attachment");
    assertEquals(attachment.style.left, "80%");
    assertEquals(attachment.style.top, "90%");
    assert(attachment.querySelector(".second"));
  });

  it("removes one attachment and clears all attachments for a plugin", () => {
    clearDOM();
    const { wrapper, target } = addAvatarTarget();
    const renderer = createRenderer();

    attachPluginTargetAttachment({
      pluginRenderer: renderer,
      pluginId: "archery__LOCAL",
      targetId: target.id,
      attachmentId: "one",
      content: { tag: "div", children: [] },
      anchor: { x: 0.5, y: 0.5 },
    });
    attachPluginTargetAttachment({
      pluginRenderer: renderer,
      pluginId: "archery__LOCAL",
      targetId: target.id,
      attachmentId: "two",
      content: { tag: "div", children: [] },
      anchor: { x: 0.5, y: 0.5 },
    });

    removePluginTargetAttachment({
      pluginId: "archery__LOCAL",
      targetId: target.id,
      attachmentId: "one",
    });

    assertEquals(
      wrapper.querySelectorAll(".plugin-target-attachment").length,
      1,
    );
    clearPluginTargetAttachmentsForPlugin("archery__LOCAL");
    assertEquals(
      wrapper.querySelectorAll(".plugin-target-attachment").length,
      0,
    );
  });

  it("does not attach to a disconnected target", () => {
    clearDOM();
    const { wrapper, target } = addAvatarTarget();
    wrapper.remove();

    const attached = attachPluginTargetAttachment({
      pluginRenderer: createRenderer(),
      pluginId: "archery__LOCAL",
      targetId: target.id,
      attachmentId: "arrow-1",
      content: { tag: "div", children: [] },
      anchor: { x: 0.5, y: 0.5 },
    });

    assertEquals(attached, false);
  });
});

await t.run();
