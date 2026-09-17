import { DEMO_RECIPES, getDemoRecipe } from './demo-recipes';

describe('demo recipes', () => {
  it('defines a recipe for every initial Atelys product', () => {
    expect(DEMO_RECIPES.map((r) => r.productId).sort()).toEqual(
      ['custom-atelys', 'devifact', 'kynexy', 'mahana', 'roulibre'].sort(),
    );
  });

  it('keeps standard visual demos between four and six screens', () => {
    const standard = DEMO_RECIPES.filter((r) => r.productId !== 'custom-atelys');
    for (const recipe of standard) {
      expect(recipe.targetScreenCount).toBeGreaterThanOrEqual(4);
      expect(recipe.targetScreenCount).toBeLessThanOrEqual(6);
      expect(recipe.screens).toHaveLength(recipe.targetScreenCount);
      expect(new Set(recipe.screens.map((s) => s.id)).size).toBe(recipe.screens.length);
    }
  });

  it('does not fabricate a standard screen recipe for custom Atelys', () => {
    const custom = getDemoRecipe('custom-atelys');
    expect(custom?.targetScreenCount).toBe(0);
    expect(custom?.screens).toEqual([]);
  });
});
