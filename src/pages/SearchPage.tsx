import { useMemo, useState } from 'react'
import type { Recipe } from '../types'
import type { MatchMode } from '../lib/search'
import { searchRecipes, searchRecipesByIngredients } from '../lib/search'
import { CloseIcon, PlusIcon, SearchIcon } from '../components/Icons'
import { RecipeCard } from '../components/RecipeCard'
import { ProgressiveList } from '../components/ProgressiveList'

type SearchMode = 'recipes' | 'ingredients'

interface Props {
  recipes: Recipe[]
  onOpen: (id: string) => void
  onToggleFavorite: (recipe: Recipe) => void
}

function popularLabels(recipes: Recipe[]): string[] {
  const counts = new Map<string, { label: string; count: number }>()
  recipes.flatMap((recipe) => [...recipe.tags, ...recipe.dishTypes]).forEach((label) => {
    const key = label.toLocaleLowerCase()
    const current = counts.get(key)
    counts.set(key, { label: current?.label ?? label, count: (current?.count ?? 0) + 1 })
  })
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 10).map((item) => item.label)
}

export function SearchPage({ recipes, onOpen, onToggleFavorite }: Props) {
  const [mode, setMode] = useState<SearchMode>('recipes')
  const [query, setQuery] = useState('')
  const [ingredientValue, setIngredientValue] = useState('')
  const [ingredients, setIngredients] = useState<string[]>([])
  const [matchMode, setMatchMode] = useState<MatchMode>('all')
  const results = useMemo(() => searchRecipes(recipes, query), [recipes, query])
  const ingredientResults = useMemo(() => searchRecipesByIngredients(recipes, ingredients, matchMode), [recipes, ingredients, matchMode])
  const suggestions = useMemo(() => popularLabels(recipes), [recipes])

  const addIngredient = () => {
    const name = ingredientValue.trim()
    if (name && !ingredients.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())) setIngredients([...ingredients, name])
    setIngredientValue('')
  }

  return <div className="page">
    <header className="page-header"><div><span className="eyebrow">Find something good</span><h1>Search</h1></div></header>
    <div className="search-mode-tabs" role="tablist" aria-label="Search mode">
      <button role="tab" aria-selected={mode === 'recipes'} className={mode === 'recipes' ? 'active' : ''} onClick={() => setMode('recipes')}>Recipes</button>
      <button role="tab" aria-selected={mode === 'ingredients'} className={mode === 'ingredients' ? 'active' : ''} onClick={() => setMode('ingredients')}>By ingredients</button>
    </div>

    {mode === 'recipes' ? <>
      <section className="search-panel">
        <label className="search-input recipe-query"><SearchIcon size={20} /><input aria-label="Search recipes" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recipes, tags, or types" />{query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><CloseIcon size={18} /></button>}</label>
      </section>
      {!query.trim() ? <section className="search-placeholder compact">
        <div><SearchIcon size={31} /></div><h2>Search your whole recipe book</h2><p>Try a recipe name, tag, dish type, meal, or ingredient.</p>
        {suggestions.length > 0 && <div className="search-suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => setQuery(suggestion)}>{suggestion}</button>)}</div>}
      </section>
      : results.length ? <ProgressiveList key={`recipes:${query}`} items={results} itemKey={({ recipe }) => recipe.id} renderItem={({ recipe }) => <RecipeCard recipe={recipe} onOpen={() => onOpen(recipe.id)} onToggleFavorite={() => onToggleFavorite(recipe)} />} label={results.length === 1 ? 'result' : 'results'} />
      : <section className="status-card"><strong>No recipes found</strong><span>Try fewer words or a different tag.</span></section>}
    </> : <>
      <section className="search-panel">
        <label className="search-input"><SearchIcon size={20} /><input value={ingredientValue} onChange={(event) => setIngredientValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addIngredient() } }} placeholder="Type an ingredient" /><button onClick={addIngredient} aria-label="Add ingredient"><PlusIcon size={19} /></button></label>
        <div className="query-chips">{ingredients.map((item) => <button key={item} onClick={() => setIngredients(ingredients.filter((value) => value !== item))}>{item}<CloseIcon size={15} /></button>)}</div>
        {ingredients.length > 0 && <label className="mode-select">Show recipes that match <select value={matchMode} onChange={(event) => setMatchMode(event.target.value as MatchMode)}><option value="all">all ingredients</option><option value="any">any ingredient</option></select></label>}
      </section>
      {!ingredients.length ? <section className="search-placeholder"><div><SearchIcon size={31} /></div><h2>What’s in your kitchen?</h2><p>Add two or three ingredients to find recipes you can make.</p></section>
        : ingredientResults.length ? <ProgressiveList key={`ingredients:${matchMode}:${ingredients.join('|')}`} items={ingredientResults} itemKey={({ recipe }) => recipe.id} renderItem={(result) => <RecipeCard recipe={result.recipe} onOpen={() => onOpen(result.recipe.id)} onToggleFavorite={() => onToggleFavorite(result.recipe)} matchLabel={`${result.matchedIngredients.length}/${ingredients.length} matched`} />} label={ingredientResults.length === 1 ? 'match' : 'matches'} />
        : <section className="status-card"><strong>No matches yet</strong><span>Try “any ingredient” or remove one of your choices.</span></section>}
    </>}
  </div>
}
