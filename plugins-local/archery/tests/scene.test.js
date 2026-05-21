import assert from "node:assert/strict";
import test from "node:test";
import { createStaticBowScene, createStuckArrowScene } from "../src/scene.js";

test("static bow scene contains a bow, bowstring, arrow, and cursor dot", () => {
  const scene = createStaticBowScene();

  assert.equal(scene.tag, "div");
  assert.equal(scene.cls, "archery-stage");
  assert.deepEqual(scene.children, [
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
          children: [
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
          ],
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
      children: [
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
      ],
    },
    {
      tag: "div",
      cls: "archery-cursor-dot",
      animationTarget: "cursor-dot",
      children: [],
    },
  ]);
});

test("static bow scene marks the stage while drawing", () => {
  const scene = createStaticBowScene({ isDrawing: true });

  assert.equal(scene.cls, "archery-stage archery-is-drawing");
});

test("static bow scene marks the stage while an arrow is flying", () => {
  const scene = createStaticBowScene({ shotPower: 3 });

  assert.equal(
    scene.cls,
    "archery-stage archery-is-flying archery-shot-power-3",
  );
});

test("stuck arrow scene renders a plugin target attachment arrow", () => {
  assert.deepEqual(createStuckArrowScene(), {
    tag: "div",
    cls: "archery-stuck-arrow",
    children: [
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
    ],
  });
});
