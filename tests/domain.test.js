import test from "node:test";
import assert from "node:assert/strict";
import { recipes, ingredientDefinitions } from "../server/recipes.js";
import {
  safeFor,
  shoppingList,
  generateDays,
  validateMenu,
  parseQuantity,
} from "../server/domain.js";
const recipe = recipes.find((r) => r.id === "sticky-chicken");
const menu = { id: 1, status: "approved" };
const day = (id, date, kind = "cook", portions = 3, leftover_of = null) => ({
  id,
  date,
  kind,
  portions,
  leftover_of,
  recipe_id: recipe.id,
  attendees: '["shani","james","xander"]',
});
test("inventory preserves source uncertainty, household rules and categories", () => {
  assert.equal(recipes.filter((r) => r.category === "Dinner").length, 40); // 41 inventory entries includes one standalone side.
  assert.equal(recipes.filter((r) => r.favorite).length, 2);
  assert.equal(
    recipes.filter((r) => r.tags.includes("New for fall")).length,
    10,
  );
  for (const r of recipes.filter((r) => !r.archived)) {
    assert.ok(r.ingredients.length > 0 && r.steps.length > 0);
    assert.ok(
      r.sourceNote.includes("propos") ||
        r.sourceNote.includes("Quantities") ||
        r.sourceNote.includes("original"),
    );
    for (const ing of r.ingredients) {
      assert.ok(ing.quantity > 0);
      assert.ok(ingredientDefinitions[ing.id]);
    }
    if (r.category === "Dinner") {
      assert.ok(r.vegetables);
      assert.ok(r.glutenFree);
      assert.ok(
        !r.ingredients.some((i) =>
          /bell pepper|sausage/i.test(i.name.replace("no bell pepper", "")),
        ),
      );
    }
  }
  assert.ok(!recipes.some((r) => /stroganoff|moules/i.test(r.title)));
  assert.equal(recipes.find((r) => r.id === "shepherds-pie").protein, "Beef");
  assert.equal(
    recipes.find((r) => r.id === "brown-butter-cookies").category,
    "Baking",
  );
});
test("servings scale protein and vegetable sides, weights and volumes consolidate", () => {
  const list = shoppingList({
    menu,
    days: [day(1, "2030-01-01", "cook", 6), day(2, "2030-01-03")],
    tasks: [],
    recipes,
  });
  assert.equal(list.find((i) => i.ingredientId === "thigh").quantity, 72); // 4.5 lb across 9 portions
  assert.equal(list.find((i) => i.ingredientId === "broccoli").quantity, 48);
  assert.equal(list.find((i) => i.ingredientId === "tamari").quantity, 135); // 9 tbsp
});
test("reserved leftover portions grow one source batch without double counting", () => {
  const list = shoppingList({
    menu,
    days: [day(1, "2030-01-01"), day(2, "2030-01-02", "leftover", 3, 1)],
    tasks: [],
    recipes,
  });
  assert.equal(list.find((i) => i.ingredientId === "thigh").quantity, 48); // source batch 6 servings = 3 lb
  assert.equal(list.find((i) => i.ingredientId === "broccoli").quantity, 32);
  assert.equal(list.find((i) => i.ingredientId === "rice").quantity, 480);
  validateMenu(
    [day(1, "2030-01-01"), day(2, "2030-01-02", "leftover", 3, 1)],
    recipes,
  );
  assert.throws(
    () =>
      validateMenu(
        [day(1, "2030-01-01"), day(2, "2030-01-03", "leftover", 3, 1)],
        recipes,
      ),
    /Rice leftovers/,
  );
});
test("incompatible units/cuts stay separate, request quantities are not silently merged", () => {
  const list = shoppingList({
    menu,
    days: [],
    tasks: [
      { recipe_id: "maple-thighs", portions: 3 },
      { recipe_id: "sticky-chicken", portions: 3 },
    ],
    recipes,
    manual: [
      {
        id: 1,
        menu_id: 1,
        active: 1,
        name: "Soda",
        quantity: 2,
        unit: "box",
        section: "Beverages",
      },
      {
        id: 2,
        menu_id: 1,
        active: 1,
        name: "Soda",
        quantity: 1,
        unit: "box",
        section: "Beverages",
      },
      {
        id: 3,
        menu_id: 2,
        active: 1,
        name: "Another week",
        quantity: 3,
        unit: "box",
        section: "Beverages",
      },
    ],
  });
  assert.equal(list.filter((x) => x.name === "Soda").length, 2);
  assert.ok(!list.some((x) => x.name === "Another week"));
  assert.ok(list.some((x) => x.ingredientId === "boneThigh"));
  assert.ok(list.some((x) => x.ingredientId === "thigh"));
  assert.deepEqual(parseQuantity("Mom, please get 2 boxes of soda."), {
    quantity: 2,
    unit: "box",
  });
  assert.deepEqual(parseQuantity("More fruit please"), {
    quantity: null,
    unit: null,
  });
});
test("draft menus have no finalized shopping list; pantry is not assumed stocked", () => {
  assert.deepEqual(
    shoppingList({
      menu: { ...menu, status: "draft" },
      days: [],
      tasks: [],
      recipes,
    }),
    [],
  );
  const list = shoppingList({
    menu,
    days: [day(1, "2030-01-01")],
    tasks: [],
    recipes,
    pantry: [{ ingredient_id: "oil", have: 1 }],
  });
  assert.equal(list.find((x) => x.ingredientId === "oil").have, true);
  assert.equal(list.find((x) => x.ingredientId === "tamari").have, false);
});
test("menu is deterministic, respects attendance, locked dishes and taco night", () => {
  const options = {
    recipes,
    votes: [],
    roundId: 1,
    startDate: "2030-01-07",
    days: 14,
    tacoDay: 3,
  };
  const a = generateDays(options),
    b = generateDays(options);
  assert.deepEqual(a, b);
  for (const d of a) {
    if (new Date(d.date + "T12:00:00Z").getUTCDay() === 3)
      assert.equal(d.kind, "out");
    if (d.recipe_id)
      assert.ok(
        !["Fish", "Shrimp"].includes(
          recipes.find((r) => r.id === d.recipe_id).protein,
        ),
      );
  }
  const locked = { ...a[0], locked: 1, id: 1 };
  assert.deepEqual(generateDays({ ...options, existing: [locked] })[0], locked);
  const seafood = recipes.find((r) => r.id === "crispy-salmon");
  assert.throws(
    () =>
      validateMenu(
        [{ ...day(1, "2030-01-01"), recipe_id: seafood.id }],
        recipes,
      ),
    /James/,
  );
});

test("compatibility checks actual seafood ingredients after a recipe edit", () => {
  const edited = {
    ...recipe,
    ingredients: [{ id: "cod", quantity: 1.5, unit: "lb" }],
  };
  assert.equal(safeFor(edited, ["james"]), false);
  assert.equal(safeFor(edited, ["shani", "xander"]), true);
});
