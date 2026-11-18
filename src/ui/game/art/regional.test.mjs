import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const moduleURL = (source) =>
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`;
const billboardURL = moduleURL(await read('./billboard.ts'));
const placesURL = moduleURL(await read('./places.ts'));
const { regionalScene, scenes } = await import(placesURL);
test('stable IDs determine places regardless of ordering; unknown tiles stay neutral', () => {
  for (const [id, scene] of [
    ['vermilion', 'port'],
    ['olivine', 'port'],
    ['viridian', 'forest'],
    ['cerulean', 'gym'],
    ['goldenrod', 'center'],
    ['ecruteak', 'shrine'],
    ['lugia-trial', 'whirl'],
    ['ho-oh-trial', 'bell'],
    ['fly', 'fly'],
  ]) {
    assert.equal(regionalScene({ id: `tile:kj:${id}`, kind: 'city' }), scene);
  }
  assert.equal(regionalScene({ id: 'tile:unknown:8', kind: 'city' }), 'town');
  assert.equal(
    regionalScene({ id: 'tile:kj:whirl', kind: 'landmark' }),
    'whirl',
  );
  assert.equal(
    regionalScene({ id: 'tile:custom:x', kind: 'city', visualScene: 'bell' }),
    'bell',
  );
});
test('every source/crop matches recorded SHA-256 and records authors and terms', async () => {
  const { assets } = JSON.parse(await read('../assets/regional/credits.json'));
  assert.equal(assets.length, 5);
  for (const asset of assets) {
    const bytes = await readFile(
      new URL(`../assets/regional/${asset.file}`, import.meta.url),
    );
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      asset.sha256,
    );
    assert.ok(asset.authors.includes('Foxowl'));
    assert.match(asset.terms, /credit/);
    assert.equal(bytes.readUInt32BE(0), 0x89504e47);
    if (asset.crop) {
      assert.equal(bytes.readUInt32BE(16), asset.crop[2] - asset.crop[0]);
      assert.equal(bytes.readUInt32BE(20), asset.crop[3] - asset.crop[1]);
    }
  }
});
test('all scene variants render upright SVGs; upgrades clamp to three marks without stretching sprites', async () => {
  const source = (await read('./regional.ts'))
    .replace(/import (\w+) from '.*?\.png';/g, 'const $1 = "asset.png";')
    .replace("'./places'", JSON.stringify(placesURL))
    .replace("'./billboard'", JSON.stringify(billboardURL));
  const { createRegionalFacility } = await import(moduleURL(source));
  const previous = globalThis.document;
  globalThis.document = {
    createElementNS: () => ({
      attrs: {},
      dataset: {},
      setAttribute(key, value) {
        this.attrs[key] = value;
      },
      innerHTML: '',
      append() {},
      querySelectorAll() {
        return [];
      },
    }),
  };
  try {
    const rendered = new Set();
    for (const scene of scenes) {
      const tile = { id: 'tile:custom:x', kind: 'city', visualScene: scene };
      const node = createRegionalFacility(tile, 0);
      assert.equal(node.attrs.viewBox, '0 0 100 120');
      assert.equal(node.attrs['aria-hidden'], 'true');
      assert.equal(node.dataset.scene, scene);
      assert.doesNotMatch(node.innerHTML, /undefined|NaN/);
      assert.equal(
        createRegionalFacility(tile, 3).innerHTML,
        createRegionalFacility(tile, 99).innerHTML,
      );
      rendered.add(node.innerHTML);
    }
    assert.equal(rendered.size, scenes.length);
  } finally {
    globalThis.document = previous;
  }
});

test('all source pixels share one scale and exact bottom-center foot', async () => {
  const { spriteRect } = await import(billboardURL);
  for (const [w, h] of [
    [160, 96],
    [160, 80],
    [96, 80],
    [144, 224],
    [160, 174],
  ]) {
    const r = spriteRect(w, h);
    assert.equal(r.x + r.width / 2, 50);
    assert.equal(r.y + r.height, 108);
    assert.equal(r.width / w, 0.5);
    assert.equal(r.height / h, 0.5);
  }
});
