import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptText } from '../src/lib.js';

test('receipt body: order no, every item, total, library link', () => {
  const body = receiptText({
    order_no: 'ORD-2569-00001', total: 1290, paid_at: new Date('2026-10-05T03:00:00Z'),
    items: [{ name: 'Excel Template', price: 290 }, { name: 'คอร์ส SQL', price: 1000 }],
  }, 'https://shop.test/library');
  for (const s of ['ORD-2569-00001', 'Excel Template', 'คอร์ส SQL', 'https://shop.test/library'])
    assert.ok(body.includes(s), `missing ${s}`);
  assert.match(body, /1,?290/, 'total');
});
