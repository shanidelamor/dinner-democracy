import { DurableObject } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import { initSchema } from "./db.js";
import { createApp } from "./app.js";
import { wrapDurableSql } from "./do-sql.js";

const PORT = 8080;

// One Durable Object holds the whole household: SQLite database + the app.
export class Household extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const db = wrapDurableSql(ctx.storage);
    ctx.blockConcurrencyWhile(async () => {
      initSchema(db);
    });
    createApp(db, {
      production: true,
      setupKey: env.SETUP_KEY,
      staticDir: "/nonexistent",
      clientKey: (req) => req.get("cf-connecting-ip"),
    }).listen(PORT);
    this.handler = httpServerHandler({ port: PORT });
  }
  fetch(request) {
    return this.handler.fetch(request, this.env, this.ctx);
  }
}

// Static pages/images are served by Cloudflare; only /api/* reaches this code.
export default {
  fetch(request, env) {
    const stub = env.HOUSEHOLD.get(env.HOUSEHOLD.idFromName("family"));
    return stub.fetch(request);
  },
};
