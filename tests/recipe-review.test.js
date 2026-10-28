import { createApp } from "../server/app.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { recipes, ingredientDefinitions } from "../server/recipes.js";
import { catalogV1 } from "../server/catalog-v1-baseline.js";
import { openDatabase } from "../server/node-db.js";
import { allRecipes, initSchema, saveIngredients } from "../server/db.js";
import { resolveRecipe } from "../server/recipe-options.js";
import { shoppingList, validateMenu } from "../server/domain.js";
const get = (id) => recipes.find((r) => r.id === id);
const ids = (r) => r.ingredients.map((i) => i.id);
const menu = { id: 1, status: "approved" };
const day = (recipeId, variationId = null, extra = {}) => ({
  id: 1,
  menu_id: 1,
  date: "2030-03-04",
  recipe_id: recipeId,
  variation_id: variationId,
  kind: "cook",
  portions: 3,
  attendees: '["shani","james","xander"]',
  leftover_of: null,
  ...extra,
});
const groceries = (recipeId, variationId, days) =>
  shoppingList({
    menu,
    days: days || [day(recipeId, variationId)],
    tasks: [],
    recipes,
  });

test("family corrections change actual ingredients, cuts, sides and cooking instructions", () => {
  assert.ok(
    ids(resolveRecipe(get("thai-beef"), "shaved-beef")).includes("shavedBeef"),
  );
  assert.ok(ids(get("poke")).includes("pokeSalmon"));
  assert.ok(!ids(get("poke")).includes("tunaFish"));
  for (const id of ["vodka-rigatoni", "mustard-pork"]) {
    assert.ok(ids(get(id)).includes("cream"));
    assert.ok(!ids(get(id)).includes("coconutCream"));
    assert.equal(get(id).dairy, true);
  }
  assert.ok(ids(get("schnitzel")).includes("arugula"));
  for (const ingredient of ["hummus", "redOnion"])
    assert.ok(ids(get("lamb-burgers")).includes(ingredient));
  assert.ok(!ids(get("lamb-burgers")).includes("potato"));
  for (const ingredient of ["carrot", "goat", "tahini"])
    assert.ok(ids(get("harissa-lamb")).includes(ingredient));
  assert.ok(ids(get("harissa-chicken")).includes("boneThigh"));
  assert.ok(ids(get("harissa-chicken")).includes("cauliflower"));
  assert.ok(
    !ids(get("harissa-chicken")).some((id) =>
      ["whiteBeans", "goat", "tahini"].includes(id),
    ),
  );
  assert.equal(get("shepherds-pie").protein, "Beef");
  assert.ok(ids(get("shepherds-pie")).includes("groundBeef"));
  assert.ok(!ids(get("shepherds-pie")).includes("lambGround"));
  for (const id of ["mushroom", "shiitake", "oysterMushroom"])
    assert.ok(ids(get("mushroom-pasta")).includes(id));
  assert.ok(get("mushroom-pasta").steps.join(" ").includes("shiitake"));
  for (const r of recipes) {
    assert.ok(r.description.length > 35);
    assert.ok(
      !r.description.includes("A generous, gluten-free dinner for the family"),
    );
  }
});
test("each rib choice shops only its own seasoning while retaining every vegetable side", () => {
  const bbq = groceries("grilled-ribs", "barbecue"),
    plain = groceries("grilled-ribs", "garlic-salt"),
    asian = groceries("grilled-ribs", "asian");
  assert.ok(bbq.some((i) => i.ingredientId === "bbq"));
  assert.ok(!bbq.some((i) => i.ingredientId === "gochujang"));
  assert.equal(plain.find((i) => i.ingredientId === "garlic").quantity, 6);
  assert.ok(
    !plain.some((i) =>
      ["bbq", "gochujang", "fishSauce", "aminos", "sugar", "paprika"].includes(
        i.ingredientId,
      ),
    ),
  );
  assert.equal(asian.find((i) => i.ingredientId === "gochujang").quantity, 15);
  assert.equal(asian.find((i) => i.ingredientId === "fishSauce").quantity, 15);
  assert.equal(asian.find((i) => i.ingredientId === "aminos").quantity, 30);
  assert.ok(!asian.some((i) => i.ingredientId === "bbq"));
  for (const list of [bbq, plain, asian])
    for (const id of ["corn", "cabbage", "carrot"])
      assert.ok(list.some((i) => i.ingredientId === id));
  assert.throws(() => resolveRecipe(get("grilled-ribs"), "unknown"), /option/);
});
test("cream options keep dairy flags and scaled shopping quantities consistent", () => {
  for (const id of ["enchiladas", "mushroom-chicken"]) {
    const regular = resolveRecipe(get(id), "regular-cream");
    assert.equal(regular.dairy, true);
    const list = groceries(id, "regular-cream");
    assert.equal(list.find((i) => i.ingredientId === "cream").quantity, 120);
    assert.ok(
      !list.some((i) => ["coconutCream", "sourCream"].includes(i.ingredientId)),
    );
  }
  assert.equal(
    resolveRecipe(get("mushroom-chicken"), "coconut-cream").dairy,
    false,
  );
  const enchiladas = groceries("enchiladas", "sour-cream");
  assert.equal(
    enchiladas.find((i) => i.ingredientId === "sourCream").quantity,
    120,
  );
  for (const id of ["lettuce", "redOnion", "cilantro"])
    assert.ok(enchiladas.some((i) => i.ingredientId === id));
});
test("reserved rib leftovers share one selected sauce and one correctly sized batch", () => {
  const source = day("grilled-ribs", "asian");
  const leftover = day("grilled-ribs", "asian", {
    id: 2,
    date: "2030-03-05",
    kind: "leftover",
    leftover_of: 1,
  });
  validateMenu([source, leftover], recipes);
  const list = groceries("grilled-ribs", "asian", [source, leftover]);
  assert.equal(list.find((i) => i.ingredientId === "ribs").quantity, 96);
  assert.equal(list.find((i) => i.ingredientId === "gochujang").quantity, 30);
  assert.equal(list.find((i) => i.ingredientId === "corn").quantity, 6);
  assert.throws(
    () =>
      validateMenu(
        [source, { ...leftover, variation_id: "barbecue" }],
        recipes,
      ),
    /matching cooked dinner/,
  );
});
test("catalog migration preserves household records and personal edits and is repeatable", () => {
  const db = openDatabase(":memory:");
  try {
    db.prepare("DELETE FROM recipe_ingredients").run();
    for (const r of Object.values(catalogV1)) {
      db.prepare("UPDATE recipes SET data=?,version=1 WHERE id=?").run(
        JSON.stringify(r),
        r.id,
      );
      saveIngredients(db, r.id, r.ingredients);
    }
    db.exec(
      "ALTER TABLE menu_days DROP COLUMN variation_id; DELETE FROM schema_migrations WHERE version>1; DELETE FROM recipe_catalog_baselines; DELETE FROM catalog_meta;",
    );
    for (const [id, name, role] of [
      ["shani", "Shani", "admin"],
      ["james", "James", "member"],
    ])
      db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
        id,
        name,
        role,
        "synthetic-test-hash",
      );
    db.prepare(
      "INSERT INTO rounds(id,title) VALUES(1,'Old household round')",
    ).run();
    db.prepare("INSERT INTO round_recipes VALUES(1,'lamb-burgers')").run();
    db.prepare(
      "INSERT INTO votes VALUES(1,'james','lamb-burgers','yes',CURRENT_TIMESTAMP)",
    ).run();
    db.prepare(
      "INSERT INTO requests(user_id,message,category,quantity,unit) VALUES('james','2 boxes of soda','grocery',2,'box')",
    ).run();
    db.prepare(
      "INSERT INTO menus(id,title,start_date,days,status,round_id) VALUES(1,'Old menu','2030-03-04',7,'approved',1)",
    ).run();
    db.prepare(
      "INSERT INTO menu_days(menu_id,date,recipe_id,kind,portions,attendees) VALUES(1,'2030-03-04','lamb-burgers','cook',3,'[\"shani\",\"james\"]')",
    ).run();
    db.prepare("UPDATE pantry SET have=1 WHERE ingredient_id='oil'").run();
    db.prepare("UPDATE settings SET value='4' WHERE key='tacoDay'").run();
    const personal = {
      ...catalogV1["lamb-burgers"],
      notes: "My personal cooking note",
      description: "Our own handwritten description",
      source: "Shani’s edited version",
      version: 2,
    };
    db.prepare(
      "UPDATE recipes SET data=?,version=2 WHERE id='lamb-burgers'",
    ).run(JSON.stringify(personal));
    const archived = { ...catalogV1["chicken-katsu"], archived: true };
    db.prepare("UPDATE recipes SET data=? WHERE id='chicken-katsu'").run(
      JSON.stringify(archived),
    );
    initSchema(db);
    const library = allRecipes(db),
      burgers = library.find((r) => r.id === "lamb-burgers");
    assert.ok(ids(burgers).includes("hummus"));
    assert.ok(!ids(burgers).includes("potato"));
    assert.equal(burgers.notes, "My personal cooking note");
    assert.equal(burgers.description, "Our own handwritten description");
    assert.ok(burgers.catalogConflicts.includes("description"));
    assert.ok(burgers.catalogProposal.description.includes("hummus"));
    assert.equal(library.find((r) => r.id === "chicken-katsu").archived, true);
    assert.equal(db.prepare("SELECT count(*) n FROM users").get().n, 2);
    assert.equal(db.prepare("SELECT choice FROM votes").get().choice, "yes");
    assert.equal(db.prepare("SELECT quantity FROM requests").get().quantity, 2);
    assert.equal(db.prepare("SELECT status FROM menus").get().status, "draft");
    assert.equal(
      db.prepare("SELECT have FROM pantry WHERE ingredient_id='oil'").get()
        .have,
      1,
    );
    assert.equal(
      db.prepare("SELECT value FROM settings WHERE key='tacoDay'").get().value,
      "4",
    );
    const count = db.prepare("SELECT count(*) n FROM recipe_versions").get().n;
    assert.ok(
      db
        .prepare(
          "SELECT data FROM recipe_versions WHERE recipe_id='lamb-burgers' AND version=2",
        )
        .get()
        .data.includes("My personal cooking note"),
    );
    initSchema(db);
    assert.equal(
      db.prepare("SELECT count(*) n FROM recipe_versions").get().n,
      count,
    );
    assert.ok(
      db
        .prepare("PRAGMA table_info(menu_days)")
        .all()
        .some((c) => c.name === "variation_id"),
    );
    const nextCatalog = structuredClone(recipes);
    nextCatalog.find((r) => r.id === "vodka-rigatoni").notes +=
      " A later catalog clarification.";
    initSchema(db, nextCatalog);
    assert.ok(
      JSON.parse(
        db.prepare("SELECT data FROM recipes WHERE id='vodka-rigatoni'").get()
          .data,
      ).notes.includes("later catalog clarification"),
    );
    assert.equal(
      JSON.parse(
        db.prepare("SELECT data FROM recipes WHERE id='lamb-burgers'").get()
          .data,
      ).description,
      "Our own handwritten description",
    );
    const nextCount = db
      .prepare("SELECT count(*) n FROM recipe_versions")
      .get().n;
    initSchema(db, nextCatalog);
    assert.equal(
      db.prepare("SELECT count(*) n FROM recipe_versions").get().n,
      nextCount,
    );
  } finally {
    db.close();
  }
});
test("recipe photography uses a separate, compact local image for every library entry", () => {
  const hashes = new Set(),
    paths = new Set();
  for (const r of recipes) {
    const path = "public" + r.image;
    assert.ok(existsSync(path), `Missing photo for ${r.title}`);
    assert.ok(statSync(path).size < 700000, `Photo too large: ${r.title}`);
    paths.add(path);
    hashes.add(createHash("sha256").update(readFileSync(path)).digest("hex"));
  }
  assert.equal(paths.size, 51);
  assert.equal(hashes.size, 51);
  for (const v of get("grilled-ribs").variations) {
    assert.ok(existsSync("public" + v.image));
  }
});

