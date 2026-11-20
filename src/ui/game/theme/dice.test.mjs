import assert from 'node:assert/strict';
import test from 'node:test';
import { diceLabel } from './dice.ts';

test('dice text sums any number of faces without changing the source', () => {
  const values = Object.freeze([6, 3, 2]);
  assert.equal(diceLabel(values, 'moving'), '이동 11칸 · 이동 중…');
  assert.equal(diceLabel(values), '이동 11칸 · 완료');
  assert.deepEqual(values, [6, 3, 2]);
  assert.equal(diceLabel([6, 3]), '이동 9칸 · 완료');
});

test('pending and rolling text never exposes confirmed faces', () => {
  assert.equal(diceLabel(null), '이동 —');
  assert.equal(diceLabel([]), '이동 —');
  assert.equal(diceLabel([6, 3], 'rolling'), '굴리는 중…');
});
