# Hosting Dinner Democracy for three phones

This workspace is a development environment. Running a server here does **not** publish an internet-accessible family app. No hosting credentials were supplied and no public deployment has been made.

## Recommended: one Render web service with a persistent disk

1. Commit/review the source in your GitHub repository and push it when you are ready.
2. In your Render account, create a Blueprint from the repository using `render.yaml`. It describes one paid Starter Docker web service and a 1 GB persistent disk at `/app/data`. Check Render’s current pricing before deploying.
3. Render generates a private `SETUP_KEY` environment variable. Open the service’s environment settings to obtain that key securely; do not paste it in chat or commit it.
4. Deploy. Render provides the HTTPS application address. Check `/api/health` returns `{"status":"ok","storage":"sqlite"}`.
5. Open the HTTPS app address, supply the setup key, and choose the three profile passwords. The setup endpoint refuses reinitialization once users exist.
6. Share the HTTPS address with James and Xander; send each person only their own password privately. Each uses the appropriate profile on their phone. No installation is required.
7. Run the physical-device checks in `ACCEPTANCE.md`. Keep the service and its persistent disk; a throwaway filesystem will lose data on redeploy.

The Render Blueprint is provided but was not deployed or tested against a Render account in this environment. Use **one instance** with this SQLite architecture. Multiple independent replicas or serverless request handlers need a shared managed SQL database adaptation.

## Alternative: any Docker host with HTTPS and a persistent volume

```sh
docker build -t dinner-democracy .
# Set SETUP_KEY privately in your shell or secret manager, then pass its name only.
docker run -d --name dinner-democracy --restart unless-stopped \
  -p 3001:3001 -e SETUP_KEY \
  -v dinner-democracy-data:/app/data dinner-democracy
```

Terminate HTTPS at the host/reverse proxy. The app trusts one proxy hop and uses Secure, HttpOnly, SameSite=Lax session cookies in production; plain HTTP production logins will not work. Preserve the original Host and Origin and forward requests to port 3001. The Docker image runs as the unprivileged `node` user; ensure the persistent data path is writable by UID 1000. The Docker image was built successfully in this workspace. See `ACCEPTANCE.md` for the production-container smoke-check result.

## Environment variables

| Name | Purpose |
| --- | --- |
| `NODE_ENV=production` | Secure cookies, production headers, protected first setup |
| `PORT` | HTTP listen port; default 3001, all interfaces |
| `DATABASE_PATH` | Persistent SQLite path; Docker defaults to `/app/data/dinner-democracy.sqlite` |
| `SETUP_KEY` | Private first-setup authorization, required in production |

For local development, optionally put these settings in an ignored `.env`, and start Node using `node --env-file=.env server/index.js`. No third-party API credential is required. Generated illustrative food images and fonts are local, so application use requires no third-party image service.

## Backups and upgrades

Stop writes and use SQLite’s backup API or the CLI `.backup` command for a consistent backup. Copying only a live `.sqlite` file while its WAL is active is unsafe. Keep encrypted backups outside the service and verify restoration on a separate database. Recipes, profile password hashes, session hashes, requests and voting history are all household data.

Before deploying an upgrade, back up the database. Current startup schema creation and recipe seeding are idempotent and do not reset data; future schema changes should add explicit numbered migrations. Do not delete the database to fix an upgrade problem. For a deployment transfer, copy the database consistently and update `DATABASE_PATH`; keep the hostname stable where practical, and sign in again if needed.

## Boundaries of the first version

- This is a single trusted household, not a multi-household SaaS. Members have separate passwords and own-request restrictions; Shani has admin privileges.
- Shopping quantities describe ingredients to consume, not live Trader Joe’s prices or guaranteed package availability. Adjust purchase amounts for the products on the shelf.
- No push/email notifications or external recipe-conversation import: request statuses appear in the app, and household state refreshes every 15 seconds and on window focus.
- The ingredient catalog has canonical products and cuts. New recipes can use that catalog; adding entirely new ingredient definitions currently requires a catalog code update.
- Steps in cooking mode are current-screen checkmarks, while recipes, votes, menus, requests, pantry and shopping checkboxes persist centrally.
- Cooking times, portions and reconstructed recipes need Shani’s kitchen review. Raw poke requires supplier-confirmed safe handling; choose cooked fish when uncertain.

## Cloud build trust configuration

This onboarding environment uses an outbound package proxy with an additional trusted CA. Its container builder needed the proxy hostname to be resolved and that public trust certificate passed through the optional `npm_ca` build secret. The certificate is mounted only while installing packages and is not copied into the final image. TLS verification and lockfile integrity checks remain enabled. Ordinary Docker hosts and Render can use their standard trusted network without supplying this optional certificate. Do not disable TLS verification to work around a corporate or cloud proxy.
