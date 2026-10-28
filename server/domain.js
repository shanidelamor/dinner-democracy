import { resolveRecipe } from "./recipe-options.js";
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
      recipe.ingredients?.some((i) =>
        [
          "salmon",
          "pokeSalmon",
          "cod",
          "shrimp",
          "tunaFish",
          "tunaCan",
        ].includes(i.id),
      ) ||
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
  season,
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
    if (old?.kind === "out" || new Date(`${date}T12:00:00Z`).getUTCDay() === tacoDay) {
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
          r.ingredients.length && r.vegetables && (r.protein !== "Chicken" || r.cut) &&
          safeFor(r, people),
      )
      .map((r) => {
        const rv = votes.filter(
          (v) =>
            v.recipe_id === r.id &&
            v.round_id === roundId,
        );
        const yes = rv.filter((v) => v.choice === "yes").length,
          maybe = rv.filter((v) => v.choice === "maybe").length,
          no = rv.filter((v) => v.choice === "no").length;
        const score =
          (yes === 3 ? 1000 : 0) + yes * 30 +
          maybe * 10 + (r.seasons?.includes(season) ? 5 : 0) -
          (used.get(r.id) || 0) * 1000 -
          (recent.includes(r.id) ? 45 : 0) -
          (previous?.protein === r.protein ? 50 : 0) -
          (previous?.cuisine === r.cuisine ? 45 : 0) +
          (r.favorite ? 4 : 0) - (new Date(date+"T12:00:00Z").getUTCDay()%6 ? (r.prep+r.cook)/30 : 0);
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
      reason: `${pick.yes} YES, ${pick.maybe} MAYBE, ${pick.no} NO from family votes. Unvoted diners are unvoted. Balances protein/cuisine and avoids recent menus.${people.includes("james") ? " Seafood excluded for James." : ""}`,
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
  inventory = [],
  purchaseRules = [],
}) {
  if (!menu || menu.status !== "approved") return [];
  const list = new Map(),
    have = new Set(pantry.filter((p) => p.have).map((p) => p.ingredient_id));
  const addRecipe = (id, portions, label, variationId, omit = []) => {
    const r = resolveRecipe(
      recipes.find((r) => r.id === id),
      variationId,
    );
    if (!r) throw invalid("Planned recipe is missing");
    for (const ing of r.ingredients.filter(i=>!omit.includes(i.id))) {
      const [dimension, factor] = unitTable[ing.unit] || [ing.unit, 1],
        key = `${ing.id}:${dimension}${ing.form && ing.form!=="as_purchased" ? ":"+ing.form : ""}`;
      if (!list.has(key))
        list.set(key, {
          key,
          name: ing.name,
          ingredientId: ing.id,
          form: ing.form||"as_purchased",
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
        .filter((d) => d.kind === "leftover" && d.leftover_of === day.id && !d.leftover_recipe_id)
        .reduce((sum, d) => sum + d.portions, 0);
    // Transformation needs cooked brisket: 2/3 cooking yield, 1 lb cooked per three diners.
    const transformations=days.filter(d=>d.kind==='leftover'&&d.leftover_of===day.id&&d.leftover_recipe_id);
    const extraRaw=transformations.reduce((sum,d)=>sum+(d.portions/3)/(2/3),0);
    const source=recipes.find(r=>r.id===day.recipe_id);
    const rawPerServing=source?.ingredients.find(i=>i.id==='brisket'&&i.unit==='lb')?.quantity/source?.servings;
    addRecipe(
      day.recipe_id,
      total+(extraRaw ? extraRaw/rawPerServing : 0),
      `${day.date} · ${recipes.find((r) => r.id === day.recipe_id)?.title}${total > day.portions ? " (includes reserved leftovers)" : ""}${
        day.variation_id
          ? ` · ${
              resolveRecipe(
                recipes.find((r) => r.id === day.recipe_id),
                day.variation_id,
              ).variationLabel
            }`
          : ""
      }`,
      day.variation_id,
    );
  }
  for(const d of days.filter(d=>d.kind==='leftover'&&d.leftover_recipe_id))
    addRecipe(d.leftover_recipe_id,d.portions,`${d.date} · leftover transformation`,null,['cookedBrisket']);
  for (const task of tasks)
    addRecipe(task.recipe_id, task.portions, `${task.date} · extra / baking`);
  // Free-text requests stay separate until Shani explicitly decides their quantities.
  for (const m of manual.filter((m) => m.active && m.menu_id === menu.id)) {
    const [dimension,factor]=unitTable[m.unit]||[m.unit,1];
    const key=m.ingredient_id ? `${m.ingredient_id}:${dimension}` : `manual:${m.id}`;
    if(m.ingredient_id && list.has(key)) {
      const item=list.get(key);item.quantity+=m.quantity*factor;item.requestedQuantity=(item.requestedQuantity||0)+m.quantity*factor;item.sources.push('Approved family request');continue;
    }
    list.set(key, {
      key,
      ...(m.ingredient_id?{ingredientId:m.ingredient_id}:{}),
      name: m.name,
      requestedQuantity: m.ingredient_id ? m.quantity*factor : m.quantity,
      quantity: m.ingredient_id ? m.quantity*factor : m.quantity,
      unit: m.ingredient_id ? (dimension==="weight"?"oz":dimension==="volume"?"ml":m.unit) : m.unit,
      section: m.section,
      sources: [m.request_id ? "Approved family request" : "Added by Shani"],
      pantry: false,
    });
  }
  return [...list.values()]
    .map((item) => {
      const state = states.find((s) => s.item_key === item.key);
      const stock=inventory.find(p=>p.ingredient_id===item.ingredientId && (!item.form || item.form==="as_purchased"));
      const convert=(qty,from,to)=>{
        const a=unitTable[from]||[from,1],b=unitTable[to]||[to,1];
        return a[0]===b[0]?qty*a[1]/b[1]:null;
      };
      const available=stock ? convert(stock.quantity,stock.unit,item.unit) : 0;
      const required=Math.max(item.requestedQuantity||0,item.quantity-(available||0));
      const rule=purchaseRules.find(p=>p.ingredient_id===item.ingredientId);
      const packageSize=rule ? convert(rule.package_size,rule.unit,item.unit):null;
      const purchase=item.key.startsWith("manual:") ? item.quantity : packageSize ? Math.ceil((required-1e-9)/packageSize)*packageSize : ['each','can','box','pkg'].includes(item.unit)?Math.ceil(required-1e-9):required;

      return {
        ...item,
        quantity: Math.round(item.quantity * 1000) / 1000,
        checked: !!state?.checked,
        have: !!state?.have || item.pantry,
        requiredQuantity: required,
        packageSizeConfirmed: !!packageSize,
        packageCount: packageSize ? Math.ceil((state?.purchase_quantity ?? purchase)/packageSize) : null,
        purchaseQuantity: state?.purchase_quantity ?? purchase,
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
    const r = resolveRecipe(
      recipes.find((x) => x.id === d.recipe_id),
      d.variation_id,
    );
    if (!r || r.archived || r.category !== "Dinner" || !r.ingredients.length)
      throw invalid("Choose a complete active dinner recipe.");
    if (!r.vegetables || (r.protein === "Chicken" && !r.cut)) throw invalid("Dinner needs vegetables and an exact chicken cut.");
    if (!safeFor(r, JSON.parse(d.attendees)))
      throw invalid(
        "James is attending; choose a dinner without seafood or asparagus.",
      );
    if (d.leftover_recipe_id) {
      const transformation=recipes.find(r=>r.id===d.leftover_recipe_id);
      if(d.kind!=='leftover'||d.recipe_id!=='brisket'||!['brisket-tacos','brisket-bowls'].includes(d.leftover_recipe_id)||!transformation?.vegetables||!safeFor(transformation,JSON.parse(d.attendees))) throw invalid('Choose a compatible brisket leftover transformation');
    }
    if (d.kind === "leftover") {
      const source = days.find((s) => s.id === d.leftover_of);
      if (
        !source ||
        source.kind !== "cook" ||
        source.recipe_id !== d.recipe_id ||
        (source.variation_id || null) !== (d.variation_id || null) ||
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
