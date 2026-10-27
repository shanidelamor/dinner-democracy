# Dinner Democracy

A working shared family kitchen for Shani, James and Xander: vote for dinner, plan 7 or 14 days, approve family requests, and shop from a consolidated list.

Built with React + TypeScript, Vite, Express and Node’s native SQLite. A single server owns the database; separate phones use the same hosted address. No Supabase account, third-party API key, or localStorage database is needed.

## Run it

Requires **Node 24+** (native `node:sqlite`).

```sh
cd /workspace/dinner-democracy
npm ci --cache /workspace/.npm-cache
npm run dev
```

The development frontend uses port **5173** and proxies API calls to **3001**. To run the built app on one port:

```sh
npm run build
node server/index.js
```

Open the app in your own development environment’s browser/port-forwarding facility. On first launch, choose Shani’s admin password and separate passwords for James and Xander. No household account or real votes are pre-created. Share the **same hosted address** with the family and give each person their own password privately. Signing out returns to profile selection. Shani can reset family passwords in Settings with her admin password.

Production requires HTTPS, `NODE_ENV=production`, and a private `SETUP_KEY` for first-run setup. See [deployment instructions](docs/DEPLOYMENT.md).

## What works

- 51 seeded library entries: **40 dinners, one side, six lunches, one baking recipe, three archived ideas**. All 41 numbered inventory entries are represented; the carrot dish is a side. Dinner recipes include measured vegetables and exact protein cuts.
- Separate password-protected profile sessions, server-side admin controls, hashed passwords and session tokens, same-origin mutation checks and sign-in rate limits.
- Open/close and preserve voting rounds; YES/NO/MAYBE, swipes or buttons, undo, skip, resume, change votes, personal saved recipes. Absence is distinct from NO.
- Admin results, progress by person, unanimous/two/one YES and MAYBE filters, full round history.
- Multi-line family grocery/cooking requests, own pending-request edits/deletion, visible statuses and potential duplicate warnings. Shani approves requests and explicitly confirms quantities before converting groceries or scheduling recipes.
- Deterministic 7/14-day plans based on attending members’ votes, variety and recent approved plans; configurable taco night; no seafood for James; locked days; attendance/portion edits; swaps; planned leftovers; baking and lunch tasks; approval gate.
- Shopping from approved menus, all vegetable sides, baking/lunch tasks and confirmed requests. Canonical ingredient identity separates cuts and can sizes. Weight and volume units consolidate within compatible dimensions. Free-text requests remain distinct. Purchase quantity edits preserve recipe consumption; pantry, already-have flags and purchased checkboxes persist.
- Full recipe details, serving scaling, cooking mode with checkable steps, supported-browser wake lock, editable ingredients/steps/notes, version history, new family recipes and archival. Recipe changes return related menus to draft for review.
- Mobile/desktop layouts, locally served fonts and illustrative food images, print styles for the fridge menu and grocery list.

## Recipe provenance

Earlier 🥑 Dinner Menu Rotation conversations were **not accessible**. Inventory facts are preserved; exact missing quantities/methods are **proposed reconstructions**, not recovered originals. Only Crispy Salmon Rice Bowls and Harissa Shaved Lamb are seeded as confirmed favorites/made before. The 10 fall recipes are never tried. Other prior-cooking status is unconfirmed. The salmon broiler timing and extremely spicy harissa caution are preserved. Cookies are a proposed GF/egg-free reconstruction, with brown butter, milk powder, white miso, espresso and optional toffee. Food photography is generated illustration, not a photo of a previously cooked household dish.

Shani should review reconstructed recipes before cooking, especially GF product labels and the raw-fish sourcing note for poke.

## Storage & calculations

The database defaults to `data/dinner-democracy.sqlite` (ignored by Git). It uses WAL, foreign keys, normalized ingredient definitions/recipe ingredients, composite vote identities and transactional multi-row edits. Initial schema lives in `server/db.js`, with a `schema_migrations` marker; startup creates/seeds missing records idempotently without resetting household data. Recipe versions retain prior recipe snapshots.

A planned leftover day references a cooked source day. The source batch is scaled to **source portions + all reserved portions once**; the leftover day does not add a second ingredient batch. Rice leftovers must be next day, other leftovers within 3 days. Standalone lunch transformations include their prepared-protein ingredient; they do not automatically subtract leftovers from an unrelated meal. The UI explains this distinction.

Volumes use a **240 mL cooking cup, 15 mL tablespoon, 5 mL teaspoon**; weights use 16 oz/lb. Volume-to-weight conversion is intentionally not guessed. Can/package sizes are part of the ingredient identity. Boneless and bone-in cuts stay separate. Serving yields are proposed generous family portions; bone-in recipes include bone weight. Optional ingredients are shown so Shani can mark them already-have/omit as appropriate. Pantry starts unchecked: no stock is assumed.

## Validation

```sh
npm test
npm run build
npm run test:e2e
```

Browser tests use Playwright with `/usr/bin/chromium` by default; set `CHROMIUM_PATH` for another Chromium executable. They start a separate disposable database and server; they do not seed fake accounts into the real household. On a machine without Chromium, install it or run `npx playwright install --with-deps chromium` and point `CHROMIUM_PATH` at that browser executable.

See [test evidence and limitations](docs/ACCEPTANCE.md). Browser runs create desktop/mobile screenshots and fridge-menu/shopping PDFs under ignored `test-results/`.

## Useful files

- `server/db.js`: schema, migration marker, idempotent seed, SQLite transactions
- `server/recipes.js`: measured recipe inventory and canonical ingredient catalog
- `server/domain.js`: deterministic menu, dietary rules, leftover validation, shopping units
- `server/app.js`: authenticated API and permissions
- `client/main.tsx`, `client/styles.css`: responsive UI, cooking and printing
- `Dockerfile`, `render.yaml`: deployment with a persistent disk
