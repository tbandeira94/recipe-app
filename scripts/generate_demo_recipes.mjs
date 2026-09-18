import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const recipes = [
  ['Herby Lemon Chicken', 'Main', ['dinner'], ['chicken thighs', 'lemon', 'garlic'], ['Mediterranean', 'weeknight']],
  ['Creamy Mushroom Pasta', 'Main', ['dinner'], ['pasta', 'mushrooms', 'cream'], ['Italian', 'comfort food']],
  ['Black Bean Tacos', 'Main', ['lunch', 'dinner'], ['black beans', 'tortillas', 'avocado'], ['Mexican', 'vegetarian']],
  ['Vegetable Fried Rice', 'Main', ['lunch', 'dinner'], ['rice', 'eggs', 'mixed vegetables'], ['Asian', 'quick']],
  ['Chickpea Coconut Curry', 'Main', ['dinner'], ['chickpeas', 'coconut milk', 'spinach'], ['Indian-inspired', 'vegan']],
  ['Sheet Pan Sausage and Peppers', 'Main', ['dinner'], ['sausage', 'bell peppers', 'onion'], ['one pan', 'weeknight']],
  ['Turkey Avocado Wrap', 'Main', ['lunch'], ['turkey', 'avocado', 'tortilla'], ['quick', 'no-cook']],
  ['Baked Salmon with Dill', 'Main', ['dinner'], ['salmon', 'dill', 'lemon'], ['seafood', 'healthy']],
  ['Margherita Flatbread', 'Main', ['lunch', 'dinner'], ['flatbread', 'mozzarella', 'tomatoes'], ['Italian', 'vegetarian']],
  ['Pulled Jackfruit Sandwiches', 'Main', ['lunch', 'dinner'], ['jackfruit', 'barbecue sauce', 'buns'], ['vegan', 'sandwich']],
  ['Overnight Berry Oats', 'Breakfast', ['breakfast'], ['oats', 'milk', 'berries'], ['make-ahead', 'vegetarian']],
  ['Spinach Feta Egg Bites', 'Breakfast', ['breakfast'], ['eggs', 'spinach', 'feta'], ['high-protein', 'meal prep']],
  ['Banana Pancakes', 'Breakfast', ['breakfast', 'brunch'], ['banana', 'flour', 'eggs'], ['sweet', 'weekend']],
  ['Savory Breakfast Burrito', 'Breakfast', ['breakfast', 'brunch'], ['eggs', 'potatoes', 'tortilla'], ['Mexican-inspired', 'freezer-friendly']],
  ['Yogurt Parfait', 'Breakfast', ['breakfast'], ['yogurt', 'granola', 'berries'], ['quick', 'no-cook']],
  ['Roasted Tomato Soup', 'Soup', ['lunch', 'dinner'], ['tomatoes', 'onion', 'vegetable broth'], ['vegetarian', 'comfort food']],
  ['Ginger Carrot Soup', 'Soup', ['lunch', 'dinner'], ['carrots', 'ginger', 'coconut milk'], ['vegan', 'freezer-friendly']],
  ['Chicken Tortilla Soup', 'Soup', ['lunch', 'dinner'], ['chicken', 'black beans', 'corn'], ['Mexican-inspired', 'one pot']],
  ['Miso Noodle Soup', 'Soup', ['lunch', 'dinner'], ['miso', 'noodles', 'tofu'], ['Japanese-inspired', 'vegetarian']],
  ['Greek Chickpea Salad', 'Salad', ['lunch'], ['chickpeas', 'cucumber', 'feta'], ['Mediterranean', 'vegetarian']],
  ['Apple Walnut Salad', 'Salad', ['lunch', 'dinner'], ['apples', 'walnuts', 'greens'], ['fall', 'vegetarian']],
  ['Sesame Cucumber Salad', 'Salad', ['lunch', 'dinner'], ['cucumber', 'sesame oil', 'rice vinegar'], ['Asian', 'quick']],
  ['Classic Vinaigrette', 'Sauce', ['lunch', 'dinner'], ['olive oil', 'vinegar', 'mustard'], ['pantry staple', 'quick']],
  ['Roasted Garlic Tomato Sauce', 'Sauce', ['dinner'], ['tomatoes', 'garlic', 'basil'], ['Italian', 'freezer-friendly']],
  ['Peanut Lime Sauce', 'Sauce', ['lunch', 'dinner'], ['peanut butter', 'lime', 'soy sauce'], ['Asian-inspired', 'vegan']],
  ['Creamy Dill Dip', 'Sauce', ['snack'], ['yogurt', 'dill', 'lemon'], ['quick', 'vegetarian']],
  ['Crispy Roasted Potatoes', 'Side', ['dinner'], ['potatoes', 'olive oil', 'paprika'], ['vegetarian', 'one pan']],
  ['Garlic Green Beans', 'Side', ['dinner'], ['green beans', 'garlic', 'butter'], ['quick', 'vegetarian']],
  ['Lemony Couscous', 'Side', ['lunch', 'dinner'], ['couscous', 'lemon', 'parsley'], ['Mediterranean', 'quick']],
  ['Cornbread Muffins', 'Bread', ['dinner', 'snack'], ['cornmeal', 'flour', 'milk'], ['baking', 'vegetarian']],
  ['Rosemary Focaccia', 'Bread', ['lunch', 'dinner'], ['flour', 'rosemary', 'olive oil'], ['Italian', 'baking']],
  ['Skillet Garlic Naan', 'Bread', ['dinner'], ['flour', 'yogurt', 'garlic'], ['Indian-inspired', 'quick']],
  ['Chocolate Chip Cookies', 'Dessert', ['snack'], ['flour', 'chocolate chips', 'butter'], ['baking', 'sweet']],
  ['Berry Crumble', 'Dessert', ['snack'], ['berries', 'oats', 'butter'], ['summer', 'vegetarian']],
  ['No-Bake Peanut Butter Bars', 'Dessert', ['snack'], ['peanut butter', 'oats', 'chocolate chips'], ['no-bake', 'freezer-friendly']],
  ['Lemon Olive Oil Cake', 'Dessert', ['snack'], ['lemon', 'flour', 'olive oil'], ['baking', 'Mediterranean']],
  ['Iced Matcha Latte', 'Drink', ['breakfast', 'snack'], ['matcha', 'milk', 'honey'], ['quick', 'cafe-style']],
  ['Cucumber Mint Agua Fresca', 'Drink', ['snack'], ['cucumber', 'mint', 'lime'], ['summer', 'vegan']],
  ['Spiced Apple Cider', 'Drink', ['snack'], ['apple cider', 'cinnamon', 'orange'], ['fall', 'holiday']],
  ['Hummus Snack Box', 'Snack', ['snack', 'lunch'], ['hummus', 'carrots', 'crackers'], ['no-cook', 'meal prep']],
  ['Parmesan Popcorn', 'Snack', ['snack'], ['popcorn', 'parmesan', 'butter'], ['quick', 'movie night']],
  ['Energy Date Balls', 'Snack', ['snack'], ['dates', 'oats', 'peanut butter'], ['no-bake', 'vegan']],
  ['Mini Caprese Skewers', 'Snack', ['snack', 'lunch'], ['mozzarella', 'tomatoes', 'basil'], ['Italian', 'no-cook']],
  ['Vegetable Stir-Fry', 'Main', ['lunch', 'dinner'], ['broccoli', 'bell peppers', 'tofu'], ['Asian-inspired', 'vegan']],
  ['Lentil Shepherd’s Pie', 'Main', ['dinner'], ['lentils', 'potatoes', 'carrots'], ['vegetarian', 'comfort food']],
  ['Pesto White Bean Salad', 'Salad', ['lunch'], ['white beans', 'pesto', 'arugula'], ['Italian', 'quick']],
  ['Buttermilk Biscuits', 'Bread', ['breakfast', 'brunch'], ['flour', 'buttermilk', 'butter'], ['baking', 'weekend']],
  ['Mango Chia Pudding', 'Breakfast', ['breakfast', 'snack'], ['chia seeds', 'mango', 'coconut milk'], ['vegan', 'make-ahead']],
  ['Spicy Lentil Dip', 'Sauce', ['snack'], ['lentils', 'tomatoes', 'cumin'], ['vegan', 'freezer-friendly']],
  ['Maple Roasted Carrots', 'Side', ['dinner'], ['carrots', 'maple syrup', 'thyme'], ['fall', 'vegetarian']],
]

