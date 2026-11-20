/* global URL */
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');
const moduleURL = (text) =>
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(text)).replaceAll("'", '%27')}`;
const cardURL = moduleURL(await source('./card.ts'));
const queueURL = moduleURL(await source('../queue.ts'));
const { createSpecialEventPresenter } = await import(
  moduleURL(
    (await source('../presenter.ts'))
      .replace(
        "import { createLegendarySprite } from './legendary-sprite';",
        'const createLegendarySprite = () => undefined;',
      )
      .replace("from './queue'", `from '${queueURL}'`)
      .replace("from './flight-picker/card'", `from '${cardURL}'`)
      .replaceAll(/^import '\.\/.*\.css';$/gm, ''),
  )
);

class Element {
  children = [];
  parent = null;
  dataset = {};
  disabled = false;
  attributes = new Map();
  classList = { toggle() {} };
  constructor(tag) {
    this.tag = tag;
  }
  setAttribute(k, v) {
    this.attributes.set(k, v);
  }
  append(...items) {
    items.forEach((c) => {
      c.parent = this;
      this.children.push(c);
    });
  }
  remove() {
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  showModal() {}
  close() {}
  focus() {
    globalThis.document.activeElement = this;
  }
  click() {
    if (!this.disabled) this.onclick?.();
  }
  scrollIntoView() {
    this.scrolled = true;
  }
  querySelectorAll() {
    return this.children.flatMap((c) => [
      ...(c.tag === 'button' ? [c] : []),
      ...c.querySelectorAll(),
    ]);
  }
  querySelector() {
    return this.querySelectorAll().find((c) => !c.disabled);
  }
}
function fixture() {
  globalThis.HTMLElement = Element;
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    activeElement: null,
  };
  globalThis.matchMedia = () => ({ matches: false });
  const root = new Element('root');
  const presenter = createSpecialEventPresenter({
    root,
    describe: () => ({}),
    lock: () => {},
  });
  return { root, presenter };
}
const selection = {
  id: 'revision:1',
  playerId: 'player:1',
  cancellable: true,
  destinations: [
    {
      tileId: 'tile:a',
      label: '태초마을',
      metadata: {
        kind: 'city',
        ownership: 'self',
        ownerName: '나',
        ownerType: '물',
        ownerColor: 'water',
        facilityStage: 2,
        facilityName: '포켓몬센터',
        toll: 0,
      },
    },
    {
      tileId: 'tile:b',
      label: '관광명소',
      metadata: {
        kind: 'landmark',
        ownership: 'opponent',
        ownerName: '상대',
        toll: 50,
      },
    },
  ],
};
test('same revision metadata refreshes; old handlers and changed revision cannot submit', async () => {
  const { root, presenter } = fixture();
  const calls = [];
  const choose = (...args) => {
    calls.push(args);
  };
  presenter.select(selection, choose);
  const old = root.querySelectorAll();
  old[0].click();
  presenter.select(
    {
      ...selection,
      destinations: selection.destinations.map((d) => ({
        ...d,
        label: d.label + ' 갱신',
      })),
    },
    choose,
  );
  old[2].onclick();
  assert.equal(calls.length, 0);
  assert.equal(root.querySelectorAll()[2].disabled, true);
  assert.equal(
    root.querySelectorAll()[0].children[0].textContent,
    '태초마을 갱신',
  );
  const intermediate = root.querySelectorAll();
  intermediate[0].click();
  presenter.select({ ...selection, id: 'revision:2' }, choose);
  intermediate[2].onclick();
  assert.equal(calls.length, 0);
  root.querySelectorAll()[1].click();
  root.querySelectorAll()[2].click();
  assert.deepEqual(calls, [['revision:2', 'tile:b']]);
  await Promise.resolve();
  presenter.destroy();
});
test('direction keys move focus and expose target without selecting or committing', () => {
  const { root, presenter } = fixture();
  let count = 0;
  presenter.select(selection, () => {
    count++;
  });
  const [a, b, confirm] = root.querySelectorAll();
  a.onkeydown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(globalThis.document.activeElement, b);
  assert.equal(b.scrolled, true);
  assert.equal(confirm.disabled, true);
  assert.equal(count, 0);
  b.onkeydown({ key: 'Enter', preventDefault() {} });
  assert.equal(confirm.disabled, false);
  assert.equal(count, 0);
  presenter.destroy();
});
test('cards distinguish landmark from facility and never invent missing prices', () => {
  const { root, presenter } = fixture();
  presenter.select(selection, () => {});
  const [city, landmark] = root.querySelectorAll();
  assert.equal(city.dataset.ownerColor, 'water');
  assert.ok(
    city.children.some((c) => c.textContent === '시설 2단계 · 포켓몬센터'),
  );
  assert.ok(landmark.children.some((c) => c.textContent === '관광명소'));
  assert.ok(!landmark.children.some((c) => c.textContent?.includes('단계')));
  presenter.select(
    {
      ...selection,
      id: 'missing',
      destinations: [{ tileId: 'tile:c', label: '출발' }],
    },
    () => {},
  );
  assert.ok(
    root
      .querySelectorAll()[0]
      .children.some((c) => c.textContent === '미리보기 정보 없음'),
  );
  presenter.destroy();
});
