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

## Recipe review and photography update

- Every one of the 51 library entries has its own optimized WebP illustration. Four extra images cover visibly different recipe options. Images are generated illustrations of the specified dish, not records of past household cooking.
- The recipe review changes ingredients, cuts, methods and sides as well as card descriptions. Rib seasoning and other options are chosen on each menu day; the shopping list buys only that choice.
- Tables, ingredient definitions and recipe catalog changes migrate automatically after deployment. The previous catalog is stored so later catalog releases can merge with personal edits. Votes, users, requests, pantry and menus are preserved. Prior recipe versions stay in history.
- Ingredient changes return affected menus to draft for grocery approval. If a personal edit conflicts with a library change, the personal field remains and Shani can choose **Use reviewed changes** in the recipe dialog.
- Keep the same Worker/Durable Object binding, class and `family` object name when deploying this update. Creating a different object name would create a different household database.
- Run `npm run test:worker` to exercise the Cloudflare API against disposable local data and confirm an actual runtime restart preserves the household. The script does not deploy or modify a Cloudflare account.
