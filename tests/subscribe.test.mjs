// node tests/subscribe.test.mjs
import assert from 'node:assert/strict';
import worker from '../worker.js';

// D1 de mentira: guarda só os valores do INSERT.
const rows = [];
const env = {
  DB: {
    prepare: (sql) => ({ sql, bind: (...values) => ({ sql, values }) }),
    batch: async (statements) => rows.push(statements.at(-1).values),
  },
};
const post = (body, path = '/api/subscribe') =>
  worker.fetch(new Request('https://x' + path, { method: 'POST', body }), env);

assert.equal((await post('{}', '/outra')).status, 404);
assert.equal((await worker.fetch(new Request('https://x/api/subscribe'), env)).status, 404);
assert.equal((await post('not json')).status, 400);
assert.equal((await post(JSON.stringify({ email: 'sem-arroba' }))).status, 400);
assert.equal((await post(JSON.stringify({ email: 'a@b.co', site: 'bot' }))).status, 200);
assert.equal(rows.length, 0, 'isca preenchida não grava');

assert.equal((await post(JSON.stringify({ email: '  Ana@Exemplo.COM ', newsletter: true }))).status, 200);
assert.deepEqual(rows[0].slice(0, 2), ['ana@exemplo.com', 1]);

console.log('ok');