const normalized = (value) => value.trim().toLowerCase().replace(/\s+/g, ' ')
const quantity = (index) => index === 0 ? '1' : index === 1 ? '2' : '1'
const unit = (index) => index === 0 ? 'cup' : index === 1 ? 'tbsp' : 'tsp'

const output = {
  format: 'pantry-book-backup',
  version: 3,
  exportedAt: new Date().toISOString(),
  recipes: recipes.map(([name, dishType, mealTypes, ingredientNames, tags], index) => {
    const createdAt = new Date(Date.UTC(2026, 0, 1 + index)).toISOString()
    const ingredients = ingredientNames.map((name, ingredientIndex) => ({
      id: `demo-${index + 1}-ingredient-${ingredientIndex + 1}`,
      name,
      normalizedName: normalized(name),
      quantity: quantity(ingredientIndex),
      unit: unit(ingredientIndex),
    }))
    return {
      id: `demo-recipe-${String(index + 1).padStart(2, '0')}`,
      name,
      description: `A simple ${tags[0].toLowerCase()} recipe for testing Pantry Book’s browsing and search tools.`,
      photoDataUrl: null,
      ingredients,
      ingredientNames: ingredients.map((ingredient) => ingredient.normalizedName),
      instructions: [`Prepare the ${ingredientNames[0]}.`, `Combine with the remaining ingredients and cook or assemble until ready to serve.`],
      prepMinutes: 5 + (index % 4) * 5,
      cookMinutes: dishType === 'Salad' || dishType === 'Drink' ? 0 : 10 + (index % 5) * 5,
      servings: index % 3 === 0 ? 4 : 2,
      dishTypes: [dishType],
      mealTypes,
      tags,
      favorite: index % 9 === 0,
      notes: index % 7 === 0 ? 'Demo note: adjust seasoning to taste.' : '',
      sourceName: 'Pantry Book demo collection',
      sourceUrl: '',
      createdAt,
      modifiedAt: createdAt,
    }
  }),
}

const outputDirectory = resolve('test-data')
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(resolve(outputDirectory, 'demo-recipes-v3.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(`Created ${output.recipes.length} demo recipes.`)
