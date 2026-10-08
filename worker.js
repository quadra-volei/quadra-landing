// Cloudflare Worker do quadra-landing.
// Os arquivos de public/ são servidos direto pela Cloudflare; só o que não é
// arquivo estático chega aqui. A única rota é POST /api/subscribe, que grava o
// e-mail da lista de interesse no banco D1 ligado como `DB` (ver wrangler.jsonc).

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

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/subscribe' && request.method === 'POST') return subscribe(request, env);
    return new Response('Not found', { status: 404 });
  },
};
