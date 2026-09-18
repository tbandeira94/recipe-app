import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { MEAL_TYPES, type ImportWarning, type Ingredient, type MealType, type Recipe, type RecipeDraft } from '../types'
import { ArrowLeftIcon, CloseIcon, PlusIcon } from '../components/Icons'
import { ChipEditor } from '../components/ChipEditor'
import { prepareRecipePhoto } from '../lib/photo'

interface Props {
  recipe?: Recipe
  initialDraft?: RecipeDraft
  importWarnings?: ImportWarning[]
  dishTypeSuggestions: string[]
  tagSuggestions: string[]
  onCancel: () => void
  onSave: (draft: RecipeDraft) => Promise<void>
}

const emptyIngredient = (): Ingredient => ({ id: crypto.randomUUID(), name: '', normalizedName: '', quantity: '', unit: '' })

function createInitialDraft(recipe?: Recipe, importedDraft?: RecipeDraft): RecipeDraft {
  return recipe ? {
    name: recipe.name, description: recipe.description, photoDataUrl: recipe.photoDataUrl, ingredients: recipe.ingredients.map((item) => ({ ...item })),
    instructions: [...recipe.instructions], prepMinutes: recipe.prepMinutes, cookMinutes: recipe.cookMinutes,
    servings: recipe.servings, dishTypes: [...recipe.dishTypes], mealTypes: [...recipe.mealTypes], tags: [...recipe.tags], favorite: recipe.favorite,
    notes: recipe.notes, sourceName: recipe.sourceName, sourceUrl: recipe.sourceUrl,
  } : importedDraft ? {
    ...importedDraft,
    ingredients: importedDraft.ingredients.map((item) => ({ ...item })),
    instructions: [...importedDraft.instructions], dishTypes: [...importedDraft.dishTypes], mealTypes: [...importedDraft.mealTypes], tags: [...importedDraft.tags],
  } : {
    name: '', description: '', photoDataUrl: null, ingredients: [emptyIngredient()], instructions: [''], prepMinutes: null, cookMinutes: null,
    servings: null, dishTypes: [], mealTypes: [], tags: [], favorite: false, notes: '', sourceName: '', sourceUrl: '',
  }
}

function optionalNumber(value: string): number | null {
  return value === '' ? null : Number(value)
}

const COMMON_DISH_TYPES = ['Main', 'Side', 'Soup', 'Salad', 'Sauce', 'Dessert', 'Bread', 'Drink']
const mealLabel = (meal: MealType) => meal[0].toUpperCase() + meal.slice(1)

