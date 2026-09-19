import { useCallback, useMemo } from 'react'
import type { Recipe } from '../types'
import type { MatchMode } from '../lib/search'
import { searchRecipes, searchRecipesByIngredients } from '../lib/search'
import { CloseIcon, PlusIcon, SearchIcon } from '../components/Icons'
import { RecipeCard } from '../components/RecipeCard'
import { ProgressiveList } from '../components/ProgressiveList'

export type SearchMode = 'recipes' | 'ingredients'

export interface SearchState {
  mode: SearchMode
  query: string
  ingredientValue: string
  ingredients: string[]
  matchMode: MatchMode
  recipeResultLimit: number
  ingredientResultLimit: number
}

interface Props {
  recipes: Recipe[]
  searchState: SearchState
  onSearchStateChange: (state: SearchState) => void
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

export function SearchPage({ recipes, searchState, onSearchStateChange, onOpen, onToggleFavorite }: Props) {
  const { mode, query, ingredientValue, ingredients, matchMode, recipeResultLimit, ingredientResultLimit } = searchState
  const results = useMemo(() => searchRecipes(recipes, query), [recipes, query])
  const ingredientResults = useMemo(() => searchRecipesByIngredients(recipes, ingredients, matchMode), [recipes, ingredients, matchMode])
  const suggestions = useMemo(() => popularLabels(recipes), [recipes])
  const updateRecipeResultLimit = useCallback((limit: number) => {
    if (limit !== searchState.recipeResultLimit) onSearchStateChange({ ...searchState, recipeResultLimit: limit })
  }, [onSearchStateChange, searchState])
  const updateIngredientResultLimit = useCallback((limit: number) => {
    if (limit !== searchState.ingredientResultLimit) onSearchStateChange({ ...searchState, ingredientResultLimit: limit })
  }, [onSearchStateChange, searchState])

  const addIngredient = () => {
    const name = ingredientValue.trim()
    const nextIngredients = name && !ingredients.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase()) ? [...ingredients, name] : ingredients
    onSearchStateChange({ ...searchState, ingredients: nextIngredients, ingredientValue: '' })
  }

  return <div className="page">
    <header className="page-header"><div><span className="eyebrow">Find something good</span><h1>Search</h1></div></header>
    <div className="search-mode-tabs" role="tablist" aria-label="Search mode">
      <button role="tab" aria-selected={mode === 'recipes'} className={mode === 'recipes' ? 'active' : ''} onClick={() => onSearchStateChange({ ...searchState, mode: 'recipes' })}>Recipes</button>
      <button role="tab" aria-selected={mode === 'ingredients'} className={mode === 'ingredients' ? 'active' : ''} onClick={() => onSearchStateChange({ ...searchState, mode: 'ingredients' })}>By ingredients</button>
    </div>

    {mode === 'recipes' ? <>
      <section className="search-panel">
        <label className="search-input recipe-query"><SearchIcon size={20} /><input aria-label="Search recipes" value={query} onChange={(event) => onSearchStateChange({ ...searchState, query: event.target.value })} placeholder="Search recipes, tags, or types" />{query && <button className="clear-search" onClick={() => onSearchStateChange({ ...searchState, query: '' })} aria-label="Clear search"><CloseIcon size={18} /></button>}</label>
      </section>
      {!query.trim() ? <section className="search-placeholder compact">
        <div><SearchIcon size={31} /></div><h2>Search your whole recipe book</h2><p>Try a recipe name, tag, dish type, meal, or ingredient.</p>
        {suggestions.length > 0 && <div className="search-suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => onSearchStateChange({ ...searchState, query: suggestion })}>{suggestion}</button>)}</div>}
      </section>
      : results.length ? <ProgressiveList key={`recipes:${query}`} items={results} initialLimit={recipeResultLimit} onLimitChange={updateRecipeResultLimit} itemKey={({ recipe }) => recipe.id} renderItem={({ recipe }) => <RecipeCard recipe={recipe} onOpen={() => onOpen(recipe.id)} onToggleFavorite={() => onToggleFavorite(recipe)} />} label={results.length === 1 ? 'result' : 'results'} />
      : <section className="status-card"><strong>No recipes found</strong><span>Try fewer words or a different tag.</span></section>}
    </> : <>
      <section className="search-panel">
        <label className="search-input"><SearchIcon size={20} /><input value={ingredientValue} onChange={(event) => onSearchStateChange({ ...searchState, ingredientValue: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addIngredient() } }} placeholder="Type an ingredient" /><button onClick={addIngredient} aria-label="Add ingredient"><PlusIcon size={19} /></button></label>
        <div className="query-chips">{ingredients.map((item) => <button key={item} onClick={() => onSearchStateChange({ ...searchState, ingredients: ingredients.filter((value) => value !== item) })}>{item}<CloseIcon size={15} /></button>)}</div>
        {ingredients.length > 0 && <label className="mode-select">Show recipes that match <select value={matchMode} onChange={(event) => onSearchStateChange({ ...searchState, matchMode: event.target.value as MatchMode })}><option value="all">all ingredients</option><option value="any">any ingredient</option></select></label>}
      </section>
      {!ingredients.length ? <section className="search-placeholder"><div><SearchIcon size={31} /></div><h2>What’s in your kitchen?</h2><p>Add two or three ingredients to find recipes you can make.</p></section>
        : ingredientResults.length ? <ProgressiveList key={`ingredients:${matchMode}:${ingredients.join('|')}`} items={ingredientResults} initialLimit={ingredientResultLimit} onLimitChange={updateIngredientResultLimit} itemKey={({ recipe }) => recipe.id} renderItem={(result) => <RecipeCard recipe={result.recipe} onOpen={() => onOpen(result.recipe.id)} onToggleFavorite={() => onToggleFavorite(result.recipe)} matchLabel={`${result.matchedIngredients.length}/${ingredients.length} matched`} />} label={ingredientResults.length === 1 ? 'match' : 'matches'} />
        : <section className="status-card"><strong>No matches yet</strong><span>Try “any ingredient” or remove one of your choices.</span></section>}
    </>}
  </div>
}
