import type { FormEvent } from 'react'

export interface RecipeImportInput {
  text: string
  sourceName: string
  sourceUrl: string
}

interface Props {
  value: RecipeImportInput
  error: string
  onChange: (value: RecipeImportInput) => void
  onCancel: () => void
  onReview: () => void
}

export function RecipeImportPage({ value, error, onChange, onCancel, onReview }: Props) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onReview()
  }
  return <form className="page import-page" onSubmit={submit}>
    <header className="import-header">
      <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
      <h1>Import recipe</h1>
      <span aria-hidden="true" />
    </header>
    <div className="import-intro">
      <span className="eyebrow">Private & offline</span>
      <h2>Paste the recipe part</h2>
      <p>Include a title, an Ingredients heading, and Instructions or Directions. Pantry Book will fill in what it can for you to review.</p>
    </div>
    {error && <div className="error-message" role="alert">{error}</div>}
    <label className="field import-text-field"><span>Recipe text</span><textarea value={value.text} onChange={(event) => onChange({ ...value, text: event.target.value })} placeholder={'Lemon pasta\n\nIngredients\n8 oz pasta\n...\n\nInstructions\n1. Cook the pasta.'} rows={15} autoFocus /></label>
    <section className="import-source" aria-labelledby="import-source-heading">
      <h2 id="import-source-heading">Source <small>optional</small></h2>
      <label className="field"><span>Source name</span><input value={value.sourceName} onChange={(event) => onChange({ ...value, sourceName: event.target.value })} placeholder="Website, cookbook, or person" /></label>
      <label className="field"><span>Source URL</span><input type="url" inputMode="url" value={value.sourceUrl} onChange={(event) => onChange({ ...value, sourceUrl: event.target.value })} placeholder="https://…" /></label>
    </section>
    <button className="primary-button import-review-button" type="submit">Review import</button>
  </form>
}
