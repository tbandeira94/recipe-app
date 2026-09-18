import type { RecipeBackup } from '../types'
import { getRecipes, replaceAllRecipes } from './database'
import { createBackupFromRecipes, parseBackup } from './backupFormat'

export { parseBackup } from './backupFormat'

export async function createBackup(): Promise<RecipeBackup> {
  return createBackupFromRecipes(await getRecipes())
}

export async function exportBackup(): Promise<'shared' | 'downloaded'> {
  const backup = await createBackup()
  const date = backup.exportedAt.slice(0, 10)
  const filename = `recipes-backup-${date}.json`
  const file = new File([JSON.stringify(backup, null, 2)], filename, { type: 'application/json' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Pantry Book backup' })
    return 'shared'
  }
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

export async function importBackup(file: File): Promise<number> {
  const parsed = parseBackup(await file.text())
  await replaceAllRecipes(parsed.recipes)
  return parsed.recipes.length
}
