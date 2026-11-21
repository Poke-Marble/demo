/* global document */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountResultNotice } from './index.ts';

test('result notice dedupes receipts, expires without ack, resets and tears down', (t) => {
  class Element {
    children = [];
    attributes = {};
    append(...children) {
      this.children.push(...children);
    }
    replaceChildren() {
      this.children = [];
    }
    setAttribute(key, value) {
      this.attributes[key] = value;
    }
    remove() {
      this.removed = true;
    }
  }
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const root = document.createElement('div');
    const notice = mountResultNotice(root);
    const element = root.children[0];
    assert.equal(element.hidden, true);
    const outcome = { id: 'session:command:0', text: '확정 결과' };
    notice.show([outcome]);
    assert.equal(element.attributes.role, 'status');
    assert.equal(element.children[0].textContent, outcome.text);
    assert.equal(element.hidden, false);
    t.mock.timers.tick(6500);
    assert.equal(element.hidden, true);
    notice.show([{ ...outcome }]);
    assert.equal(
      element.hidden,
      true,
      'cloned redelivery never repeats the alert',
    );
    notice.reset();
    assert.equal(element.children.length, 0);
    notice.show([outcome]);
    assert.equal(
      element.hidden,
      false,
      'new session can reuse local command IDs',
    );
    notice.destroy();
    assert.equal(element.removed, true);
    t.mock.timers.tick(6500);
  } finally {
    globalThis.document = previousDocument;
  }
});
