# Validation evidence

The current source passes `npm test` (**19 passing tests/subtests; zero failures/skips**) and `npm run build` (TypeScript + Vite). A Playwright Chromium test passes the complete family workflow using **three independent browser contexts**, including two phone-size viewports. These are simulated devices, not physical phone testing.

Test accounts and votes live only in disposable test databases. The real workspace database is left at first-run setup, with no invented household passwords or votes.

| Requested workflow | Evidence |
| --- | --- |
| Shani opens a voting round | Browser UI and API test |
| Xander votes separately | Independent mobile-sized browser context and own cookie session |
| James votes independently | Third browser context and own cookie session |
| Votes survive refresh/reopening | Browser reload; API test stops/reopens server and SQLite file, reuses sessions |
| Correct combined results | Browser checks individual YES counts; API verifies three YES votes for one recipe |
| Editable weekly plan | Browser generates 7 days and changes portions; API tests locks, regeneration and approval |
| Servings change ingredients | Exact domain assertions on chicken, rice, sauce and broccoli; browser recipe adjuster |
| Vegetable sides appear in groceries | Browser checks broccoli; domain tests assert exact scaled vegetable quantities |
| Quantities consolidate correctly | Compatible weight/volume arithmetic and distinct-cut assertions; linked leftover batch counted once |
| Xander asks for two boxes of soda | Multi-line API request and browser request form; parsed quantity preserved |
| Shani approves and adds two boxes | Browser explicitly confirms shopping conversion; API retries conversion to verify idempotency |
| James asks for cookies; Shani schedules | Separate browser sessions; baking ingredients appear only after plan approval |
| Shopping checks persist | Browser checks Soda and reloads; API verifies checkbox after server/database restart |
| Printable menu and groceries | Chromium prints fridge-menu, 14-day-menu and shopping PDFs; CSS checks preserve vegetable text |
| New weeks preserve history | Browser reselects prior round; API asserts old votes survive opening a new round |

Additional checks cover unauthenticated access, member/admin restrictions, other members’ request-edit denial, cross-origin mutation denial, invalid calendar dates, James/seafood conflicts, closed-round vote rejection, recipe edit history, new recipe creation/archival, missing-vegetable rejection, stale grocery-check reset after recipe changes, 14-day generation and linked leftover safety.

Artifacts are written under `test-results/family-three-independent-f-8fac1-the-core-household-workflow/` by the current browser run: `home-desktop.png`, `home-mobile.png`, `vote-mobile.png`, `fridge-menu.pdf`, `fridge-menu-14-days.pdf`, and `shopping-list.pdf`. This directory is ignored by Git and regenerated on each test run. Locally served food photos were verified to load; they do not require external image-host access.

The actual development server was started using `npm run dev`. The frontend, proxied status/health endpoints, SQLite health response and local salmon image returned HTTP 200. Frozen dependency reinstall (`npm ci`) and rebuild were exercised successfully. Reusable `install_script` and `start_skill` fields were saved to the cloud environment draft; saving them does not publish the environment or host the application publicly.

The 7-day menu with a baking task and the 14-day fridge menu each printed on **two landscape A4 pages** in Chromium. Main meal descriptions use 12-point print text. The grocery list groups items by store section and excludes checked/already-have items when printing.

The production Docker image also built successfully. `tests/docker-smoke.js` launched it with an isolated persistent volume and a randomly generated setup key, verified missing-key rejection, Secure/HttpOnly cookie flags, the built frontend and local image, and preserved a vote/session across container restart. The test then removed only its own synthetic container and volume. No HTTPS browser or external hosting deployment is implied by this check.

## Still needs user/device validation

- Deploy the app to a single HTTPS service with a persistent disk using `DEPLOYMENT.md`; no public hosting deployment was performed.
- On real phones, sign in separately as Shani, James and Xander. Cast different votes and confirm results on Shani’s device, after both refresh and closing/reopening the browser.
- Check touch swipes, installed-browser behavior, landscape/portrait layouts, a physical printer, and wake-lock support. Browser tests exercise voting buttons, responsive layouts and generated PDFs; they do not prove all touch hardware or printer behavior.
- Review recipe reconstructions, allergen/GF product labels, appropriate food handling, ingredient availability, package sizes and generous serving yields in your kitchen.
- Verify the chosen host’s disk survives redeployment and test restoration from a consistent backup. A restart of the local API/database has been tested; no external host’s persistence is claimed.
- GitHub Actions configuration is included but has not run on GitHub from this workspace.
