import { catalogV1 } from "./catalog-v1-baseline.js";
const stable = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
const same = (a, b) => stable(a) === stable(b);
const ingredientsEqual = (a, b) =>
  same(
    a?.map(({ id, quantity, unit, note }) => ({
      id,
      quantity,
      unit,
      note: note || "",
    })),
    b?.map(({ id, quantity, unit, note }) => ({
      id,
      quantity,
      unit,
      note: note || "",
    })),
  );

// Three-way merge: update untouched seeded fields, retain personal changes, and
// preserve the previous recipe in history. No votes, requests or users are reset.
export function mergeCatalogRecipe(
  current,
  reviewed,
  baseline = catalogV1[current.id],
) {
  if (same(baseline, reviewed)) return null;
  if (!baseline) return null;
  const merged = { ...current };
  const conflicts = new Set(current.catalogConflicts || []);
  for (const [field, value] of Object.entries(reviewed)) {
    if (
      ["id", "version", "catalogRevision", "catalogConflicts"].includes(field)
    )
      continue;
    const equals = field === "ingredients" ? ingredientsEqual : same;
    if (equals(value, baseline[field])) continue;
    if (equals(current[field], value)) {
      conflicts.delete(field);
      continue;
    }
    if (current[field] === undefined || equals(current[field], baseline[field]))
      merged[field] = value;
    else conflicts.add(field);
  }
  merged.catalogRevision = reviewed.catalogRevision;
  merged.catalogConflicts = [...conflicts];
  return {
    recipe: merged,
    ingredientsChanged: !ingredientsEqual(
      current.ingredients,
      merged.ingredients,
    ),
    conflicts: [...conflicts],
  };
}
