export function resolveRecipe(recipe, variationId) {
  if (!recipe) return recipe;
  if (!variationId) return recipe;
  const option = recipe.variations?.find((v) => v.id === variationId);
  if (!option)
    throw Object.assign(
      new Error("Choose a recipe option that exists for this dinner."),
      { status: 400 },
    );
  const { id, label, ...values } = option;
  return {
    ...recipe,
    ...values,
    id: recipe.id,
    selectedVariation: id,
    variationLabel: label,
  };
}
