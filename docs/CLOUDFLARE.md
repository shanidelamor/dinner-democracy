# Deploying on Cloudflare (no database setup needed)

The app runs as one Cloudflare Worker. Pages and images are served by Cloudflare;
`/api/*` runs in a Durable Object with built-in SQLite, which holds all family data.
Tables and recipes are created automatically on first request.

## One-time setup in the Cloudflare dashboard

1. dash.cloudflare.com -> **Workers & Pages** -> **Create** -> **Import a repository** (Git).
2. Connect GitHub and choose `shanidelamor/dinner-democracy`, branch `main`.
3. Project name: `dinner-democracy`. Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
4. Save and deploy. The first deploy creates the Worker.
5. Open the Worker -> **Settings** -> **Variables and Secrets** -> **Add**, type **Secret**, name `SETUP_KEY`, value = a long random password. Deploy again if asked.
6. Open the `*.workers.dev` address, enter the setup key, then choose passwords for Shani, James and Xander.
7. Optional: Worker -> **Settings** -> **Domains & Routes** -> add `dinner.yourdomain.com`.

## Local checks

```sh
echo 'SETUP_KEY=anything-local' > .dev.vars
npm run cf:dev          # builds and runs the Worker locally on :8787
TEST_BASE_URL=http://localhost:8787 TEST_SETUP_KEY=anything-local node --test tests/api.test.js
```

## Notes

- Keep the single Durable Object name `family`; it is the household's database.
- Backups: Cloudflare dashboard -> Durable Objects -> point-in-time recovery is available for SQLite objects (30 days).
- The Render/Docker files still work for the Node version.
