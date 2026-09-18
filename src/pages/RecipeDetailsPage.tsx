import type { Recipe } from '../types'
import { ArrowLeftIcon, ClockIcon, MoreIcon, StarIcon, TrashIcon } from '../components/Icons'

interface Props {
  recipe: Recipe
  onBack: () => void
  onEdit: () => void
  onToggleFavorite: () => void
  onDelete: () => void
}

const titleCase = (value: string) => value[0].toUpperCase() + value.slice(1)

export function RecipeDetailsPage({ recipe, onBack, onEdit, onToggleFavorite, onDelete }: Props) {
  const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
  return (
    <div className="page detail-page">
      <header className="detail-toolbar">
        <button className="icon-button" onClick={onBack} aria-label="Back"><ArrowLeftIcon /></button>
        <div className="detail-actions">
          <button className={recipe.favorite ? 'icon-button favorite active' : 'icon-button favorite'} onClick={onToggleFavorite} aria-label={recipe.favorite ? 'Remove from favorites' : 'Add to favorites'}><StarIcon size={21} filled={recipe.favorite} /></button>
          <button className="text-button" onClick={onEdit}>Edit</button>
        </div>
      </header>
      <section className="detail-hero">
        <div className="recipe-mark" aria-hidden="true">{recipe.name.slice(0, 1).toUpperCase()}</div>
        <h1>{recipe.name}</h1>
        {recipe.description && <p>{recipe.description}</p>}
        <div className="detail-stats">
          {recipe.prepMinutes !== null && <span><small>Prep</small>{recipe.prepMinutes} min</span>}
          {recipe.cookMinutes !== null && <span><small>Cook</small>{recipe.cookMinutes} min</span>}
          {total > 0 && <span><small>Total</small><ClockIcon size={17} /> {total} min</span>}
          {recipe.servings !== null && <span><small>Serves</small>{recipe.servings}</span>}
        </div>
        {(recipe.dishTypes.length > 0 || recipe.mealTypes.length > 0 || recipe.tags.length > 0) && <div className="classification-groups">
          {recipe.dishTypes.length > 0 && <div><small>Dish type</small><div className="tag-row">{recipe.dishTypes.map((type) => <span key={type}>{type}</span>)}</div></div>}
          {recipe.mealTypes.length > 0 && <div><small>Meals</small><div className="tag-row meals">{recipe.mealTypes.map((meal) => <span key={meal}>{titleCase(meal)}</span>)}</div></div>}
          {recipe.tags.length > 0 && <div><small>Tags</small><div className="tag-row tags">{recipe.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>}
        </div>}
      </section>

      <section className="detail-section">
        <h2>Ingredients</h2>
        <ul className="ingredient-display">
          {recipe.ingredients.map((ingredient) => (
            <li key={ingredient.id}><span>{ingredient.quantity} {ingredient.unit}</span><strong>{ingredient.name}</strong></li>
          ))}
        </ul>
      </section>

      <section className="detail-section">
        <h2>Method</h2>
        <ol className="steps-display">
          {recipe.instructions.map((step, index) => <li key={`${index}-${step}`}><span>{index + 1}</span><p>{step}</p></li>)}
        </ol>
      </section>

      {(recipe.notes || recipe.sourceName || recipe.sourceUrl) && <section className="detail-section">
        {recipe.notes && <><h2>Notes</h2><p className="notes-text">{recipe.notes}</p></>}
        {(recipe.sourceName || recipe.sourceUrl) && <p className="source-line">Source: {recipe.sourceUrl ? <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">{recipe.sourceName || recipe.sourceUrl}</a> : recipe.sourceName}</p>}
      </section>}

      <section className="detail-section subtle-section">
        <span><MoreIcon size={18} /> Last edited {new Date(recipe.modifiedAt).toLocaleDateString()}</span>
        <button className="danger-button" onClick={onDelete}><TrashIcon size={19} /> Delete recipe</button>
      </section>
    </div>
  )
}
