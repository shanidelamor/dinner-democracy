import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
const db = openDatabase();
const port = Number(process.env.PORT || 3001);
const server = createApp(db, {
  production: process.env.NODE_ENV === "production",
}).listen(port, "0.0.0.0", () =>
  console.log(
    `Dinner Democracy listening on port ${port}. Shared SQLite storage connected.`,
  ),
);
const stop = () =>
  server.close(() => {
    db.close();
    process.exit(0);
  });
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
