import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, parseCsv } from '../src/lib.js';

test('parseCsv: quotes, embedded commas/newlines, BOM, CRLF, blank lines', () => {
  const rows = parseCsv('\uFEFFname,price,description\r\n"ชุด ""Pro"", v2",199,"บรรทัด 1\nบรรทัด 2"\r\n\r\nplain,50,\r\n');
  assert.deepEqual(rows, [
    { name: 'ชุด "Pro", v2', price: '199', description: 'บรรทัด 1\nบรรทัด 2' },
    { name: 'plain', price: '50', description: '' },
  ]);
  assert.deepEqual(parseCsv(''), []);
});

test('toCsv → parseCsv round trip keeps awkward values intact', () => {
  const rows = [{ name: 'a, b', note: 'say "hi"', body: 'line1\nline2', n: 12.5, none: null }];
  const csv = toCsv(rows, Object.keys(rows[0]));
  assert.ok(csv.startsWith('\uFEFFname,note,body,n,none\r\n'));
  assert.deepEqual(parseCsv(csv), [{ name: 'a, b', note: 'say "hi"', body: 'line1\nline2', n: '12.5', none: '' }]);
});

test('toCsv defuses spreadsheet formulas in strings, leaves numbers alone, and import undoes it', () => {
  const rows = [{ name: '=HYPERLINK("http://evil","x")', title: '-50% Bundle', at: '@me', n: -5 }];
  const csv = toCsv(rows, Object.keys(rows[0]));
  assert.equal(csv.split('\r\n')[1], `"'=HYPERLINK(""http://evil"",""x"")",'-50% Bundle,'@me,-5`);
  assert.deepEqual(parseCsv(csv), [{ name: rows[0].name, title: '-50% Bundle', at: '@me', n: '-5' }]);
});
