import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const moduleURL = (source) =>
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`;
const placesURL = moduleURL(await read('./places.ts'));
const { regionalScene } = await import(placesURL);
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
const geometryURL = moduleURL(await read('./model-geometry.ts'));
const constructionURL = moduleURL(await read('./construction.ts'));
const buildingsURL = moduleURL(
  (await read('./buildings.ts'))
    .replace("'./model-geometry'", JSON.stringify(geometryURL))
    .replace("'./construction'", JSON.stringify(constructionURL)),
);
const {
  constructionFromHolding,
  builtComponents,
  finalFacility,
  constructionStages,
  finalFacilities,
} = await import(constructionURL);
const {
  createConstructionArt,
  shouldAnimateConstruction,
  animateConstruction,
} = await import(buildingsURL);
const { modelPoint, modelGeometry, modelPlacement } = await import(geometryURL);
function withSVG(run) {
  const previous = globalThis.document;
  globalThis.document = {
    createElementNS: () => ({
      attrs: {},
      dataset: {},
      innerHTML: '',
      setAttribute(key, value) {
        this.attrs[key] = value;
      },
    }),
  };
  try {
    run();
  } finally {
    globalThis.document = previous;
  }
}
test('ownership and construction are explicit; no holding is empty and owned zero is flag only', () => {
  assert.deepEqual(constructionFromHolding(), { stage: 'unowned' });
  for (const [facilityLevel, stage] of [
    [0, 'camp'],
    [1, 'shop'],
    [2, 'center'],
    [3, 'final'],
    [9, 'final'],
    [-1, 'camp'],
    [NaN, 'camp'],
  ])
    assert.equal(constructionFromHolding({ facilityLevel }).stage, stage);
  withSVG(() => {
    for (const stage of constructionStages) {
      const node = createConstructionArt(
        { id: 'tile:kj:pallet', kind: 'city' },
        { stage },
      );
      assert.equal(node.dataset.stage, stage);
      assert.doesNotMatch(node.innerHTML, /<image|url\(|NaN|undefined/);
      const built = builtComponents({ stage });
      if (stage === 'unowned') assert.equal(node.innerHTML, '');
      if (stage === 'camp') {
        assert.equal(node.dataset.components, 'flag');
        assert.equal(built.shop, false);
      }
      if (stage === 'shop') assert.equal(node.dataset.components, 'flag shop');
      if (stage === 'center')
        assert.equal(node.dataset.components, 'flag shop center');
      if (stage === 'final')
        assert.equal(node.dataset.components, 'flag shop center signature');
    }
  });
});
test('city signatures use identity rather than all gyms and exclude trial towers/islands', () => {
  const expected = {
    pallet: 'lab',
    'new-bark': 'lab',
    celadon: 'department-store',
    saffron: 'silph',
    goldenrod: 'radio-tower',
    olivine: 'lighthouse',
    ecruteak: 'cultural-hall',
  };
  for (const [id, model] of Object.entries(expected))
    assert.equal(finalFacility({ id: `tile:kj:${id}`, kind: 'city' }), model);
  assert.ok(
    !Object.values(finalFacilities).some((x) => ['bell', 'whirl'].includes(x)),
  );
  assert.equal(
    finalFacility({
      id: 'tile:kj:pallet',
      kind: 'city',
      finalFacility: 'museum',
    }),
    'museum',
  );
  withSVG(() => {
    const drawings = new Set();
    for (const model of new Set(Object.values(finalFacilities))) {
      const node = createConstructionArt(
        { id: 'tile:custom:x', kind: 'city', finalFacility: model },
        { stage: 'final' },
      );
      assert.equal(node.dataset.model, model);
      drawings.add(node.innerHTML);
      for (const points of node.innerHTML.matchAll(/points="([^"]+)"/g))
        for (const pair of points[1].split(' ')) {
          const [x, y] = pair.split(',').map(Number);
          assert.ok(
            x >= 0 && x <= 100 && y >= 0 && y <= 120,
            `${model}: ${pair}`,
          );
        }
    }
    assert.equal(drawings.size, new Set(Object.values(finalFacilities)).size);
  });
});
test('common projected footprint stays inside 32 board tiles; slopes and foot match terrain', () => {
  assert.equal(modelGeometry.slope, 230 / 400);
  const p = modelPoint(0, 0),
    a = modelPoint(10, 0),
    b = modelPoint(0, 10);
  assert.equal((a.y - p.y) / (a.x - p.x), modelGeometry.slope);
  assert.equal((b.y - p.y) / (b.x - p.x), -modelGeometry.slope);
  const footprint = [
    [-21, -18],
    [21, -18],
    [21, 18],
    [-21, 18],
  ];
  for (const width of [85.333333, 180, 40]) {
    const tile = { x: 500, y: 300, width };
    const placement = modelPlacement(tile),
      scale = placement.width / 100;
    assert.equal(placement.height / placement.width, 1.2);
    for (const [u, v] of footprint) {
      const point = modelPoint(u, v);
      const x = placement.x + (point.x - 50) * scale;
      const y = placement.y + (point.y - 108) * scale;
      assert.ok(
        Math.abs(x - tile.x) / (width / 2) +
          Math.abs(y - tile.y) / ((width * modelGeometry.slope) / 2) <=
          1,
      );
    }
  }
});
test('construction appearance runs only on increases, finishes in 320ms and respects reduced motion', () => {
  assert.equal(shouldAnimateConstruction(undefined, { stage: 'final' }), false);
  assert.equal(
    shouldAnimateConstruction({ stage: 'shop' }, { stage: 'shop' }),
    false,
  );
  assert.equal(
    shouldAnimateConstruction({ stage: 'final' }, { stage: 'camp' }),
    false,
  );
  assert.equal(
    shouldAnimateConstruction({ stage: 'unowned' }, { stage: 'camp' }),
    true,
  );
  const previous = globalThis.matchMedia;
  let calls = 0;
  const node = {
    animate(_frames, options) {
      calls++;
      assert.equal(options.duration, 320);
    },
  };
  try {
    globalThis.matchMedia = () => ({ matches: true });
    animateConstruction(node);
    assert.equal(calls, 0);
    globalThis.matchMedia = () => ({ matches: false });
    animateConstruction(node);
    assert.equal(calls, 1);
  } finally {
    globalThis.matchMedia = previous;
  }
});
