# CLAUDE.md — Quadra Landing

Landing page of **Quadra** with a waitlist form. Static page plus one Cloudflare Worker route.
No build step, no `package.json`, no dependencies: keep it that way.

## Layout

```
public/index.html          the whole page (HTML, CSS and JS inline), served by Cloudflare as a static asset
public/termos.html, privacidade.html, excluir-conta.html
                           legal pages (/termos, /privacidade, /excluir-conta), linked from the app; drafts
                           with noindex until Johny reviews them with a lawyer
public/convite.html        invite page served for /p/<match id>?c=<code> (opens the app, else Google Play)
worker.js                  POST /api/subscribe (waitlist e-mail in D1, binding `DB`), GET /p/<id> (invite
                           page through binding `ASSETS`), /.well-known/assetlinks.json (Android App Links,
                           fingerprints in var `ANDROID_CERT_SHA256`)
wrangler.jsonc             Worker name, D1 binding, rate limit (binding `LIMITER`, 5 per minute per IP)
tests/subscribe.test.mjs   plain Node asserts against worker.js with a fake D1
```

## Commands

```bash
node tests/subscribe.test.mjs     # must pass before committing a change to worker.js (all routes)
```

## Conventions

- Comments and commit messages in Portuguese, `tipo(landing): resumo` (as in `git log`).
- The `waitlist` table is created by the Worker itself (`CREATE TABLE IF NOT EXISTS`); there
  are no migrations.
- The form's hidden `site` field is a honeypot: a filled value answers `ok` without storing.

## Do NOT

- Do not add a framework, a bundler or npm packages without asking.
- Do not write secrets or a `database_id` in any file.
- Do not log or expose the stored e-mails.
- Do not push or deploy unless asked.