export function RecipeFormPage({ recipe, initialDraft, importWarnings = [], dishTypeSuggestions, tagSuggestions, onCancel, onSave }: Props) {
  const [draft, setDraft] = useState(() => createInitialDraft(recipe, initialDraft))
  const [saving, setSaving] = useState(false)
  const [preparingPhoto, setPreparingPhoto] = useState(false)
  const [error, setError] = useState('')
  const photoInput = useRef<HTMLInputElement>(null)

  const updateIngredient = (id: string, field: keyof Ingredient, value: string) => {
    setDraft((current) => ({ ...current, ingredients: current.ingredients.map((item) => item.id === id ? { ...item, [field]: value } : item) }))
  }
  const updateStep = (index: number, value: string) => {
    setDraft((current) => ({ ...current, instructions: current.instructions.map((step, stepIndex) => stepIndex === index ? value : step) }))
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (preparingPhoto) return
    if (!draft.name.trim()) { setError('Give your recipe a name.'); return }
    if (!draft.ingredients.some((item) => item.name.trim())) { setError('Add at least one ingredient.'); return }
    if (!draft.instructions.some((step) => step.trim())) { setError('Add at least one instruction.'); return }
    setSaving(true); setError('')
    try { await onSave(draft) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this recipe.'); setSaving(false) }
  }
  const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPreparingPhoto(true); setError('')
    try {
      const photoDataUrl = await prepareRecipePhoto(file)
      setDraft((current) => ({ ...current, photoDataUrl }))
    }
    catch { setError('That photo couldn’t be opened. Try a different image.') }
    finally { setPreparingPhoto(false) }
  }

  return (
    <form className="page form-page" onSubmit={submit}>
      <header className="form-toolbar">
        <button type="button" className="icon-button" onClick={onCancel} aria-label="Cancel"><ArrowLeftIcon /></button>
        <h1>{recipe ? 'Edit recipe' : 'New recipe'}</h1>
        <button className="text-button" type="submit" disabled={saving || preparingPhoto}>{saving ? 'Saving…' : 'Save'}</button>
      </header>
      {error && <div className="error-message" role="alert">{error}</div>}
      {initialDraft && <section className="import-warning" aria-labelledby="import-warning-title">
        <strong id="import-warning-title">Imported from text — review before saving</strong>
        {importWarnings.length > 0 ? <ul>{importWarnings.map((warning, index) => <li key={`${warning.field}-${warning.index ?? ''}-${index}`}>{warning.message}</li>)}</ul> : <p>Check the details below; anything uncertain was left for you to decide.</p>}
      </section>}
      <input ref={photoInput} className="visually-hidden" type="file" accept="image/*" aria-label="Choose recipe photo" onChange={(event) => void selectPhoto(event)} />

      <section className="form-section">
        <label className="field"><span>Recipe name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Lemon pasta" autoFocus /></label>
        <label className="field"><span>Description <small>optional</small></span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="A quick note about this recipe" rows={3} /></label>
        <div className="photo-field">
          <span className="field-label">Photo <small>optional</small></span>
          <div className="photo-control">
            {draft.photoDataUrl ? <img src={draft.photoDataUrl} alt="" className="photo-form-preview" /> : <div className="photo-placeholder" aria-hidden="true">{draft.name.slice(0, 1).toUpperCase() || 'R'}</div>}
            <div className="photo-actions">
              <button type="button" className="secondary-button" disabled={preparingPhoto} onClick={() => photoInput.current?.click()}>{preparingPhoto ? 'Preparing photo…' : draft.photoDataUrl ? 'Replace photo' : 'Add photo'}</button>
              {draft.photoDataUrl && <button type="button" className="photo-remove-button" disabled={preparingPhoto} onClick={() => setDraft({ ...draft, photoDataUrl: null })}>Remove photo</button>}
            </div>
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="section-heading"><div><span className="section-number">1</span><h2>Ingredients</h2></div></div>
        <div className="ingredient-labels"><span>Amount</span><span>Unit</span><span>Ingredient</span></div>
        {draft.ingredients.map((item) => <div className="ingredient-row" key={item.id}>
          <input aria-label="Quantity" value={item.quantity} onChange={(event) => updateIngredient(item.id, 'quantity', event.target.value)} placeholder="1½" />
          <input aria-label="Unit" value={item.unit} onChange={(event) => updateIngredient(item.id, 'unit', event.target.value)} placeholder="cups" />
          <input aria-label="Ingredient name" value={item.name} onChange={(event) => updateIngredient(item.id, 'name', event.target.value)} placeholder="flour" />
          <button type="button" className="remove-button" aria-label="Remove ingredient" disabled={draft.ingredients.length === 1} onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((ingredient) => ingredient.id !== item.id) })}><CloseIcon size={18} /></button>
        </div>)}
        <button type="button" className="add-row-button" onClick={() => setDraft({ ...draft, ingredients: [...draft.ingredients, emptyIngredient()] })}><PlusIcon size={19} /> Add ingredient</button>
      </section>

      <section className="form-section">
        <div className="section-heading"><div><span className="section-number">2</span><h2>Method</h2></div></div>
        {draft.instructions.map((step, index) => <div className="step-row" key={index}>
          <span>{index + 1}</span><textarea aria-label={`Step ${index + 1}`} value={step} onChange={(event) => updateStep(index, event.target.value)} placeholder="Describe this step" rows={3} />
          <button type="button" className="remove-button" aria-label="Remove step" disabled={draft.instructions.length === 1} onClick={() => setDraft({ ...draft, instructions: draft.instructions.filter((_, stepIndex) => stepIndex !== index) })}><CloseIcon size={18} /></button>
        </div>)}
        <button type="button" className="add-row-button" onClick={() => setDraft({ ...draft, instructions: [...draft.instructions, ''] })}><PlusIcon size={19} /> Add step</button>
      </section>

      <section className="form-section">
        <div className="section-heading"><div><span className="section-number">3</span><h2>Details</h2></div></div>
        <div className="number-grid">
          <label className="field"><span>Prep minutes</span><input type="number" min="0" inputMode="numeric" value={draft.prepMinutes ?? ''} onChange={(e) => setDraft({ ...draft, prepMinutes: optionalNumber(e.target.value) })} /></label>
          <label className="field"><span>Cook minutes</span><input type="number" min="0" inputMode="numeric" value={draft.cookMinutes ?? ''} onChange={(e) => setDraft({ ...draft, cookMinutes: optionalNumber(e.target.value) })} /></label>
          <label className="field"><span>Servings</span><input type="number" min="0" inputMode="numeric" value={draft.servings ?? ''} onChange={(e) => setDraft({ ...draft, servings: optionalNumber(e.target.value) })} /></label>
        </div>
        <ChipEditor label="Dish types" values={draft.dishTypes} suggestions={[...COMMON_DISH_TYPES, ...dishTypeSuggestions]} placeholder="Add or create a dish type" onChange={(dishTypes) => setDraft({ ...draft, dishTypes })} />
        <div className="meal-picker">
          <span className="field-label">Meals</span>
          <div className="toggle-chips">
            {MEAL_TYPES.map((meal) => <button type="button" key={meal} className={draft.mealTypes.includes(meal) ? 'selected' : ''} aria-pressed={draft.mealTypes.includes(meal)} onClick={() => setDraft({ ...draft, mealTypes: draft.mealTypes.includes(meal) ? draft.mealTypes.filter((item) => item !== meal) : [...draft.mealTypes, meal] })}>{mealLabel(meal)}</button>)}
          </div>
        </div>
        <ChipEditor label="Tags" values={draft.tags} suggestions={tagSuggestions} placeholder="Add a tag" onChange={(tags) => setDraft({ ...draft, tags })} />
        <label className="field"><span>Notes</span><textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3} placeholder="Substitutions, tips, or reminders" /></label>
        <label className="field"><span>Source name</span><input value={draft.sourceName} onChange={(e) => setDraft({ ...draft, sourceName: e.target.value })} placeholder="Grandma, cookbook, website…" /></label>
        <label className="field"><span>Source URL</span><input type="url" inputMode="url" value={draft.sourceUrl} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} placeholder="https://…" /></label>
      </section>
      <button className="primary-button form-submit" type="submit" disabled={saving || preparingPhoto}>{saving ? 'Saving recipe…' : 'Save recipe'}</button>
    </form>
  )
}
