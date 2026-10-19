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

// Limite estourado e corpo grande demais não chegam ao banco.
const blocked = { ...env, LIMITER: { limit: async () => ({ success: false }) } };
const request = () => new Request('https://x/api/subscribe', { method: 'POST', body: JSON.stringify({ email: 'b@b.co' }) });
assert.equal((await worker.fetch(request(), blocked)).status, 429);
const big = new Request('https://x/api/subscribe', { method: 'POST', headers: { 'content-length': '5000' }, body: '{}' });
assert.equal((await worker.fetch(big, env)).status, 413);
assert.equal(rows.length, 1);


// Convite por link: /p/<uuid> devolve a página do convite; outro caminho em /p/ não.
const served = [];
const withAssets = { ...env, ASSETS: { fetch: async (url) => (served.push(String(url)), new Response('page')) } };
const get = (path, e = withAssets) => worker.fetch(new Request('https://x' + path), e);
assert.equal((await get('/p/0b6f3c1e-2d4a-4e8b-9c7d-1a2b3c4d5e6f?c=ABCD2345')).status, 200);
assert.deepEqual(served, ['https://x/convite']);
assert.equal((await get('/p/nao-e-uuid')).status, 404);

// assetlinks.json só existe com a impressão do certificado configurada.
assert.equal((await get('/.well-known/assetlinks.json')).status, 404);
const links = await (await get('/.well-known/assetlinks.json', { ...withAssets, ANDROID_CERT_SHA256: 'AA:BB, CC:DD' })).json();
assert.deepEqual(links[0].target, { namespace: 'android_app', package_name: 'com.quadra.app', sha256_cert_fingerprints: ['AA:BB', 'CC:DD'] });
console.log('ok');
