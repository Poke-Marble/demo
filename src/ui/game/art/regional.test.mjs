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
    ['bell-tower', 'den'],
  ]) {
    assert.equal(regionalScene({ id: `tile:kj:${id}`, kind: 'city' }), scene);
  }
  assert.equal(regionalScene({ id: 'tile:unknown:8', kind: 'city' }), 'town');
  assert.equal(
    regionalScene({ id: 'tile:kj:whirl', kind: 'landmark' }),
    'lake',
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
const ownershipURL = moduleURL(await read('./ownership.ts'));
const {
  ownerTheme,
  ownerFromInput,
  ownerDescription,
  ownerMark,
  applyConstructionOwner,
} = await import(ownershipURL);
const geometryURL = moduleURL(await read('./model-geometry.ts'));
const constructionURL = moduleURL(await read('./construction.ts'));
const buildingsURL = moduleURL(
  (await read('./buildings.ts'))
    .replace("'./model-geometry'", JSON.stringify(geometryURL))
    .replace("'./construction'", JSON.stringify(constructionURL))
    .replace("'./ownership'", JSON.stringify(ownershipURL)),
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
const { createSceneryArt } = await import(
  moduleURL(
    (await read('./regional.ts'))
      .replace("'./places'", JSON.stringify(placesURL))
      .replace("'./model-geometry'", JSON.stringify(geometryURL))
      .replace("'./buildings'", JSON.stringify(buildingsURL)),
  )
);
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
test('start owns the START flag; flight and four landmarks have distinct scenery', () =>
  withSVG(() => {
    const start = createSceneryArt('start').innerHTML;
    const flight = createSceneryArt('fly').innerHTML;
    assert.match(start, /data-marker="start-flag"/);
    assert.match(start, />START</);
    assert.match(flight, /data-marker="flight"/);
    assert.doesNotMatch(flight, /start-flag|START/);
    const scenes = ['power', 'ice', 'lake', 'den', 'whirl', 'bell'];
    assert.equal(
      new Set(scenes.map((scene) => createSceneryArt(scene).innerHTML)).size,
      scenes.length,
    );
  }));

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

const ownerFixtures = [
  { id: 'human', name: 'Human', pokemonId: 'pokemon:0001' },
  { id: 'computer-fire', name: 'COMPUTER FIRE', pokemonId: 'pokemon:0004' },
  { id: 'computer-water', name: 'COMPUTER WATER', pokemonId: 'pokemon:0007' },
  {
    id: 'computer-electric',
    name: 'COMPUTER ELECTRIC',
    pokemonId: 'pokemon:0025',
  },
];
test('owner themes follow authoritative pokemon/type metadata, never roster order or controller', () => {
  const expected = ['grass', 'fire', 'water', 'electric'];
  for (const roster of [
    ownerFixtures,
    [...ownerFixtures].reverse(),
    [...ownerFixtures.slice(2), ...ownerFixtures.slice(0, 2)],
  ]) {
    for (const [i, owner] of ownerFixtures.entries()) {
      const resolved = ownerFromInput(undefined, owner.id, roster);
      assert.equal(resolved.id, owner.id);
      assert.equal(ownerTheme(resolved).key, expected[i]);
      assert.ok(ownerDescription(resolved).includes(owner.name));
    }
  }
  assert.equal(
    ownerTheme({ id: 'x', name: 'External', type: 'electric' }).key,
    'electric',
  );
  assert.equal(ownerTheme({ ...ownerFixtures[0], type: 'water' }).key, 'water');
  assert.equal(
    ownerTheme({ id: 'x', name: 'Unknown', pokemonId: 'pokemon:unknown' }).key,
    'neutral',
  );
  assert.equal(ownerTheme(null).key, 'neutral');
  assert.equal(ownerFromInput(null, 'human', ownerFixtures), null);
  assert.equal(
    ownerFromInput(ownerFixtures[3], 'human', ownerFixtures).id,
    'computer-electric',
  );
  assert.ok(!('ownerColor' in constructionFromHolding({ facilityLevel: 2 })));
});
test('unowned clears ownership, four owned types have distinct code glyphs and no owner-name HTML', () => {
  assert.equal(new Set(ownerFixtures.map((o) => ownerMark(o, 0, 0))).size, 4);
  assert.equal(ownerMark(null, 0, 0), '');
  assert.ok(
    !ownerMark(
      { ...ownerFixtures[0], name: '<img src=x onerror=alert(1)>' },
      0,
      0,
    ).includes('<img'),
  );
  withSVG(() => {
    const tile = { id: 'tile:kj:goldenrod', kind: 'city' };
    for (const owner of ownerFixtures) {
      const empty = createConstructionArt(tile, { stage: 'unowned', owner });
      assert.equal(empty.innerHTML, '');
      assert.equal(empty.dataset.ownerType, 'neutral');
      const camp = createConstructionArt(tile, { stage: 'camp', owner });
      assert.equal(camp.dataset.ownerType, ownerTheme(owner).key);
      assert.equal(camp.dataset.components, 'flag');
      assert.match(camp.innerHTML, /pm-owner-flag/);
      assert.ok(
        camp.innerHTML.includes(`data-owner-mark="${ownerTheme(owner).key}"`),
      );
    }
    const released = createConstructionArt(tile, {
      stage: 'final',
      owner: null,
    });
    assert.equal(released.dataset.stage, 'unowned');
    assert.equal(released.innerHTML, '');
  });
});
test('ownership transfers immediately replace trim/identity while preserving center roof and city architecture', () => {
  withSVG(() => {
    for (const stage of ['center', 'final'])
      for (const slug of ['pallet', 'saffron', 'goldenrod', 'olivine']) {
        const cores = [];
        for (const owner of ownerFixtures) {
          const node = createConstructionArt(
            { id: `tile:kj:${slug}`, kind: 'city' },
            { stage, owner },
          );
          assert.equal(node.dataset.ownerId, owner.id);
          assert.equal(node.dataset.ownerType, ownerTheme(owner).key);
          assert.match(node.innerHTML, /pm-owner-plinth/);
          assert.match(node.innerHTML, /pm-owner-trim/);
          const core = node.innerHTML.match(
            /<g class="pm-architecture-core">([\s\S]*?)<\/g>/,
          )[1];
          cores.push(core);
          assert.ok(core.includes('#d8957c')); // center or center annex stays red for every owner
        }
        assert.equal(new Set(cores).size, 1);
      }
  });
});
test('electric badge retains strong luminance contrast on light board terrain', () => {
  const lum = (hex) => {
    const rgb = hex
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const ratio = (a, b) => {
    const x = lum(a),
      y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  for (const owner of ownerFixtures) {
    const t = ownerTheme(owner);
    assert.ok(ratio(t.light, t.dark) >= 4.5);
  }
  const electric = ownerTheme(ownerFixtures[3]);
  assert.ok(ratio(electric.color, electric.dark) >= 4.5);
  assert.ok(ratio('#e4e7ca', electric.dark) >= 4.5);
});

test('explicit release differs from absent owner metadata and does not mutate construction input', () => {
  const state = Object.freeze({ stage: 'final' });
  assert.equal(applyConstructionOwner(state).stage, 'final');
  assert.equal(applyConstructionOwner(state).owner, undefined);
  assert.equal(applyConstructionOwner(state, null).stage, 'unowned');
  const inherited = Object.freeze({ stage: 'center', owner: ownerFixtures[0] });
  const transferred = applyConstructionOwner(inherited, ownerFixtures[3]);
  assert.equal(transferred.owner.id, 'computer-electric');
  assert.equal(inherited.owner.id, 'human');
  assert.equal(
    applyConstructionOwner({ stage: 'unowned' }, ownerFixtures[0]).owner,
    null,
  );
});
