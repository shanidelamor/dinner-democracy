import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { recipes, defaultPantry, ingredientDefinitions } from "./recipes.js";

export function openDatabase(
  filename = process.env.DATABASE_PATH ||
    resolve("data/dinner-democracy.sqlite"),
) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','member')),password_hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS recipes(id TEXT PRIMARY KEY,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS ingredient_definitions(id TEXT PRIMARY KEY,name TEXT NOT NULL,section TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS recipe_ingredients(recipe_id TEXT REFERENCES recipes(id),ingredient_id TEXT REFERENCES ingredient_definitions(id),position INTEGER NOT NULL,quantity REAL NOT NULL CHECK(quantity>0),unit TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',PRIMARY KEY(recipe_id,position));
  CREATE TABLE IF NOT EXISTS recipe_versions(id INTEGER PRIMARY KEY,recipe_id TEXT REFERENCES recipes(id),version INTEGER NOT NULL,data TEXT NOT NULL,edited_by TEXT REFERENCES users(id),created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS favorites(user_id TEXT REFERENCES users(id),recipe_id TEXT REFERENCES recipes(id),PRIMARY KEY(user_id,recipe_id));
  CREATE TABLE IF NOT EXISTS rounds(id INTEGER PRIMARY KEY,title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS round_recipes(round_id INTEGER REFERENCES rounds(id),recipe_id TEXT REFERENCES recipes(id),PRIMARY KEY(round_id,recipe_id));
  CREATE TABLE IF NOT EXISTS votes(round_id INTEGER REFERENCES rounds(id),user_id TEXT REFERENCES users(id),recipe_id TEXT REFERENCES recipes(id),choice TEXT NOT NULL CHECK(choice IN ('yes','no','maybe')),updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(round_id,user_id,recipe_id));
  CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY,user_id TEXT REFERENCES users(id),message TEXT NOT NULL,category TEXT NOT NULL CHECK(category IN ('grocery','cooking')),quantity REAL,unit TEXT,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined','completed')),created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS menus(id INTEGER PRIMARY KEY,title TEXT NOT NULL,start_date TEXT NOT NULL,days INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved')),round_id INTEGER REFERENCES rounds(id),created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS menu_days(id INTEGER PRIMARY KEY,menu_id INTEGER REFERENCES menus(id) ON DELETE CASCADE,date TEXT NOT NULL,recipe_id TEXT REFERENCES recipes(id),kind TEXT NOT NULL CHECK(kind IN ('cook','leftover','out')),portions REAL NOT NULL,attendees TEXT NOT NULL,locked INTEGER NOT NULL DEFAULT 0,leftover_of INTEGER REFERENCES menu_days(id),reason TEXT NOT NULL DEFAULT '',UNIQUE(menu_id,date));
  CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY,menu_id INTEGER REFERENCES menus(id),recipe_id TEXT REFERENCES recipes(id),request_id INTEGER UNIQUE REFERENCES requests(id),date TEXT NOT NULL,portions REAL NOT NULL);
  CREATE TABLE IF NOT EXISTS pantry(ingredient_id TEXT PRIMARY KEY,have INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS shopping_manual(id INTEGER PRIMARY KEY,menu_id INTEGER NOT NULL REFERENCES menus(id),name TEXT NOT NULL,quantity REAL NOT NULL,unit TEXT NOT NULL,section TEXT NOT NULL,request_id INTEGER UNIQUE REFERENCES requests(id),active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS shopping_state(menu_id INTEGER REFERENCES menus(id),item_key TEXT NOT NULL,checked INTEGER NOT NULL DEFAULT 0,have INTEGER NOT NULL DEFAULT 0,purchase_quantity REAL,PRIMARY KEY(menu_id,item_key));
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
  INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);`);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO recipes(id,data,version) VALUES(?,?,1)",
  );
  for (const [id, [name, section]] of Object.entries(ingredientDefinitions))
    db.prepare(
      "INSERT OR IGNORE INTO ingredient_definitions VALUES(?,?,?)",
    ).run(id, name, section);
  for (const r of recipes) insert.run(r.id, JSON.stringify(r));
  for (const row of db.prepare("SELECT id,data FROM recipes").all()) {
    if (
      !db
        .prepare("SELECT 1 FROM recipe_ingredients WHERE recipe_id=?")
        .get(row.id)
    )
      saveIngredients(db, row.id, JSON.parse(row.data).ingredients);
  }
  for (const id of defaultPantry)
    db.prepare(
      "INSERT OR IGNORE INTO pantry(ingredient_id,have) VALUES(?,0)",
    ).run(id);
  db.prepare(
    "INSERT OR IGNORE INTO settings(key,value) VALUES('tacoDay','3')",
  ).run();
  return db;
}
export function saveIngredients(db, id, ingredients) {
  db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id=?").run(id);
  ingredients.forEach((i, index) =>
    db
      .prepare(
        "INSERT INTO recipe_ingredients(recipe_id,ingredient_id,position,quantity,unit,note) VALUES(?,?,?,?,?,?)",
      )
      .run(id, i.id, index, i.quantity, i.unit, i.note || ""),
  );
}
export const allRecipes = (db) => {
  const ingredients = db
    .prepare(
      "SELECT ri.recipe_id,ri.ingredient_id id,ri.quantity,ri.unit,ri.note,d.name,d.section FROM recipe_ingredients ri JOIN ingredient_definitions d ON d.id=ri.ingredient_id ORDER BY ri.position",
    )
    .all();
  return db
    .prepare("SELECT id,data,version FROM recipes")
    .all()
    .map((r) => ({
      ...JSON.parse(r.data),
      version: r.version,
      ingredients: ingredients
        .filter((i) => i.recipe_id === r.id)
        .map(({ recipe_id, ...i }) => i),
    }));
};
export const transaction = (db, fn) => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};
