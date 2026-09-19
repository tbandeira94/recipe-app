import { useEffect, useRef, useState } from 'react'
import { DownloadIcon, UploadIcon } from '../components/Icons'
import { deliverBackup, importBackup, inspectBackup, prepareBackup, type BackupProgress } from '../lib/backup'
import { APP_BUILD_ID } from '../buildInfo'
import { cleanupInactiveDatabases } from '../lib/database'
import { getStorageStatus, requestPersistentStorage, type StorageStatus } from '../lib/storage'

interface Props { recipeCount: number; onImported: () => Promise<void> }
const RESTORE_DIAGNOSTICS_KEY = 'pantry-book.restore-diagnostics'

function loadRestoreDiagnostics(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RESTORE_DIAGNOSTICS_KEY) ?? '[]')
    return Array.isArray(value) && value.every((line) => typeof line === 'string') ? value.slice(-250) : []
  } catch { return [] }
}

function saveRestoreDiagnostics(lines: string[]): void {
  try { localStorage.setItem(RESTORE_DIAGNOSTICS_KEY, JSON.stringify(lines.slice(-250))) }
  catch { /* Diagnostics are best effort and must never interrupt a restore. */ }
}

export function SettingsPage({ recipeCount, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const diagnosticsInput = useRef<HTMLTextAreaElement>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [storage, setStorage] = useState<StorageStatus>({})
  const [preparedBackup, setPreparedBackup] = useState<File | null>(null)
  const [diagnostics, setDiagnostics] = useState<string[]>(loadRestoreDiagnostics)
  const [copyStatus, setCopyStatus] = useState('')
  useEffect(() => { void getStorageStatus().then(setStorage) }, [recipeCount])
  const showProgress = ({ phase, completed, total }: BackupProgress) => {
    const action = phase === 'export' ? 'Preparing photos'
      : phase === 'inspect' ? 'Checking archive'
        : phase === 'recipes' ? 'Importing recipes'
          : phase === 'photos' ? 'Importing photos'
            : 'Finishing restore'
    setStatus(`${action}… ${completed}/${total}`)
  }
  const handleExport = async () => {
    setBusy(true); setStatus('')
    try { setPreparedBackup(await prepareBackup(showProgress)); setStatus('Backup ready. Choose Save backup to save it.') }
    catch (error) { if ((error as DOMException).name !== 'AbortError') setStatus(error instanceof Error ? error.message : 'Could not export the backup.') }
    finally { setBusy(false) }
  }
  const savePreparedBackup = async () => {
    if (!preparedBackup) return
    setBusy(true); setStatus('')
    try {
      const result = await deliverBackup(preparedBackup)
      setPreparedBackup(null)
      setStatus(result === 'shared' ? 'Backup shared.' : 'Backup downloaded.')
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setStatus(error instanceof Error ? error.message : 'Could not save the backup.')
    } finally { setBusy(false) }
  }
  const handleFile = async (file?: File) => {
    if (!file) return
    setBusy(true); setStatus('')
    setCopyStatus('')
    const standalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone) || window.matchMedia?.('(display-mode: standalone)').matches
    const initialDiagnostics = [
      `Pantry Book build ${APP_BUILD_ID}`,
      `Started: ${new Date().toISOString()}`,
      `File: ${file.name} (${file.size} bytes)`,
      `Browser: ${navigator.userAgent}`,
      `Standalone: ${standalone}; screen ${screen.width}x${screen.height}; viewport ${window.innerWidth}x${window.innerHeight}`,
    ]
    setDiagnostics(initialDiagnostics)
    saveRestoreDiagnostics(initialDiagnostics)
    try {
      void requestPersistentStorage()
      const inspection = await inspectBackup(file)
      const message = `Replace ${recipeCount} current ${recipeCount === 1 ? 'recipe' : 'recipes'} with ${inspection.recipeCount} from this backup? This cannot be undone unless you export first.`
      if (!window.confirm(message)) return
      const count = await importBackup(file, showProgress, (message) => setDiagnostics((current) => {
        const next = [...current, message].slice(-250)
        saveRestoreDiagnostics(next)
        return next
      }))
      await onImported()
      void cleanupInactiveDatabases()
      setStorage(await getStorageStatus())
      setStatus(`Restored ${count} ${count === 1 ? 'recipe' : 'recipes'}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import the backup.'
      setStatus(`${message} Your current library was not changed. Copy the restore diagnostics below when reporting this issue.`)
    }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }
  const copyDiagnostics = async () => {
    const text = diagnostics.join('\n')
    let copied = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        copied = true
      }
    } catch { /* Fall back to selecting the text area. */ }
    if (!copied && diagnosticsInput.current) {
      diagnosticsInput.current.focus()
      diagnosticsInput.current.select()
      try { copied = document.execCommand('copy') } catch { copied = false }
    }
    setCopyStatus(copied ? 'Diagnostics copied.' : 'Select the log above and use Copy.')
  }
  return <div className="page">
    <header className="page-header"><div><span className="eyebrow">Keep your recipes safe</span><h1>Settings & data</h1></div></header>
    <section className="settings-card">
      <div className="settings-intro"><div className="data-mark">{recipeCount}</div><div><h2>Recipes on this device</h2><p>Pantry Book has no account or cloud. Make regular backups so your collection can move with you.</p></div></div>
      <button className="settings-action" onClick={handleExport} disabled={busy}><span className="action-icon"><DownloadIcon /></span><span><strong>Export backup</strong><small>Save or share recipes and photos as one archive</small></span><span aria-hidden="true">›</span></button>
      {preparedBackup && <button className="settings-action" onClick={() => void savePreparedBackup()} disabled={busy}><span className="action-icon"><DownloadIcon /></span><span><strong>Save backup</strong><small>{preparedBackup.name}</small></span><span aria-hidden="true">›</span></button>}
      <button className="settings-action" onClick={() => fileInput.current?.click()} disabled={busy}><span className="action-icon"><UploadIcon /></span><span><strong>Restore from backup</strong><small>Replace recipes after validation</small></span><span aria-hidden="true">›</span></button>
      <input ref={fileInput} className="visually-hidden" type="file" onChange={(event) => void handleFile(event.target.files?.[0])} />
      {status && <p className="settings-status" role="status">{status}</p>}
    </section>
    {diagnostics.length > 0 && <section className="diagnostics-card">
      <div className="diagnostics-heading"><div><h2>Restore diagnostics</h2><p>Saved after each batch so it survives a restart. It contains no recipe contents or photos.</p></div><button type="button" onClick={() => void copyDiagnostics()}>Copy logs</button></div>
      <textarea ref={diagnosticsInput} readOnly value={diagnostics.join('\n')} aria-label="Restore diagnostic log" rows={11} />
      {copyStatus && <p className="copy-status" role="status">{copyStatus}</p>}
    </section>}
    <section className="info-card"><h2>Private by design</h2><p>Everything is stored in this browser using IndexedDB. Nothing is uploaded. Clearing Safari website data or deleting the app can remove it, so keep a backup elsewhere.</p>{storage.usage !== undefined && storage.quota !== undefined && <p className="storage-usage">Using {formatBytes(storage.usage)} of approximately {formatBytes(storage.quota)} available · {storage.persistent ? 'Protected storage' : 'Best-effort storage'}</p>}</section>
    <section className="info-card"><h2>Install on iPhone</h2><p>In Safari, tap Share, then <strong>Add to Home Screen</strong>. Open it once online before relying on offline access.</p></section>
    <p className="version-label">Pantry Book · Build {APP_BUILD_ID} · Archive format v1</p>
  </div>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
