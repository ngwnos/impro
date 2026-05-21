import { shotClass } from "./shot.js";

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

export function createStaticBowScene({
  isDrawing = false,
  shotPower = null,
} = {}) {
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

export function createStuckArrowScene() {
  return {
    tag: "div",
    cls: "archery-stuck-arrow",
    children: arrowChildren(),
  };
}

export function renderSceneNode(parentEl, node) {
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
