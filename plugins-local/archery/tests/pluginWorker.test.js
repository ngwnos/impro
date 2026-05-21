import assert from "node:assert/strict";
import test from "node:test";

const postedMessages = [];

globalThis.self = {
  postMessage(message) {
    postedMessages.push(message);
  },
  addEventListener() {},
};

const { Plugin } = await import("../src/pluginWorker.js");

function clearMessages() {
  postedMessages.length = 0;
}

test("plugin worker exposes generic target attachments", () => {
  clearMessages();
  const plugin = new Plugin();

  plugin.app.targets.attach(
    {
      targetId: "profile-avatar:1",
      attachmentId: "arrow-1",
      anchor: { x: 0.25, y: 0.75 },
      rotationDeg: 30,
      layer: "foreground",
    },
    (contentEl) => {
      contentEl.createDiv({ cls: "archery-stuck-arrow" });
    },
  );

  const sent = postedMessages.at(-1);
  assert.equal(sent.type, "hostCall");
  assert.equal(sent.method, "attachTargetAttachment");
  assert.equal(sent.args[0].targetId, "profile-avatar:1");
  assert.equal(sent.args[0].attachmentId, "arrow-1");
  assert.deepEqual(sent.args[0].anchor, { x: 0.25, y: 0.75 });
  assert.equal(sent.args[0].rotationDeg, 30);
  assert.equal(sent.args[0].layer, "foreground");
  assert.equal(
    sent.args[0].content.children[0].attrs.class,
    "archery-stuck-arrow",
  );
});