test("only Shani can apply reviewed fields and the personal version remains in history", async () => {
  const db = openDatabase(":memory:");
  let server;
  try {
    for (const [id, name, role, token] of [
      ["shani", "Shani", "admin", "review-admin-fixture"],
      ["james", "James", "member", "review-member-fixture"],
    ]) {
      db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
        id,
        name,
        role,
        "synthetic-test-hash",
      );
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        createHash("sha256").update(token).digest("hex"),
        id,
        Date.now() + 60000,
      );
    }
    const current = {
      ...get("lamb-burgers"),
      description: "Personal description to preserve in history",
      notes: "Keep this personal note",
      catalogConflicts: ["description"],
      source: "Shani’s edited version",
      version: 2,
    };
    db.prepare(
      "UPDATE recipes SET data=?,version=2 WHERE id='lamb-burgers'",
    ).run(JSON.stringify(current));
    server = createApp(db).listen(0, "127.0.0.1");
    await new Promise((r) => server.on("listening", r));
    const url = `http://127.0.0.1:${server.address().port}/api/recipes/lamb-burgers/catalog-review`;
    const apply = (token) =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `dd_session=${token}`,
        },
        body: "{}",
      });
    assert.equal((await apply("review-member-fixture")).status, 403);
    assert.equal((await apply("review-admin-fixture")).status, 200);
    const updated = allRecipes(db).find((r) => r.id === "lamb-burgers");
    assert.equal(updated.description, get("lamb-burgers").description);
    assert.equal(updated.notes, "Keep this personal note");
    assert.deepEqual(updated.catalogConflicts, []);
    assert.ok(
      db
        .prepare(
          "SELECT data FROM recipe_versions WHERE recipe_id='lamb-burgers' AND version=2",
        )
        .get()
        .data.includes("Personal description to preserve in history"),
    );
  } finally {
    if (server) await new Promise((r) => server.close(r));
    db.close();
  }
});
