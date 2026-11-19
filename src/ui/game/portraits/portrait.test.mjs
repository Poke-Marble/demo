import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';
import { createHash } from 'node:crypto';

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');
const moduleURL = (source) =>
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source)).replaceAll("'", '%27')}`;
const manifest = JSON.parse(await read('./manifest.json'));
const catalogURL = moduleURL(
  (await read('./catalog.ts')).replace(
    "import manifest from './manifest.json';",
    `const manifest = ${JSON.stringify(manifest)};`,
  ),
);
const emotionsURL = moduleURL(await read('./emotions.ts'));
const { portraitEntry } = await import(catalogURL);
const { createPortrait } = await import(
  moduleURL(
    (await read('./portrait.ts'))
      .replace("from './catalog'", `from '${catalogURL}'`)
      .replace("from './emotions'", `from '${emotionsURL}'`)
      .replace("import './portraits.css';", '')
      .replace(
        /const urls = import.meta.glob<string>[\s\S]*?\n\}\);/,
        'const urls = {};',
      ),
  )
);

// Loader lifecycle test double; native browser display is verified separately.
class Element {
  children = [];
  attributes = new Map();
  dataset = {};
  classes = new Set();
  classList = {
    add: (value) => this.classes.add(value),
    remove: (value) => this.classes.delete(value),
  };
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
  removeAttribute(key) {
    this.attributes.delete(key);
  }
  replaceChildren(...children) {
    this.children = children;
  }
}
function fixture(source = (_, emotion) => ({ url: emotion, emotion })) {
  globalThis.document = { createElement: () => new Element() };
  const images = [];
  const portrait = createPortrait({
    pokemonId: 'pokemon:0025',
    name: '피카츄',
    source,
    image: () => {
      const image = new Element();
      images.push(image);
      return image;
    },
  });
  return { portrait, images };
}

test('catalog uses only confirmed emotions and falls back to Normal for missing emotions', () => {
  for (const species of manifest.species) {
    assert.equal(
      portraitEntry(species.pokemonId, 'NotAnEmotion').emotion,
      'Normal',
    );
    assert.equal(portraitEntry(species.pokemonId, 'Sad').emotion, 'Sad');
  }
  assert.equal(portraitEntry('pokemon:9999', 'Happy'), undefined);
});

test('portrait files have exact hashes, dimensions, per-emotion CUR creators and directory/tracker evidence', async () => {
  assert.equal(manifest.portraits.length, 36);
  for (const portrait of manifest.portraits) {
    const png = await readFile(new URL(portrait.path, import.meta.url));
    assert.equal(
      createHash('sha256').update(png).digest('hex'),
      portrait.sha256,
    );
    assert.equal(png.readUInt32BE(16), 40);
    assert.equal(png.readUInt32BE(20), 40);
    const dex = portrait.pokemonId.slice(8);
    const tracker = JSON.parse(await read(`./evidence/${dex}/tracker.json`));
    const listing = JSON.parse(await read(`./evidence/${dex}/directory.json`));
    assert.equal(tracker.portrait_files[portrait.emotion], true);
    assert.ok(
      listing.some(
        (entry) =>
          entry.name === `${portrait.emotion}.png` && entry.type === 'file',
      ),
    );
    assert.ok(
      portrait.credits.every(
        (credit) =>
          credit.status === 'CUR' && credit.emotions.includes(portrait.emotion),
      ),
    );
    assert.equal(portrait.provenance, 'original-game-extraction');
    assert.match(portrait.licenseStatus, /Unspecified/);
  }
});

test('loaded portrait has fixed dimensions, accessible actual expression and no reload on unchanged reaction', () => {
  const { portrait, images } = fixture();
  portrait.setReaction('joy');
  images[0].onload();
  assert.equal(images[0].width, 40);
  assert.equal(images[0].height, 40);
  assert.equal(portrait.element.dataset.emotion, 'Happy');
  assert.match(
    portrait.element.attributes.get('aria-label'),
    /피카츄 · 기쁜 표정/,
  );
  portrait.setReaction('joy');
  assert.equal(images.length, 1);
  portrait.destroy();
});

test('a delayed old load cannot overwrite a newer expression or write after destroy', () => {
  const { portrait, images } = fixture();
  portrait.setReaction('joy');
  const oldLoad = images[0].onload;
  portrait.setReaction('distress');
  images[1].onload();
  oldLoad();
  assert.equal(portrait.element.dataset.emotion, 'Worried');
  portrait.setReaction('pain');
  const lateLoad = images[2].onload;
  portrait.destroy();
  lateLoad();
  assert.equal(portrait.element.dataset.emotion, 'Worried');
  assert.equal(images[2].onload, null);
  assert.equal(images[2].onerror, null);
});

test('failed expression tries Normal once, then shows consistent graphic with no broken image', () => {
  const { portrait, images } = fixture();
  portrait.setReaction('pain');
  const failedImageLateLoad = images[0].onload;
  images[0].onerror();
  assert.equal(images[1].src, 'Normal');
  failedImageLateLoad();
  assert.equal(
    portrait.element.children.length,
    0,
    'failed request cannot become visible during fallback',
  );
  images[1].onerror();
  assert.equal(images.length, 2);
  assert.equal(portrait.element.children.length, 0);
  assert.ok(portrait.element.classes.has('pm-portrait-fallback'));
  assert.match(portrait.element.attributes.get('aria-label'), /기본 아이콘/);
  portrait.destroy();
});

test('missing emotion uses Normal and its accessible label; unsupported species stays a graphic', () => {
  const normal = fixture(() => ({ url: 'Normal', emotion: 'Normal' }));
  normal.portrait.setReaction('joy');
  normal.images[0].onload();
  assert.match(
    normal.portrait.element.attributes.get('aria-label'),
    /평온한 표정 · 기본 초상화로 대체/,
  );
  normal.portrait.destroy();
  const missing = fixture(() => undefined);
  missing.portrait.setReaction('joy');
  assert.equal(missing.images.length, 0);
  assert.ok(missing.portrait.element.classes.has('pm-portrait-fallback'));
  missing.portrait.destroy();
});
