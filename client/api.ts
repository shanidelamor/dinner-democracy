export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && path !== "/login")
      window.dispatchEvent(new Event("session-expired"));
    throw Error(data.error || "Unable to save. Please try again.");
  }
  return data;
}
export const formatQty = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  const whole=Math.floor(rounded),part=rounded-whole;
  const fractions:[[number,string],[number,string],[number,string],[number,string],[number,string]]=[[.25,'¼'],[.5,'½'],[.75,'¾'],[1/3,'⅓'],[2/3,'⅔']];
  const fraction=fractions.find(([value])=>Math.abs(value-part)<.006);
  return fraction ? `${whole||''}${whole?' ':''}${fraction[1]}` : String(rounded);
};
export function amount(n: number, unit: string) {
  if (unit === "oz" && n >= 16) return `${formatQty(n / 16)} lb`;
  if (unit === "ml") {
    if (n >= 240) return `${formatQty(n / 240)} cups`;
    if (n >= 15) return `${formatQty(n / 15)} tbsp`;
    return `${formatQty(n / 5)} tsp`;
  }
  return `${formatQty(n)} ${unit}`;
}
export const dayLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  },
) => new Date(date + "T12:00:00").toLocaleDateString(undefined, options);
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function resolveRecipeView(
  recipe: import("./types").Recipe | undefined,
  variationId?: string | null,
): import("./types").Recipe | undefined {
  if (!recipe || !variationId) return recipe;
  const option = recipe.variations?.find((v) => v.id === variationId);
  if (!option) return recipe;
  const { id, label, ...values } = option;
  return {
    ...recipe,
    ...values,
    id: recipe.id,
    selectedVariation: id,
    variationLabel: label,
  };
}
