// Cloudflare Worker do quadra-landing.
// Os arquivos de public/ são servidos direto pela Cloudflare; só o que não é
// arquivo estático chega aqui: POST /api/subscribe, que grava o
// e-mail da lista de interesse no banco D1 ligado como `DB` (ver wrangler.jsonc), o convite
// por link /p/<id> e o /.well-known/assetlinks.json do Android.

const json = (body, status = 200) => Response.json(body, { status });

// ponytail: cria a tabela a cada pedido (IF NOT EXISTS) para não exigir um passo
// manual de SQL; mover para uma migration se o volume crescer.
const CREATE = `CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,
  newsletter INTEGER NOT NULL,
  created_at TEXT NOT NULL
)`;

// Repetir o e-mail não duplica; marcar "novidades" depois apenas liga a opção.
const UPSERT = `INSERT INTO waitlist (email, newsletter, created_at) VALUES (?1, ?2, ?3)
  ON CONFLICT(email) DO UPDATE SET newsletter = MAX(newsletter, excluded.newsletter)`;

export async function subscribe(request, env) {
  // O corpo esperado tem menos de 400 bytes; recusa qualquer coisa muito maior sem ler.
  if (Number(request.headers.get('content-length')) > 2048) return json({ error: 'too_large' }, 413);

  // No máximo 5 envios por minuto por IP (binding LIMITER em wrangler.jsonc).
  // ponytail: o limite é por IP; ligar Turnstile se alguém distribuir o ataque.
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) {
    return json({ error: 'rate_limited' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  // Campo-isca preenchido = robô. Responde ok sem gravar.
  if (body?.site) return json({ ok: true });

  const email = String(body?.email ?? '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'invalid_email' }, 400);
  }

  await env.DB.batch([
    env.DB.prepare(CREATE),
    env.DB.prepare(UPSERT).bind(email, body.newsletter ? 1 : 0, new Date().toISOString()),
  ]);
  return json({ ok: true });
}


// Convite por link: https://quadra-volei.app/p/<id da partida>?c=<código>. Com o app instalado o
// Android abre o app direto (App Links); sem ele, chega aqui e recebe a página public/convite.html,
// que tenta abrir o app e mostra o botão da loja.
const INVITE_PATH = /^\/p\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;

// O Android só abre o app direto pelo link quando este arquivo lista o pacote e a impressão
// digital SHA-256 do certificado que assina o app (variável ANDROID_CERT_SHA256 em wrangler.jsonc,
// várias separadas por vírgula: a da Play Store e a do APK de teste).
export function assetLinks(env) {
  const fingerprints = String(env.ANDROID_CERT_SHA256 ?? '').split(',').map((f) => f.trim()).filter(Boolean);
  if (fingerprints.length === 0) return new Response('Not found', { status: 404 });
  return Response.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: 'com.quadra.app', sha256_cert_fingerprints: fingerprints },
    },
  ]);
}

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/subscribe' && request.method === 'POST') return subscribe(request, env);
    if (request.method === 'GET' && INVITE_PATH.test(pathname)) return env.ASSETS.fetch(new URL('/convite', request.url));
    if (pathname === '/.well-known/assetlinks.json') return assetLinks(env);
    return new Response('Not found', { status: 404 });
  },
};
