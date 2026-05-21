import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("arrow draw uses a longer arrow and transform-based pullback", () => {
  assert.match(css, /--archery-arrow-length:\s*118px;/);
  assert.match(
    css,
    /\.archery-arrow\s*\{[\s\S]*transform:\s*translate\(0,\s*-50%\);/,
  );
  assert.match(
    css,
    /\.archery-arrow\s*\{[\s\S]*transition:\s*transform 1300ms linear;/,
  );
  assert.match(
    css,
    /\.archery-is-drawing \.archery-bow-aim \.archery-arrow\s*\{[\s\S]*transform:\s*translate\(-48px,\s*-50%\);/,
  );
});

test("arrow fletching leans backward from the direction of travel", () => {
  assert.match(
    css,
    /\.archery-arrow-fletching-top\s*\{[\s\S]*transform:\s*skewX\(28deg\);/,
  );
  assert.match(
    css,
    /\.archery-arrow-fletching-bottom\s*\{[\s\S]*transform:\s*skewX\(-28deg\);/,
  );
});

test("bow string pullback lines meet the fully drawn arrow back", () => {
  assert.match(
    css,
    /\.archery-is-drawing \.archery-bow-string-line\s*\{[\s\S]*width:\s*83px;/,
  );
  assert.match(
    css,
    /\.archery-is-drawing \.archery-bow-string-line-top\s*\{[\s\S]*transform:\s*rotate\(125deg\);/,
  );
  assert.match(
    css,
    /\.archery-is-drawing \.archery-bow-string-line-bottom\s*\{[\s\S]*transform:\s*rotate\(-125deg\);/,
  );
});

test("released arrows use a host-controlled flying arrow", () => {
  assert.match(css, /--archery-arrow-half-height:\s*9px;/);
  assert.match(css, /\.archery-flying-arrow\s*\{[\s\S]*opacity:\s*0;/);
  assert.match(
    css,
    /\.archery-flying-arrow\s*\{[\s\S]*top:\s*calc\(var\(--archery-string-center-y\) - var\(--archery-arrow-half-height\)\);/,
  );
  assert.match(
    css,
    /\.archery-flying-arrow\s*\{[\s\S]*transform-origin:\s*0 50%;/,
  );
  assert.match(
    css,
    /\.archery-is-flying \.archery-bow-aim \.archery-arrow\s*\{[\s\S]*opacity:\s*0;/,
  );
  assert.doesNotMatch(css, /@keyframes archery-arrow-flight-power-/);
});
