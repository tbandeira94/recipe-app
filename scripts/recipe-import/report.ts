import type { BatchResult } from './types'

export type ReportResult = Omit<Extract<BatchResult, { status: 'success' }>, 'photo'> | Exclude<BatchResult, { status: 'success' }>

export function resultsForReport(results: BatchResult[]): ReportResult[] {
  return results.map((result) => {
    if (result.status !== 'success') return result
    const { photo, ...reportResult } = result
    void photo
    return reportResult
  })
}

export function markdownReport(results: BatchResult[], outputName: string): string {
  const successes = results.filter((result) => result.status === 'success')
  const duplicates = results.filter((result) => result.status === 'duplicate')
  const failures = results.filter((result) => result.status === 'failure')
  const lines = ['# Pantry Book recipe import report', '', `Output backup: \`${outputName}\``, '', `- Imported: ${successes.length}`, `- Duplicates skipped: ${duplicates.length}`, `- Failures: ${failures.length}`, '']
  if (successes.length) {
    lines.push('## Imported recipes', '')
    for (const result of successes) {
      lines.push(`- **${result.recipe.name}** — ${result.inputUrl}`)
      if (result.image.status === 'downloaded') lines.push(`  - Photo imported from: ${result.image.sourceUrl}`)
      else lines.push(`  - Photo unavailable: ${result.image.reason}`)
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
