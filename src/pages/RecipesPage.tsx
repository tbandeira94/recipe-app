import { MEAL_TYPES, type MealType, type Recipe } from '../types'
import { GridIcon, PlusIcon, SearchIcon, StarIcon, TagIcon } from '../components/Icons'
import { RecipeCard } from '../components/RecipeCard'

export type LibraryView = 'all' | 'types' | 'tags' | 'favorites'
export type LibrarySelection = { kind: 'dishType' | 'meal' | 'tag'; value: string; label: string } | null
export interface LibraryState { view: LibraryView; selection: LibrarySelection; mealFilter: MealType | null }

interface RecipesPageProps {
  recipes: Recipe[]
  loading: boolean
  libraryState: LibraryState
  onLibraryStateChange: (state: LibraryState) => void
  onAdd: () => void
  onOpen: (id: string) => void
  onToggleFavorite: (recipe: Recipe) => void
}

interface CountedLabel { label: string; value: string; count: number }

const titleCase = (value: string) => value[0].toUpperCase() + value.slice(1)

function countLabels(values: string[][]): CountedLabel[] {
  const counts = new Map<string, CountedLabel>()
  values.flat().forEach((label) => {
    const value = label.trim().toLocaleLowerCase()
    const existing = counts.get(value)
    counts.set(value, existing ? { ...existing, count: existing.count + 1 } : { label, value, count: 1 })
  })
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label))
}

function CategoryGrid({ categories, emptyText, onSelect }: { categories: CountedLabel[]; emptyText: string; onSelect: (category: CountedLabel) => void }) {
  if (!categories.length) return <p className="category-empty">{emptyText}</p>
  return <div className="category-grid">{categories.map((category) => <button key={category.value} onClick={() => onSelect(category)}><strong>{category.label}</strong><span>{category.count} {category.count === 1 ? 'recipe' : 'recipes'} <b aria-hidden="true">›</b></span></button>)}</div>
}

