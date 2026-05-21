import { Notice, Overlay, Plugin } from "./pluginWorker.js";
import {
  createStaticBowScene,
  createStuckArrowScene,
  renderSceneNode,
} from "./scene.js";
import {
  createBowAimRelationship,
  createCursorDotRelationship,
} from "./relationships.js";
import { createArrowProjectile } from "./projectile.js";
import { getDrawDistance, getShotPower } from "./shot.js";

class ArcheryOverlay extends Overlay {
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
}

class ArcheryPlugin extends Plugin {
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
        new Notice("Reload the page to enable the Archery overlay", 5000);
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
}

ArcheryPlugin.register();
