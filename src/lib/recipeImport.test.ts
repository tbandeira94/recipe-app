import { describe, expect, it } from 'vitest'
import { parseRecipeText } from './recipeImport'

describe('parseRecipeText', () => {
  it('imports a standard directed recipe with details and source attribution', () => {
    const result = parseRecipeText(`Lemon Pasta
A bright weeknight dinner.

Prep Time: 15 minutes
Cook Time: 20 minutes
Servings: 4

Ingredients
1 1/2 cups peas
½ tsp salt
8 oz pasta
2 eggs

Instructions
1. Boil the pasta.
2. Toss with the remaining ingredients.`, { sourceName: 'A cookbook', sourceUrl: 'https://example.com/pasta' })

    expect(result.draft).toMatchObject({
      name: 'Lemon Pasta', description: 'A bright weeknight dinner.', prepMinutes: 15, cookMinutes: 20, servings: 4,
      sourceName: 'A cookbook', sourceUrl: 'https://example.com/pasta',
    })
    expect(result.draft.ingredients.map(({ quantity, unit, name }) => ({ quantity, unit, name }))).toEqual([
      { quantity: '1 1/2', unit: 'cups', name: 'peas' },
      { quantity: '½', unit: 'tsp', name: 'salt' },
      { quantity: '8', unit: 'oz', name: 'pasta' },
      { quantity: '2', unit: '', name: 'eggs' },
    ])
    expect(result.draft.instructions).toEqual(['Boil the pasta.', 'Toss with the remaining ingredients.'])
    expect(result.warnings).toEqual([])
  })

  it('handles CRLF lines, bullets, whitespace, and derives cook time from total time', () => {
    const result = parseRecipeText('Quick soup\r\n\r\nPrep: 10 min\r\nTotal time: 35 min\r\n\r\nIngredients\r\n• 1 can tomatoes\r\n- Salt to taste\r\n\r\nDirections\r\n1) Simmer.\r\n2) Serve.')

    expect(result.draft.prepMinutes).toBe(10)
    expect(result.draft.cookMinutes).toBe(25)
    expect(result.draft.ingredients.map((item) => item.name)).toEqual(['tomatoes', 'Salt to taste'])
    expect(result.draft.instructions).toEqual(['Simmer.', 'Serve.'])
  })

  it('preserves ingredient subsection labels and flags them for review', () => {
    const result = parseRecipeText(`Layered dip

Ingredients
For the sauce
1 cup yogurt

Method
Mix everything.`)

    expect(result.draft.ingredients[0].name).toBe('For the sauce')
    expect(result.warnings.some((warning) => warning.field === 'ingredients' && warning.index === 0)).toBe(true)
  })

  it('keeps ambiguous quantity lines intact and warns instead of guessing', () => {
    const result = parseRecipeText(`Simple snack

Ingredients
2–3

Instructions
Combine.`)

    expect(result.draft.ingredients[0]).toMatchObject({ quantity: '', unit: '', name: '2–3' })
    expect(result.warnings.some((warning) => warning.field === 'ingredients' && warning.message.includes('kept intact'))).toBe(true)
  })

  it('keeps incomplete imports editable and reports missing sections', () => {
    const result = parseRecipeText('A page title\nSome introductory copy only.')

    expect(result.draft.name).toBe('A page title')
    expect(result.draft.ingredients).toEqual([])
    expect(result.draft.instructions).toEqual([])
    expect(result.warnings.map((warning) => warning.field)).toEqual(expect.arrayContaining(['ingredients', 'instructions']))
  })

  it('does not accept blank input', () => {
    expect(() => parseRecipeText(' \n\t ')).toThrow('Paste a recipe')
  })

  it('warns instead of guessing a range of servings or unusable total time', () => {
    const result = parseRecipeText(`Toast
Total Time: 20 minutes
Servings: 2-4

Ingredients
2 slices bread

Preparation
Toast the bread.`)

    expect(result.draft.servings).toBeNull()
    expect(result.draft.cookMinutes).toBeNull()
    expect(result.warnings.filter((warning) => warning.field === 'details').map((warning) => warning.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('single serving count'),
      expect.stringContaining('Total time was not used'),
    ]))
  })

  it('removes checkbox-style bullets used by recipe card plugins', () => {
    const result = parseRecipeText(`Sheet Pan Dinner

INGREDIENTS (4 servings)
▢ 1½ lbs chicken thighs
□2 tbsp olive oil
☐ Salt and pepper

RECIPE INSTRUCTIONS
▢ Preheat the oven.
☑ Roast until browned.`)

    expect(result.draft.ingredients.map(({ quantity, unit, name }) => ({ quantity, unit, name }))).toEqual([
      { quantity: '1½', unit: 'lbs', name: 'chicken thighs' },
      { quantity: '2', unit: 'tbsp', name: 'olive oil' },
      { quantity: '', unit: '', name: 'Salt and pepper' },
    ])
    expect(result.draft.instructions).toEqual(['Preheat the oven.', 'Roast until browned.'])
    expect(result.draft.ingredients.every((item) => !/[▢□☐]/.test(item.name))).toBe(true)
  })

  it('handles the controls, continuations, nutrition block, and step labels in a Good Food-style card', () => {
    const result = parseRecipeText(`Easy chicken casserole
Serves 4
Prep: 5 mins
Cook: 50 mins

Ingredients
Nutrition
Units:
MetricUS
• 8 bone-in chicken thighs
skin pulled off and discarded
• 400g new potatoes
halved if large
• small handful fresh herbs
chopped
Nutrition: per serving
• kcal 368
• fat 12g

Method
• step 1
Brown the chicken well.
• step 2
Add the vegetables and simmer.`)

    expect(result.draft.ingredients.map(({ quantity, unit, name }) => ({ quantity, unit, name }))).toEqual([
      { quantity: '8', unit: '', name: 'bone-in chicken thighs, skin pulled off and discarded' },
      { quantity: '400', unit: 'g', name: 'new potatoes, halved if large' },
      { quantity: '', unit: '', name: 'small handful fresh herbs, chopped' },
    ])
    expect(result.draft.instructions).toEqual(['Brown the chicken well.', 'Add the vegetables and simmer.'])
    expect(result.draft).toMatchObject({ prepMinutes: 5, cookMinutes: 50, servings: 4 })
  })

  it('ignores unit toggles and stops at notes in a printable recipe card', () => {
    const result = parseRecipeText(`Chocolate Chip Cookies

Prep Time: 15 minutes
Cook Time: 30 minutes
Servings: 25

Ingredients
[Button: US Customary][Button: Metric]
* ¾ cup rolled oats
* ½ teaspoon baking powder
* 1 large egg

Instructions
* Preheat the oven to 350°F.
* Mix the dry ingredients.

Notes
Freeze for up to three months.`)

    expect(result.draft.ingredients).toHaveLength(3)
    expect(result.draft.ingredients.map((item) => item.name)).toEqual(['rolled oats', 'baking powder', 'large egg'])
    expect(result.draft.instructions).toEqual(['Preheat the oven to 350°F.', 'Mix the dry ingredients.'])
  })

  it('recognizes alternate section labels and headings with inline content', () => {
    const result = parseRecipeText(`Quick dressing

Ingredient Checklist: 3 tbsp olive oil
1 tbsp vinegar

How to make it
Step 1: Whisk everything together.
Step 2 — Season to taste.`)

    expect(result.draft.ingredients.map((item) => item.name)).toEqual(['olive oil', 'vinegar'])
    expect(result.draft.instructions).toEqual(['Whisk everything together.', 'Season to taste.'])
  })
})
