const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export const sections = [
  "Produce",
  "Meat and seafood",
  "Dairy and refrigerated",
  "Frozen",
  "Pantry and dry goods",
  "Bakery / gluten-free",
  "Beverages",
  "Other",
];
export const unitTable = {
  lb: ["weight", 16],
  oz: ["weight", 1],
  cup: ["volume", 240],
  tbsp: ["volume", 15],
  tsp: ["volume", 5],
  ml: ["volume", 1],
  each: ["each", 1],
  can: ["can", 1],
  pkg: ["pkg", 1],
  box: ["box", 1],
};
export const safeFor = (recipe, attendees) =>
  !(
    attendees.includes("james") &&
    (["Fish", "Shrimp"].includes(recipe.protein) ||
      recipe.ingredients?.some(i => ["salmon","cod","shrimp","tunaFish","tunaCan"].includes(i.id)) ||
      /asparagus/i.test(recipe.vegetables))
  );
export const parseQuantity = (message) => {
  const m = message.match(
    /\b(\d+(?:\.\d+)?)\s*(boxes|box|cans|can|packages|packs|pack|bottles|bottle|lbs?|pounds?|ounces?|oz|cups?|each)\b/i,
  );
  return m
    ? {
        quantity: Number(m[1]),
        unit:
          {
            boxes: "box",
            cans: "can",
            packages: "pkg",
            packs: "pkg",
            pack: "pkg",
            bottles: "each",
            bottle: "each",
            pounds: "lb",
            pound: "lb",
            lbs: "lb",
            ounces: "oz",
            ounce: "oz",
            cups: "cup",
          }[m[2].toLowerCase()] || m[2].toLowerCase(),
      }
    : { quantity: null, unit: null };
};
export const datePlus = (date, offset) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
export function generateDays({
  recipes,
  votes,
  roundId,
  startDate,
  days,
  tacoDay,
  existing = [],
  attendees = ["shani", "james", "xander"],
  portions = 3,
  recent = [],
  leftovers = true,
}) {
  const result = [];
  const used = new Map();
  let previous = null;
  for (let i = 0; i < days; i++) {
    const date = datePlus(startDate, i),
      old = existing.find((x) => x.date === date);
    if (old?.locked) {
      result.push(old);
      if (old.recipe_id) {
        used.set(old.recipe_id, (used.get(old.recipe_id) || 0) + 1);
        previous = recipes.find((r) => r.id === old.recipe_id);
      }
      continue;
    }
    const people = old ? JSON.parse(old.attendees) : attendees;
    const qty = old?.portions || portions;
    const base = {
      date,
      attendees: JSON.stringify(people),
      portions: qty,
      locked: 0,
    };
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === tacoDay) {
      result.push({
        ...base,
        kind: "out",
        recipe_id: null,
        reason: "Configured taco night out · no grocery ingredients",
        leftover_of: null,
      });
      previous = null;
      continue;
    }
    const prev = result.at(-1);
    if (
      leftovers &&
      i % 3 === 2 &&
      prev?.kind === "cook" &&
      !prev.locked &&
      prev.recipe_id &&
      safeFor(
        recipes.find((r) => r.id === prev.recipe_id),
        people,
      )
    ) {
      result.push({
        ...base,
        kind: "leftover",
        recipe_id: prev.recipe_id,
        leftover_date: prev.date,
        leftover_of: null,
        reason:
          "Cook one larger batch the previous day; reserve these portions safely.",
      });
      continue;
    }
    const ranked = recipes
      .filter(
        (r) =>
          r.category === "Dinner" &&
          !r.archived &&
          r.ingredients.length &&
          safeFor(r, people),
      )
      .map((r) => {
        const rv = votes.filter(
          (v) =>
            v.recipe_id === r.id &&
            v.round_id === roundId &&
            people.includes(v.user_id),
        );
        const yes = rv.filter((v) => v.choice === "yes").length,
          maybe = rv.filter((v) => v.choice === "maybe").length,
          no = rv.filter((v) => v.choice === "no").length;
        const score =
          yes * 100 +
          maybe * 8 -
          no * 35 -
          (used.get(r.id) || 0) * 1000 -
          (recent.includes(r.id) ? 45 : 0) -
          (previous?.protein === r.protein ? 50 : 0) -
          (previous?.cuisine === r.cuisine ? 45 : 0) +
          (r.favorite ? 4 : 0);
        return { r, score, yes, maybe, no };
      })
      .sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id));
    const pick = ranked[0];
    if (!pick) throw invalid("No compatible dinner recipes are available.");
    result.push({
      ...base,
      kind: "cook",
      recipe_id: pick.r.id,
      leftover_of: null,
      reason: `${pick.yes} YES, ${pick.maybe} MAYBE, ${pick.no} NO from attending diners. Unvoted diners are unvoted. Balances protein/cuisine and avoids recent menus.${people.includes("james") ? " Seafood excluded for James." : ""}`,
    });
    used.set(pick.r.id, (used.get(pick.r.id) || 0) + 1);
    previous = pick.r;
  }
  return result;
}
export function shoppingList({
  menu,
  days,
  tasks,
  recipes,
  manual = [],
  pantry = [],
  states = [],
}) {
  if (!menu || menu.status !== "approved") return [];
  const list = new Map(),
    have = new Set(pantry.filter((p) => p.have).map((p) => p.ingredient_id));
  const addRecipe = (id, portions, label) => {
    const r = recipes.find((r) => r.id === id);
    if (!r) throw invalid("Planned recipe is missing");
    for (const ing of r.ingredients) {
      const [dimension, factor] = unitTable[ing.unit] || [ing.unit, 1],
        key = `${ing.id}:${dimension}`;
      if (!list.has(key))
        list.set(key, {
          key,
          name: ing.name,
          ingredientId: ing.id,
          quantity: 0,
          unit:
            dimension === "weight"
              ? "oz"
              : dimension === "volume"
                ? "ml"
                : ing.unit,
          section: ing.section,
          sources: [],
          pantry: have.has(ing.id),
          optional: !!ing.note?.toLowerCase().includes("optional"),
        });
      const item = list.get(key);
      item.quantity += ((ing.quantity * portions) / r.servings) * factor;
      if (!item.sources.includes(label)) item.sources.push(label);
    }
  };
  for (const day of days.filter((d) => d.kind === "cook")) {
    const total =
      day.portions +
      days
        .filter((d) => d.kind === "leftover" && d.leftover_of === day.id)
        .reduce((sum, d) => sum + d.portions, 0);
    addRecipe(
      day.recipe_id,
      total,
      `${day.date} · ${recipes.find((r) => r.id === day.recipe_id)?.title}${total > day.portions ? " (includes reserved leftovers)" : ""}`,
    );
  }
  for (const task of tasks)
    addRecipe(task.recipe_id, task.portions, `${task.date} · extra / baking`);
  // Free-text requests stay separate until Shani explicitly decides their quantities.
  for (const m of manual.filter((m) => m.active && m.menu_id === menu.id))
    list.set(`manual:${m.id}`, {
      key: `manual:${m.id}`,
      name: m.name,
      quantity: m.quantity,
      unit: m.unit,
      section: m.section,
      sources: [m.request_id ? "Approved family request" : "Added by Shani"],
      pantry: false,
    });
  return [...list.values()]
    .map((item) => {
      const state = states.find((s) => s.item_key === item.key);
      return {
        ...item,
        quantity: Math.round(item.quantity * 1000) / 1000,
        checked: !!state?.checked,
        have: !!state?.have || item.pantry,
        purchaseQuantity: state?.purchase_quantity ?? null,
      };
    })
    .sort(
      (a, b) =>
        sections.indexOf(a.section) - sections.indexOf(b.section) ||
        a.name.localeCompare(b.name),
    );
}
export function validateMenu(days, recipes) {
  for (const d of days) {
    if (d.kind === "out") continue;
    const r = recipes.find((x) => x.id === d.recipe_id);
    if (!r || r.archived || r.category !== "Dinner" || !r.ingredients.length)
      throw invalid("Choose a complete active dinner recipe.");
    if (!safeFor(r, JSON.parse(d.attendees)))
      throw invalid(
        "James is attending; choose a dinner without seafood or asparagus.",
      );
    if (d.kind === "leftover") {
      const source = days.find((s) => s.id === d.leftover_of);
      if (
        !source ||
        source.kind !== "cook" ||
        source.recipe_id !== d.recipe_id ||
        source.date >= d.date ||
        datePlus(source.date, 3) < d.date
      )
        throw invalid(
          "Leftovers need a matching cooked dinner from the previous 1–3 days.",
        );
      if (
        r.ingredients.some((x) => x.id === "rice") &&
        datePlus(source.date, 1) < d.date
      )
        throw invalid("Rice leftovers must be scheduled for the next day.");
    }
  }
}
