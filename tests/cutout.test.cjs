const { test } = require('node:test');
const assert = require('node:assert/strict');

test('detail recovery restores weak solid parts without filling clear background or source transparency', async () => {
  const { refineAlpha } = await import('../src/cutout-tools.mjs');
  const source = new Uint8ClampedArray([200,210,80,255, 40,50,60,255, 100,80,70,45]);
  const cutout = new Uint8ClampedArray([0,0,0,76, 0,0,0,0, 0,0,0,90]);
  refineAlpha(source, cutout, 85);
  assert.deepEqual([...cutout], [200,210,80,255, 40,50,60,0, 100,80,70,45]);
});

test('soft mode keeps partial opacity for translucent effects', async () => {
  const { refineAlpha } = await import('../src/cutout-tools.mjs');
  const pixels = new Uint8ClampedArray([0,0,0,76]);
  refineAlpha(new Uint8ClampedArray([10,20,30,255]), pixels, 0);
  assert.deepEqual([...pixels], [10,20,30,76]);
});

test('restore recovers completely missing pixels, erase removes them, and strokes stay within bounds', async () => {
  const { brushStroke } = await import('../src/cutout-tools.mjs');
  const source = new Uint8ClampedArray(10*10*4).fill(255);
  const pixels = new Uint8ClampedArray(source.length);
  brushStroke(pixels, source, 10, 10, {x:2,y:2}, {x:8,y:8}, 2, true);
  assert.equal(pixels[(5*10+5)*4+3],255);
  assert.equal(pixels[3],0);
  brushStroke(pixels, source, 10, 10, {x:5,y:5}, {x:5,y:5}, 2, false);
  assert.equal(pixels[(5*10+5)*4+3],0);
  brushStroke(pixels, source, 10, 10, {x:-2,y:-2}, {x:0,y:0}, 2, true);
  assert.equal(pixels[3],255);
});
