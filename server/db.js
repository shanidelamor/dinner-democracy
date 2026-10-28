import { seasonTags } from "./voting.js";
import { createHash } from "node:crypto";
import { mergeCatalogRecipe } from "./catalog-updates.js";
import { recipes, defaultPantry, ingredientDefinitions } from "./recipes.js";

export function initSchema(db, catalog = recipes) {
  db.exec(`
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
  CREATE TABLE IF NOT EXISTS recipe_catalog_baselines(recipe_id TEXT PRIMARY KEY REFERENCES recipes(id),data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
  INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);`);
  db.exec(`
  CREATE TABLE IF NOT EXISTS round_context(round_id INTEGER PRIMARY KEY REFERENCES rounds(id),local_date TEXT NOT NULL,season TEXT NOT NULL,seasonal_weight REAL NOT NULL);
  CREATE TABLE IF NOT EXISTS round_candidate_order(round_id INTEGER REFERENCES rounds(id),recipe_id TEXT REFERENCES recipes(id),position INTEGER NOT NULL,PRIMARY KEY(round_id,recipe_id));
  CREATE TABLE IF NOT EXISTS voter_progress(round_id INTEGER REFERENCES rounds(id),user_id TEXT REFERENCES users(id),finished INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(round_id,user_id));
  CREATE TABLE IF NOT EXISTS cooked_meals(id INTEGER PRIMARY KEY,recipe_id TEXT NOT NULL REFERENCES recipes(id),cooked_date TEXT NOT NULL,diners REAL NOT NULL CHECK(diners>0),meal_plan_id INTEGER REFERENCES menus(id),menu_day_id INTEGER UNIQUE REFERENCES menu_days(id));
  CREATE TABLE IF NOT EXISTS shopping_identity(manual_id INTEGER PRIMARY KEY REFERENCES shopping_manual(id),ingredient_id TEXT NOT NULL REFERENCES ingredient_definitions(id));
  CREATE TABLE IF NOT EXISTS purchase_rules(ingredient_id TEXT PRIMARY KEY REFERENCES ingredient_definitions(id),unit TEXT NOT NULL,package_size REAL NOT NULL CHECK(package_size>0));
  CREATE TABLE IF NOT EXISTS pantry_inventory(ingredient_id TEXT PRIMARY KEY REFERENCES ingredient_definitions(id),quantity REAL NOT NULL CHECK(quantity>=0),unit TEXT NOT NULL);
  INSERT OR IGNORE INTO settings VALUES('seasonalWeight','0.6');
  INSERT OR IGNORE INTO schema_migrations(version) VALUES(5);`);
  const ingredientColumns=db.prepare("PRAGMA table_info(recipe_ingredients)").all();
  if(!ingredientColumns.some(c=>c.name==='form')) db.exec("ALTER TABLE recipe_ingredients ADD COLUMN form TEXT NOT NULL DEFAULT 'as_purchased'");
  if(!ingredientColumns.some(c=>c.name==='substitutions')) db.exec("ALTER TABLE recipe_ingredients ADD COLUMN substitutions TEXT NOT NULL DEFAULT '[]'");
  for(const row of db.prepare("SELECT id,data FROM recipes").all()) {
    const recipe=JSON.parse(row.data);
    if(!recipe.seasons) db.prepare("UPDATE recipes SET data=? WHERE id=?").run(JSON.stringify({...recipe,seasons:seasonTags({...recipe,id:row.id})}),row.id);
  }
  const columns = db.prepare("PRAGMA table_info(menu_days)").all();
  if (!columns.some(c=>c.name==="leftover_recipe_id")) db.exec("ALTER TABLE menu_days ADD COLUMN leftover_recipe_id TEXT REFERENCES recipes(id)");
  if (!columns.some((c) => c.name === "variation_id"))
    db.exec("ALTER TABLE menu_days ADD COLUMN variation_id TEXT");
  db.prepare(
    "INSERT OR IGNORE INTO schema_migrations(version) VALUES(2)",
  ).run();
  const seeded =
    db.prepare("SELECT count(*) n FROM recipes").get().n >= catalog.length &&
    db.prepare("SELECT count(*) n FROM recipe_ingredients").get().n > 0;
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        recipes: catalog,
        definitions: ingredientDefinitions,
        pantry: defaultPantry,
      }),
    )
    .digest("hex");
  if (
    seeded &&
    db.prepare("SELECT value FROM catalog_meta WHERE key='digest'").get()
      ?.value === digest
  )
    return db;
  const householdExists = !!db.prepare("SELECT count(*) n FROM users").get().n;
  transaction(db, () => {
    for (const [id, [name, section]] of Object.entries(ingredientDefinitions))
      db.prepare(
        "INSERT INTO ingredient_definitions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,section=excluded.section",
      ).run(id, name, section);
    for (const r of catalog) {
      const row = db
        .prepare("SELECT data,version FROM recipes WHERE id=?")
        .get(r.id);
      if (!row) {
        db.prepare("INSERT INTO recipes(id,data,version) VALUES(?,?,1)").run(
          r.id,
          JSON.stringify({...r,seasons:r.seasons||seasonTags(r)}),
        );
        saveIngredients(db, r.id, r.ingredients);
        db.prepare(
          "INSERT OR REPLACE INTO recipe_catalog_baselines VALUES(?,?)",
        ).run(r.id, JSON.stringify(r));
        continue;
      }
      const current = JSON.parse(row.data);
      const prior = db
        .prepare("SELECT data FROM recipe_catalog_baselines WHERE recipe_id=?")
        .get(r.id);
      const baseline = prior
        ? JSON.parse(prior.data)
        : !householdExists &&
            current.catalogRevision &&
            !/edited/i.test(current.source)
          ? current
          : undefined;
      const update = mergeCatalogRecipe(current, r, baseline);
      if (update) {
        db.prepare(
          "INSERT INTO recipe_versions(recipe_id,version,data,edited_by) VALUES(?,?,?,NULL)",
        ).run(r.id, row.version, row.data);
        const next = { ...update.recipe, version: row.version + 1 };
        db.prepare(
          "UPDATE recipes SET data=?,version=version+1 WHERE id=?",
        ).run(JSON.stringify(next), r.id);
        saveIngredients(db, r.id, next.ingredients);
        if (update.ingredientsChanged) {
          const affected = db
            .prepare(
              "SELECT menu_id FROM menu_days WHERE recipe_id=? UNION SELECT menu_id FROM tasks WHERE recipe_id=?",
            )
            .all(r.id, r.id);
          for (const m of affected) {
            db.prepare("UPDATE menus SET status='draft' WHERE id=?").run(
              m.menu_id,
            );
            db.prepare(
              "DELETE FROM shopping_state WHERE menu_id=? AND item_key NOT LIKE 'manual:%'",
            ).run(m.menu_id);
          }
        }
      } else if (
        !db
          .prepare("SELECT 1 FROM recipe_ingredients WHERE recipe_id=?")
          .get(r.id)
      )
        saveIngredients(db, r.id, JSON.parse(row.data).ingredients);
      db.prepare(
        "INSERT OR REPLACE INTO recipe_catalog_baselines VALUES(?,?)",
      ).run(r.id, JSON.stringify(r));
    }
    for (const id of defaultPantry)
      db.prepare(
        "INSERT OR IGNORE INTO pantry(ingredient_id,have) VALUES(?,0)",
      ).run(id);
    db.prepare(
      "INSERT OR IGNORE INTO settings(key,value) VALUES('tacoDay','3')",
    ).run();
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations(version) VALUES(3)",
    ).run();
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations(version) VALUES(4)",
    ).run();
    db.prepare(
      "INSERT INTO catalog_meta VALUES('digest',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(digest);
  });
  return db;
}
export function saveIngredients(db, id, ingredients) {
  db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id=?").run(id);
  ingredients.forEach((i, index) =>
    db
      .prepare(
        "INSERT INTO recipe_ingredients(recipe_id,ingredient_id,position,quantity,unit,note,form,substitutions) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(id, i.id, index, i.quantity, i.unit, i.note || "",i.form||"as_purchased",JSON.stringify(i.substitutions||[])),
  );
}
export const allRecipes = (db) => {
  const ingredients = db
    .prepare(
      "SELECT ri.recipe_id,ri.ingredient_id id,ri.quantity,ri.unit,ri.note,ri.form,ri.substitutions,d.name,d.section FROM recipe_ingredients ri JOIN ingredient_definitions d ON d.id=ri.ingredient_id ORDER BY ri.position",
    )
    .all();
  const managedPhoto = (path) =>
    /^\/images\/(recipes\/[a-z0-9-]+\.webp|(?:salmon|chicken|beef|lamb|vegetables|pork|cookies)\.png)$/.test(
      path || "",
    );
  return db
    .prepare("SELECT id,data,version FROM recipes")
    .all()
    .map((row) => {
      const data = JSON.parse(row.data),
        catalog = recipes.find((r) => r.id === row.id);
      return {
        ...data,
        seasons: data.seasons || seasonTags(data),
        version: row.version,
        ...(catalog && managedPhoto(data.image)
          ? { image: catalog.image, imageAlt: catalog.imageAlt }
          : {}),
        ...(data.variations
          ? {
              variations: data.variations.map((v) => {
                const updated = catalog?.variations?.find(
                  (option) => option.id === v.id,
                );
                return {
                  ...v,
                  ...(updated && managedPhoto(v.image)
                    ? { image: updated.image }
                    : {}),
                };
              }),
            }
          : {}),
        ...(data.catalogConflicts?.length ? { catalogProposal: catalog } : {}),
        ingredients: ingredients
          .filter((i) => i.recipe_id === row.id)
          .map(({ recipe_id, ...i }) => ({...i,substitutions:JSON.parse(i.substitutions||"[]")})),
      };
    });
};
export const transaction = (db, fn) => {
  if (db.transactionSync) return db.transactionSync(fn);
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
