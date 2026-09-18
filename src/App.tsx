import { useEffect, useRef, useState } from 'react'
import type { ImportWarning, PhotoUpdate, Recipe, RecipeDraft } from './types'
import { cleanupInactiveDatabases, deleteRecipe, getRecipes, saveRecipe, setRecipeFavorite } from './lib/database'
import { Layout, type Tab } from './components/Layout'
import { RecipesPage, type LibraryState } from './pages/RecipesPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { RecipeDetailsPage } from './pages/RecipeDetailsPage'
import { RecipeFormPage } from './pages/RecipeFormPage'
import { RecipeImportPage, type RecipeImportInput } from './pages/RecipeImportPage'
import { parseRecipeText } from './lib/recipeImport'
import { requestPersistentStorage } from './lib/storage'

type View =
  | { kind: 'tab'; tab: Tab }
  | { kind: 'details'; id: string; from: Tab }
  | { kind: 'import'; from: Tab }
  | { kind: 'form'; id?: string; from: Tab; initialDraft?: RecipeDraft; importWarnings?: ImportWarning[] }

const emptyImportInput = (): RecipeImportInput => ({ text: '', sourceName: '', sourceUrl: '' })

function AddRecipeDialog({ onManual, onImport, onClose }: { onManual: () => void; onImport: () => void; onClose: () => void }) {
  const manualButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    manualButton.current?.focus()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose])
  return <div className="choice-backdrop" onMouseDown={onClose}>
    <section className="choice-dialog" role="dialog" aria-modal="true" aria-labelledby="add-recipe-title" onMouseDown={(event) => event.stopPropagation()}>
      <div><span className="eyebrow">Add a recipe</span><h2 id="add-recipe-title">How would you like to start?</h2></div>
      <button ref={manualButton} className="choice-option" onClick={onManual}><strong>Enter manually</strong><span>Start with a blank recipe.</span></button>
      <button className="choice-option" onClick={onImport}><strong>Import from text</strong><span>Paste a recipe and review the filled-in details.</span></button>
      <button className="text-button choice-cancel" onClick={onClose}>Cancel</button>
    </section>
  </div>
}

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>({ kind: 'tab', tab: 'recipes' })
  const [fatalError, setFatalError] = useState('')
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [libraryState, setLibraryState] = useState<LibraryState>({ view: 'all', selection: null, mealFilter: null })
  const [addChoiceOpen, setAddChoiceOpen] = useState(false)
  const [importInput, setImportInput] = useState<RecipeImportInput>(emptyImportInput)
  const [importError, setImportError] = useState('')

  const refresh = async () => { setRecipes(await getRecipes()) }
  useEffect(() => {
    getRecipes()
      .then(setRecipes)
      .catch((error) => setFatalError(error instanceof Error ? error.message : 'Local storage is unavailable.'))
      .finally(() => { setLoading(false); void cleanupInactiveDatabases() })
  }, [])
  useEffect(() => {
    const handler = () => setFatalError('The recipe library changed in another window. Reload Pantry Book to continue safely.')
    window.addEventListener('pantry-book-library-changed', handler)
    return () => window.removeEventListener('pantry-book-library-changed', handler)
  }, [])
  useEffect(() => {
    const handler = (event: Event) => setWaitingWorker((event as CustomEvent<ServiceWorker>).detail)
    window.addEventListener('pwa-update-ready', handler)
    return () => window.removeEventListener('pwa-update-ready', handler)
  }, [])

  const activeTab = view.kind === 'tab' ? view.tab : view.from
  const selected = (view.kind === 'details' || view.kind === 'form') && view.id ? recipes.find((recipe) => recipe.id === view.id) : undefined
  const openRecipe = (id: string, from: Tab = activeTab) => setView({ kind: 'details', id, from })
  const toggleFavorite = async (recipe: Recipe) => {
    await setRecipeFavorite(recipe.id, !recipe.favorite)
    setRecipes((current) => current.map((item) => item.id === recipe.id ? { ...item, favorite: !item.favorite } : item))
  }
  const dishTypeSuggestions = [...new Set(recipes.flatMap((recipe) => recipe.dishTypes))].sort((a, b) => a.localeCompare(b))
  const tagSuggestions = [...new Set(recipes.flatMap((recipe) => recipe.tags))].sort((a, b) => a.localeCompare(b))
  const content = (() => {
    if (fatalError) return <div className="page"><div className="error-message"><strong>Pantry Book couldn’t open.</strong><br />{fatalError}<br /><button className="secondary-button" onClick={() => window.location.reload()}>Reload Pantry Book</button></div></div>
    if (view.kind === 'details' && selected) return <RecipeDetailsPage recipe={selected} onBack={() => setView({ kind: 'tab', tab: view.from })} onEdit={() => setView({ kind: 'form', id: selected.id, from: view.from })} onToggleFavorite={() => void toggleFavorite(selected)} onDelete={async () => { if (confirm(`Delete “${selected.name}”?`)) { await deleteRecipe(selected.id); await refresh(); setView({ kind: 'tab', tab: 'recipes' }) } }} />
    if (view.kind === 'import') return <RecipeImportPage value={importInput} error={importError} onChange={(input) => { setImportInput(input); setImportError('') }} onCancel={() => setView({ kind: 'tab', tab: view.from })} onReview={() => {
      try {
        const result = parseRecipeText(importInput.text, importInput)
        setImportError('')
        setView({ kind: 'form', from: view.from, initialDraft: result.draft, importWarnings: result.warnings })
      } catch (error) { setImportError(error instanceof Error ? error.message : 'Couldn’t read that recipe text.') }
    }} />
    if (view.kind === 'form' && (!view.id || selected)) return <RecipeFormPage recipe={selected} initialDraft={view.initialDraft} importWarnings={view.importWarnings} dishTypeSuggestions={dishTypeSuggestions} tagSuggestions={tagSuggestions} onCancel={() => setView(view.id ? { kind: 'details', id: view.id, from: view.from } : view.initialDraft ? { kind: 'import', from: view.from } : { kind: 'tab', tab: view.from })} onSave={async (draft: RecipeDraft, photoUpdate: PhotoUpdate) => { const saved = await saveRecipe(draft, photoUpdate, selected); if (photoUpdate.kind === 'replace') void requestPersistentStorage(); await refresh(); if (view.initialDraft) setImportInput(emptyImportInput()); setView({ kind: 'details', id: saved.id, from: view.from }) }} />
    if (view.kind !== 'tab') return <div className="page"><div className="status-card">Opening recipe…</div></div>
    if (view.tab === 'search') return <SearchPage recipes={recipes} onOpen={(id) => openRecipe(id, 'search')} onToggleFavorite={(recipe) => void toggleFavorite(recipe)} />
    if (view.tab === 'settings') return <SettingsPage recipeCount={recipes.length} onImported={refresh} />
    return <RecipesPage recipes={recipes} loading={loading} libraryState={libraryState} onLibraryStateChange={setLibraryState} onAdd={() => setAddChoiceOpen(true)} onOpen={(id) => openRecipe(id, 'recipes')} onToggleFavorite={(recipe) => void toggleFavorite(recipe)} />
  })()

  return <><Layout activeTab={activeTab} onTabChange={(tab) => { setAddChoiceOpen(false); setView({ kind: 'tab', tab }) }} updateAvailable={Boolean(waitingWorker)} onUpdate={() => waitingWorker?.postMessage({ type: 'SKIP_WAITING' })}>{content}</Layout>
    {addChoiceOpen && <AddRecipeDialog onClose={() => setAddChoiceOpen(false)} onManual={() => { setAddChoiceOpen(false); setView({ kind: 'form', from: 'recipes' }) }} onImport={() => { setAddChoiceOpen(false); setImportError(''); setView({ kind: 'import', from: 'recipes' }) }} />}
  </>
}
