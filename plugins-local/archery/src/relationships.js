export function createBowAimRelationship() {
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

export function createCursorDotRelationship() {
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