export function RecipesPage({ recipes, loading, libraryState, onLibraryStateChange, onAdd, onOpen, onToggleFavorite }: RecipesPageProps) {
  const dishTypes = countLabels(recipes.map((recipe) => recipe.dishTypes))
  const tags = countLabels(recipes.map((recipe) => recipe.tags))
  const meals = MEAL_TYPES.map((meal) => ({ label: titleCase(meal), value: meal, count: recipes.filter((recipe) => recipe.mealTypes.includes(meal)).length })).filter((meal) => meal.count > 0)
  const uncategorizedCount = recipes.filter((recipe) => !recipe.dishTypes.length).length

  const setView = (view: LibraryView) => onLibraryStateChange({ view, selection: null, mealFilter: view === 'all' ? libraryState.mealFilter : null })
  const select = (kind: NonNullable<LibrarySelection>['kind'], category: CountedLabel) => onLibraryStateChange({ ...libraryState, selection: { kind, value: category.value, label: category.label } })
  const filteredRecipes = (() => {
    if (libraryState.selection) {
      const { kind, value } = libraryState.selection
      if (kind === 'dishType') return recipes.filter((recipe) => value === '' ? !recipe.dishTypes.length : recipe.dishTypes.some((item) => item.toLocaleLowerCase() === value))
      if (kind === 'meal') return recipes.filter((recipe) => recipe.mealTypes.includes(value as MealType))
      return recipes.filter((recipe) => recipe.tags.some((tag) => tag.toLocaleLowerCase() === value))
    }
    if (libraryState.view === 'favorites') return recipes.filter((recipe) => recipe.favorite)
    if (libraryState.view === 'all' && libraryState.mealFilter) return recipes.filter((recipe) => recipe.mealTypes.includes(libraryState.mealFilter!))
    return recipes
  })()

  const renderRecipeList = (emptyMessage: string, emptyDetail = 'Add details while editing a recipe, or choose another view.') => filteredRecipes.length ? <section className="recipe-list" aria-label="Recipes">
    <p className="count-label">{filteredRecipes.length} {filteredRecipes.length === 1 ? 'recipe' : 'recipes'}</p>
    {filteredRecipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} onOpen={() => onOpen(recipe.id)} onToggleFavorite={() => onToggleFavorite(recipe)} />)}
  </section> : <div className="status-card"><strong>{emptyMessage}</strong><span>{emptyDetail}</span></div>

  return <div className="page">
    <header className="page-header home-header">
      <div><span className="eyebrow">My kitchen</span><h1>Recipes</h1></div>
      <button className="icon-button accent" onClick={onAdd} aria-label="Add recipe"><PlusIcon /></button>
    </header>

    {!loading && recipes.length > 0 && <nav className="library-tabs" aria-label="Recipe views">
      <button className={libraryState.view === 'all' ? 'active' : ''} onClick={() => setView('all')}><GridIcon size={17} /> All</button>
      <button className={libraryState.view === 'types' ? 'active' : ''} onClick={() => setView('types')}>Types</button>
      <button className={libraryState.view === 'tags' ? 'active' : ''} onClick={() => setView('tags')}><TagIcon size={16} /> Tags</button>
      <button className={libraryState.view === 'favorites' ? 'active' : ''} onClick={() => setView('favorites')}><StarIcon size={16} /> Favorites</button>
    </nav>}

    {loading ? <div className="status-card">Opening your recipe book…</div>
      : !recipes.length ? <section className="empty-state">
        <div className="empty-illustration" aria-hidden="true"><span>🥄</span><span>🥕</span><span>🍋</span></div>
        <h2>Your recipes, right at hand</h2>
        <p>Save your first recipe. It stays private on this device and works offline.</p>
        <button className="primary-button" onClick={onAdd}><PlusIcon size={20} /> Add your first recipe</button>
        <div className="privacy-note"><SearchIcon size={17} /> Search by what’s in your kitchen later.</div>
      </section>
      : libraryState.selection ? <>
        <button className="browse-back" onClick={() => onLibraryStateChange({ ...libraryState, selection: null })}>‹ Back to {libraryState.view === 'types' ? 'types' : 'tags'}</button>
        <div className="browse-heading"><span>{libraryState.selection.kind === 'meal' ? 'Meal' : libraryState.selection.kind === 'tag' ? 'Tag' : 'Dish type'}</span><h2>{libraryState.selection.label}</h2></div>
        {renderRecipeList('No recipes in this category')}
      </>
      : libraryState.view === 'all' ? <>
        <div className="meal-filters" aria-label="Filter by meal"><button className={!libraryState.mealFilter ? 'active' : ''} onClick={() => onLibraryStateChange({ ...libraryState, mealFilter: null })}>All meals</button>{MEAL_TYPES.map((meal) => <button key={meal} className={libraryState.mealFilter === meal ? 'active' : ''} onClick={() => onLibraryStateChange({ ...libraryState, mealFilter: meal })}>{titleCase(meal)}</button>)}</div>
        {renderRecipeList('No recipes for this meal')}
      </>
      : libraryState.view === 'types' ? <div className="browse-groups">
        <section><div className="browse-heading"><span>What it is</span><h2>Dish types</h2></div><CategoryGrid categories={[...dishTypes, ...(uncategorizedCount ? [{ label: 'Uncategorized', value: '', count: uncategorizedCount }] : [])]} emptyText="Dish types you add to recipes will appear here." onSelect={(category) => select('dishType', category)} /></section>
        <section><div className="browse-heading"><span>When to serve it</span><h2>Meals</h2></div><CategoryGrid categories={meals} emptyText="Meal occasions you select will appear here." onSelect={(category) => select('meal', category)} /></section>
      </div>
      : libraryState.view === 'tags' ? <><div className="browse-heading"><span>Your collection</span><h2>Tags</h2></div><CategoryGrid categories={tags} emptyText="Tags you add to recipes will appear here." onSelect={(category) => select('tag', category)} /></>
      : renderRecipeList('No favorites yet', 'Tap the star on a recipe to keep it close at hand.')}
  </div>
}
