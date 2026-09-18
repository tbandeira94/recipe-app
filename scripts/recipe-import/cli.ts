import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { createRecipeArchive, readRecipeArchive } from './archive'
import { convertUrls } from './batch'
import { markdownReport, resultsForReport } from './report'
import type { BatchResult } from './types'

interface Options {
  command?: 'url' | 'batch'
  input?: string
  out: string
  baseBackup?: string
  concurrency: number
}

function usage(): string {
  return `Usage:
  pnpm recipe:import -- url <recipe-url> [--out <directory>] [--base-backup <backup.pantrybook>]
  pnpm recipe:import -- batch <urls.txt> [--out <directory>] [--base-backup <backup.pantrybook>] [--concurrency 3]

The generated .pantrybook archive can be restored by the Pantry Book PWA.`
}

function parseArgs(args: string[]): Options {
  const options: Options = { out: 'recipe-import-output', concurrency: 3 }
  const positional: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--out') options.out = args[++index] ?? ''
    else if (arg === '--base-backup') options.baseBackup = args[++index]
    else if (arg === '--concurrency') options.concurrency = Number(args[++index])
    else if (arg === '--help' || arg === '-h') throw new Error(usage())
    else positional.push(arg)
  }
  if ((positional[0] !== 'url' && positional[0] !== 'batch') || !positional[1]) throw new Error(usage())
  options.command = positional[0]
  options.input = positional[1]
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 10) throw new Error('--concurrency must be an integer from 1 to 10.')
  return options
}

async function inputUrls(options: Options): Promise<string[]> {
  if (options.command === 'url') return [options.input!]
  const text = await readFile(resolve(options.input!), 'utf8')
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const urls = await inputUrls(options)
  if (!urls.length) throw new Error('No URLs were found in the input file.')
  let base: Awaited<ReturnType<typeof readRecipeArchive>> | undefined
  if (options.baseBackup) {
    if (extname(options.baseBackup).toLocaleLowerCase() !== '.pantrybook') throw new Error('--base-backup must be a .pantrybook archive.')
    const bytes = await readFile(resolve(options.baseBackup))
    base = await readRecipeArchive(new Blob([new Uint8Array(bytes)]))
  }
  const results = await convertUrls(urls, options.concurrency, base?.manifest.recipes)
  const successes = results.filter((result): result is Extract<BatchResult, { status: 'success' }> => result.status === 'success')
  const imported = successes.map((result) => result.recipe)
  const recipes = [...(base?.manifest.recipes ?? []), ...imported]
  const photos = new Map(base?.photos ?? [])
  for (const result of successes) if (result.photo) photos.set(result.recipe.id, result.photo)
  const { archive, manifest } = await createRecipeArchive(recipes, photos)
  const out = resolve(options.out)
  await mkdir(resolve(out, 'raw'), { recursive: true })
  const backupName = 'pantry-book-import.pantrybook'
  await writeFile(resolve(out, backupName), new Uint8Array(await archive.arrayBuffer()))
  await writeFile(resolve(out, 'report.json'), `${JSON.stringify({ generatedAt: manifest.exportedAt, baseBackup: options.baseBackup ?? null, results: resultsForReport(results) }, null, 2)}\n`, 'utf8')
  await writeFile(resolve(out, 'review.md'), markdownReport(results, backupName), 'utf8')
  await Promise.all(results.map(async (result, index) => {
    if (result.status === 'success' && (result.warnings.length || result.unmappedFields.length)) {
      await writeFile(resolve(out, 'raw', `${String(index + 1).padStart(3, '0')}.json`), `${JSON.stringify(result.raw, null, 2)}\n`, 'utf8')
    }
  }))
  const failures = results.filter((result) => result.status === 'failure').length
  const duplicates = results.filter((result) => result.status === 'duplicate').length
  console.log(`Created ${resolve(out, backupName)} with ${manifest.recipes.length} recipe(s): ${imported.length} imported, ${duplicates} duplicate(s) skipped, ${failures} failure(s).`)
  if (!base) console.warn('Warning: Pantry Book restore replaces its full library. Use --base-backup with an exported archive before restoring into a nonempty library.')
  if (failures) process.exitCode = 2
}

run().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
