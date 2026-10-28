# Dinner Democracy smart planning update

Implemented in the existing React/Express app and shared SQLite/Durable Object database. Existing household accounts, recipes, votes, requests, menu editing, recipe versions and approval controls are retained. No production database was accessed or reset.

## Behavior

- New rounds snapshot the Los Angeles local date, season and configurable seasonal weight (default 60%). One shared, ordered candidate pool is saved. Last calendar week's completed meals (Monday–Sunday) are excluded; cooking within 14 days is deprioritized. Seasonal preferences fall back to other eligible recipes without removing the cooked-history exclusion.
- The existing single-card voting screen now counts YES toward 10, stops automatically, supports Finish Early and preserves server-side progress. NO/MAYBE do not contribute. Undo and saved-vote review remain available. The working deck uses up to 10 eligible cards at a time and advances as options are needed. Exhausting a small pool permits completion.
- Results show YES=3, MAYBE=1, NO=0, with unanimous YES first and each person's saved vote visible. Missing votes stay unvoted. Menu generation no longer penalizes preference NO votes. Dietary compatibility is applied separately.
- An incomplete household vote requires an explicit provisional-plan checkbox. Generation supports existing 7/14-day plans, optional per-day home cooking/attendance/serving overrides, taco-night settings, intentional leftovers, season and cooking-effort preferences. Existing approval, locking, swapping, moving, serving edits and extra-recipe tasks remain.
- Mark as Cooked records actual local cooking date, recipe, diner count, originating menu and day. The API supports correcting the date and diners. It does not infer cooking from menu approval.
- Existing normalized ingredient IDs and numeric quantities are reused. Migration adds ingredient form and optional substitution metadata. Non-equivalent forms, cuts, onion varieties, fresh/dried ingredients and raw/cooked ingredient identities remain separate.
- Groceries scale servings, consolidate compatible quantities, subtract confirmed compatible pantry quantities, and round only after consolidation. Exact consumption stays visible. Verified package-size rules, calculated package counts and manual purchase overrides are supported. No Trader Joe's package sizes are seeded or guessed. Fractional quantities display naturally.
- Family grocery requests keep the existing Shani confirmation and target-menu assignment. Shani can explicitly map a request to a canonical ingredient to consolidate it; unrelated products stay separate. Pending/declined requests cannot be added. Cooking requests contribute only when assigned a recipe and quantity. Explicit requested package quantities are preserved even when pantry stock exists.
- Existing linked same-dish leftovers scale one source batch once. Brisket tacos/bowls can also use a brisket source, add their transformation ingredients and omit the prepared-brisket purchase. The calculation uses a stated 2/3 cooked-weight yield: three original portions plus three taco portions require approximately 3 lb raw brisket in total.

## Migration

Schema migration **5** runs automatically through `initSchema` for both native SQLite and Cloudflare SQLite. It is additive and repeatable:

- New tables: `round_context`, `round_candidate_order`, `voter_progress`, `cooked_meals`, `purchase_rules`, `pantry_inventory`, `shopping_identity`.
- New `menu_days.leftover_recipe_id` column.
- New `recipe_ingredients.form` and `recipe_ingredients.substitutions` columns.
- `seasonalWeight` setting defaults to `0.6`.
- Missing recipe season tags are initialized without replacing personal recipe data. Existing rounds and votes are retained; new seasonal pools begin with newly opened rounds.

Back up the current SQLite database or use Cloudflare point-in-time recovery before rollout. Do not replace the household database, Worker identity, Durable Object binding/class or the `family` object name. No additional Wrangler class migration is required.

## Validation

- `npm test`: full unit and API regression suite, including real database/server restart and shared candidate-pool checks.
- `npm run build`: TypeScript check and production Vite build.
- `npm run test:e2e`: three browser workflows, including ten-YES stopping, reload, undo, early finish; existing mobile/desktop household, recipe option, request, menu and shopping workflows.
- `npm run test:worker`: full API acceptance suite in the local Cloudflare runtime, plus actual restart retaining household records.

All tests use disposable databases. They do not create fake records in the real household.

## Deployment

Production publication was not attempted: this environment has no configured Cloudflare deployment credentials and this checkout is not a connected Sites project.

1. Back up the existing database / confirm Durable Object recovery.
2. Review and commit these changes to the existing repository.
3. Run `npm run build` and `npm run cf:deploy` using the existing authenticated Cloudflare account, or use the repository's existing Cloudflare deployment workflow.
4. Retain the existing `SETUP_KEY`, Worker and household object configuration. Do not run first-time household setup again.
5. Schema 5 applies on startup/first request. Open a new voting round to use the seasonal pool. Verify the existing profiles, requests and history remain visible.

For Node hosting, build, deploy the same source and restart with the original persistent `DATABASE_PATH`; startup applies the same migration.

## Limits and review points

- Cooking history starts with explicit completed-meal records. Prior approved menus are not retroactively considered cooked.
- Current season defaults explicitly cover the requested fall/summer recipes; other existing recipes default to All seasons. There is no dedicated season-tag editor yet.
- The batch limit applies to the voting deck. The existing app bootstrap still loads the recipe library for its library and recipe-detail features; this update does not add network pagination of that library.
- Grocery approval still requires selecting the destination menu and confirming a grocery request's product/quantity. Approved unassigned requests remain visible in Family Requests until converted; they are not silently attached to an arbitrary week.
- Transformation leftovers currently support brisket tacos and brisket bowls. Other recipes support existing same-dish linked leftovers. The 2/3 brisket yield is an explicit planning assumption, not measured household yield; it is not yet editable in the UI.
- Substitution metadata is stored but not automatically chosen. Pantry has no ingredient-density guesses; incompatible stock units cannot be subtracted. Package sizes require Shani's confirmation.
- Existing household dietary rules remain in code. This update does not introduce a general dietary-profile editor.
- Mark as Cooked uses today's LA date and attending diner count in the UI; historical-date corrections are currently API-only. The button prevents duplicate day entries.
- Planner scoring is deterministic and heuristic; variety and effort are preferences, not a mathematical optimization guarantee.
