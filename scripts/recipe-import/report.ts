import type { BatchResult } from './types'

export function markdownReport(results: BatchResult[], outputName: string): string {
  const successes = results.filter((result) => result.status === 'success')
  const duplicates = results.filter((result) => result.status === 'duplicate')
  const failures = results.filter((result) => result.status === 'failure')
  const lines = ['# Pantry Book recipe import report', '', `Output backup: \`${outputName}\``, '', `- Imported: ${successes.length}`, `- Duplicates skipped: ${duplicates.length}`, `- Failures: ${failures.length}`, '']
  if (successes.length) {
    lines.push('## Imported recipes', '')
    for (const result of successes) {
      lines.push(`- **${result.recipe.name}** — ${result.inputUrl}`)
      for (const warning of result.warnings) lines.push(`  - Warning: ${warning.message}`)
      if (result.unmappedFields.length) lines.push(`  - Unmapped structured fields retained in raw artifact: ${result.unmappedFields.join(', ')}`)
    }
    lines.push('')
  }
  if (duplicates.length) {
    lines.push('## Duplicates skipped', '')
    for (const result of duplicates) lines.push(`- ${result.inputUrl} — ${result.reason} Matches ${result.duplicateOf}`)
    lines.push('')
  }
  if (failures.length) {
    lines.push('## Failures', '')
    for (const result of failures) lines.push(`- ${result.inputUrl} — ${result.stage}: ${result.message}`)
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}
