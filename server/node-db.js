import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { initSchema } from "./db.js";

export function openDatabase(
  filename = process.env.DATABASE_PATH ||
    resolve("data/dinner-democracy.sqlite"),
) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  return initSchema(db);
}
