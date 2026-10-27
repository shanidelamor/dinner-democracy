import { existsSync } from 'node:fs';
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 90000,
  expect: { timeout: 10000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3101",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node server/index.js",
    url: "http://127.0.0.1:3101/api/health",
    env: {
      PORT: "3101",
      NODE_ENV: "test",
      DATABASE_PATH: `/tmp/dinner-democracy-browser-${process.pid}.sqlite`,
    },
    reuseExistingServer: false,
  },
});
