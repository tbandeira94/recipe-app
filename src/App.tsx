import { useEffect, useState } from 'react'
import type { Recipe, RecipeDraft } from './types'
import { deleteRecipe, getRecipes, saveRecipe, setRecipeFavorite } from './lib/database'
import { Layout, type Tab } from './components/Layout'
import { RecipesPage, type LibraryState } from './pages/RecipesPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { RecipeDetailsPage } from './pages/RecipeDetailsPage'
import { RecipeFormPage } from './pages/RecipeFormPage'

type View = { kind: 'tab'; tab: Tab } | { kind: 'details'; id: string; from: Tab } | { kind: 'form'; id?: string; from: Tab }

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>({ kind: 'tab', tab: 'recipes' })
  const [fatalError, setFatalError] = useState('')
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [libraryState, setLibraryState] = useState<LibraryState>({ view: 'all', selection: null, mealFilter: null })

  const refresh = async () => { setRecipes(await getRecipes()) }
  useEffect(() => {
    getRecipes()
      .then(setRecipes)
      .catch((error) => setFatalError(error instanceof Error ? error.message : 'Local storage is unavailable.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    const handler = (event: Event) => setWaitingWorker((event as CustomEvent<ServiceWorker>).detail)
    window.addEventListener('pwa-update-ready', handler)
    return () => window.removeEventListener('pwa-update-ready', handler)
  }, [])

  const activeTab = view.kind === 'tab' ? view.tab : view.from
  const selected = view.kind !== 'tab' && view.id ? recipes.find((recipe) => recipe.id === view.id) : undefined
  const openRecipe = (id: string, from: Tab = activeTab) => setView({ kind: 'details', id, from })
  const toggleFavorite = async (recipe: Recipe) => {
    await setRecipeFavorite(recipe.id, !recipe.favorite)
    setRecipes((current) => current.map((item) => item.id === recipe.id ? { ...item, favorite: !item.favorite } : item))
  }
  const dishTypeSuggestions = [...new Set(recipes.flatMap((recipe) => recipe.dishTypes))].sort((a, b) => a.localeCompare(b))
  const tagSuggestions = [...new Set(recipes.flatMap((recipe) => recipe.tags))].sort((a, b) => a.localeCompare(b))
  const content = (() => {
    if (fatalError) return <div className="page"><div className="error-message"><strong>Pantry Book couldn’t open.</strong><br />{fatalError}</div></div>
    if (view.kind === 'details' && selected) return <RecipeDetailsPage recipe={selected} onBack={() => setView({ kind: 'tab', tab: view.from })} onEdit={() => setView({ kind: 'form', id: selected.id, from: view.from })} onToggleFavorite={() => void toggleFavorite(selected)} onDelete={async () => { if (confirm(`Delete “${selected.name}”?`)) { await deleteRecipe(selected.id); await refresh(); setView({ kind: 'tab', tab: 'recipes' }) } }} />
    if (view.kind === 'form' && (!view.id || selected)) return <RecipeFormPage recipe={selected} dishTypeSuggestions={dishTypeSuggestions} tagSuggestions={tagSuggestions} onCancel={() => setView(view.id ? { kind: 'details', id: view.id, from: view.from } : { kind: 'tab', tab: view.from })} onSave={async (draft: RecipeDraft) => { const saved = await saveRecipe(draft, selected); await refresh(); setView({ kind: 'details', id: saved.id, from: view.from }) }} />
    if (view.kind !== 'tab') return <div className="page"><div className="status-card">Opening recipe…</div></div>
    if (view.tab === 'search') return <SearchPage recipes={recipes} onOpen={(id) => openRecipe(id, 'search')} onToggleFavorite={(recipe) => void toggleFavorite(recipe)} />
    if (view.tab === 'settings') return <SettingsPage recipeCount={recipes.length} onImported={refresh} />
    return <RecipesPage recipes={recipes} loading={loading} libraryState={libraryState} onLibraryStateChange={setLibraryState} onAdd={() => setView({ kind: 'form', from: 'recipes' })} onOpen={(id) => openRecipe(id, 'recipes')} onToggleFavorite={(recipe) => void toggleFavorite(recipe)} />
  })()

  return <Layout activeTab={activeTab} onTabChange={(tab) => setView({ kind: 'tab', tab })} updateAvailable={Boolean(waitingWorker)} onUpdate={() => waitingWorker?.postMessage({ type: 'SKIP_WAITING' })}>{content}</Layout>
}
