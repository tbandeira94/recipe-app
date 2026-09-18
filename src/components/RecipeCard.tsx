import type { Recipe } from '../types'
import { ClockIcon, StarIcon } from './Icons'

interface RecipeCardProps {
  recipe: Recipe
  onOpen: () => void
  onToggleFavorite?: () => void
  matchLabel?: string
}

export function RecipeCard({ recipe, onOpen, onToggleFavorite, matchLabel }: RecipeCardProps) {
  const totalTime = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
  return (
    <article className="recipe-card">
      <button className="recipe-card-open" onClick={onOpen}>
        {recipe.photoDataUrl ? <img className="recipe-thumbnail" src={recipe.photoDataUrl} alt="" /> : <span className="recipe-thumbnail recipe-thumbnail-placeholder" aria-hidden="true">{recipe.name.slice(0, 1).toUpperCase()}</span>}
        <span className="recipe-card-main">
        <strong>{recipe.name}</strong>
        {recipe.description && <span className="card-description">{recipe.description}</span>}
        <span className="card-meta">
          {totalTime > 0 && <span><ClockIcon size={16} /> {totalTime} min</span>}
          {recipe.servings && <span>{recipe.servings} servings</span>}
          {matchLabel && <span className="match-pill">{matchLabel}</span>}
        </span>
        </span>
        <span className="card-arrow" aria-hidden="true">›</span>
      </button>
      {onToggleFavorite && <button className={recipe.favorite ? 'card-favorite active' : 'card-favorite'} onClick={onToggleFavorite} aria-label={recipe.favorite ? `Remove ${recipe.name} from favorites` : `Add ${recipe.name} to favorites`}><StarIcon size={20} filled={recipe.favorite} /></button>}
    </article>
  )
}
