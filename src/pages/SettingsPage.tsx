import { useRef, useState } from 'react'
import { DownloadIcon, UploadIcon } from '../components/Icons'
import { exportBackup, parseBackup, importBackup } from '../lib/backup'
import { APP_BUILD_ID } from '../buildInfo'

interface Props { recipeCount: number; onImported: () => Promise<void> }

export function SettingsPage({ recipeCount, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const handleExport = async () => {
    setBusy(true); setStatus('')
    try { const result = await exportBackup(); setStatus(result === 'shared' ? 'Backup shared.' : 'Backup downloaded.') }
    catch (error) { if ((error as DOMException).name !== 'AbortError') setStatus(error instanceof Error ? error.message : 'Could not export the backup.') }
    finally { setBusy(false) }
  }
  const handleFile = async (file?: File) => {
    if (!file) return
    setBusy(true); setStatus('')
    try {
      const parsed = parseBackup(await file.text())
      const message = `Replace ${recipeCount} current ${recipeCount === 1 ? 'recipe' : 'recipes'} with ${parsed.recipes.length} from this backup? This cannot be undone unless you export first.`
      if (!window.confirm(message)) return
      const count = await importBackup(file)
      await onImported()
      setStatus(`Restored ${count} ${count === 1 ? 'recipe' : 'recipes'}.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not import the backup.') }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }
  return <div className="page">
    <header className="page-header"><div><span className="eyebrow">Keep your recipes safe</span><h1>Settings & data</h1></div></header>
    <section className="settings-card">
      <div className="settings-intro"><div className="data-mark">{recipeCount}</div><div><h2>Recipes on this device</h2><p>Pantry Book has no account or cloud. Make regular backups so your collection can move with you.</p></div></div>
      <button className="settings-action" onClick={handleExport} disabled={busy}><span className="action-icon"><DownloadIcon /></span><span><strong>Export backup</strong><small>Save or share a readable JSON file, including photos</small></span><span aria-hidden="true">›</span></button>
      <button className="settings-action" onClick={() => fileInput.current?.click()} disabled={busy}><span className="action-icon"><UploadIcon /></span><span><strong>Restore from backup</strong><small>Replace recipes after validation</small></span><span aria-hidden="true">›</span></button>
      <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void handleFile(event.target.files?.[0])} />
      {status && <p className="settings-status" role="status">{status}</p>}
    </section>
    <section className="info-card"><h2>Private by design</h2><p>Everything is stored in this browser using IndexedDB. Nothing is uploaded. Clearing Safari website data or deleting the app can remove it, so keep a backup elsewhere.</p></section>
    <section className="info-card"><h2>Install on iPhone</h2><p>In Safari, tap Share, then <strong>Add to Home Screen</strong>. Open it once online before relying on offline access.</p></section>
    <p className="version-label">Pantry Book · Build {APP_BUILD_ID} · Backup format v3</p>
  </div>
}
