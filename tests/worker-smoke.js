// Exercises Cloudflare's real local runtime with a disposable household and SQL store.
// It never logs into an account, deploys remotely, or touches the production database.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import assert from "node:assert/strict";
const temp = mkdtempSync(join(tmpdir(), "dinner-worker-check-"));
const key = randomBytes(24).toString("hex");
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const base = `http://127.0.0.1:${port}`;
let child,
  logs = "";
const env = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  CLOUDFLARE_SEND_METRICS: "false",
  XDG_CONFIG_HOME: join(temp, "config"),
};
async function start() {
  logs = "";
  child = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--local",
      "--port",
      String(port),
      "--inspector-port",
      "0",
      "--persist-to",
      join(temp, "storage"),
      "--var",
      `SETUP_KEY:${key}`,
    ],
    { env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const append = (b) => {
    logs = (logs + b.toString()).slice(-12000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw Error(
        "Cloudflare local runtime exited early. " +
          logs.replaceAll(key, "[test key]"),
      );
    try {
      const r = await fetch(base + "/api/health");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw Error(
    "Cloudflare local runtime did not become ready. " +
      logs.replaceAll(key, "[test key]"),
  );
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exiting = once(child, "exit");
  try {
    process.kill(-child.pid, "SIGINT");
  } catch {}
  let timer;
  await Promise.race([
    exiting,
    new Promise((r) => (timer = setTimeout(r, 5000))),
  ]);
  clearTimeout(timer);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
    await exiting;
  }
}
const call = async (path, method = "GET", body, cookie = "") => {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(r.status, 200, `${method} ${path} failed`);
  return {
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
};
try {
  await start();
  const tests = spawn(process.execPath, ["--test", "tests/api.test.js"], {
    env: { ...env, TEST_BASE_URL: base, TEST_SETUP_KEY: key },
    stdio: "inherit",
  });
  const [exitCode] = await once(tests, "exit");
  assert.equal(exitCode, 0, "Cloudflare API acceptance suite failed");
  const auth = await call("/login", "POST", {
    userId: "shani",
    password: "test-admin-password",
  });
  const before = (await call("/state", "GET", undefined, auth.cookie)).data;
  await stop();
  await start();
  const after = (await call("/state", "GET", undefined, auth.cookie)).data;
  for (const field of [
    "users",
    "votes",
    "requests",
    "menus",
    "shoppingLists",
    "pantry",
  ])
    assert.deepEqual(
      after[field],
      before[field],
      `${field} changed after the Durable Object runtime restarted`,
    );
  assert.equal(after.user.id, "shani");
  console.log(
    "Cloudflare runtime passed: full API workflow plus actual restart with preserved profiles, sessions, votes, requests, menus, pantry and shopping state.",
  );
} finally {
  await stop();
  rmSync(temp, { recursive: true, force: true });
}
