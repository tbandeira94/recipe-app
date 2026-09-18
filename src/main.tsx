import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { APP_BUILD_ID } from './buildInfo'
import './styles.css'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const serviceWorkerUrl = new URL('./sw.js', window.location.href)
      serviceWorkerUrl.searchParams.set('build', APP_BUILD_ID)
      const registration = await navigator.serviceWorker.register(serviceWorkerUrl.toString())
      const announce = (worker: ServiceWorker | null) => worker && window.dispatchEvent(new CustomEvent('pwa-update-ready', { detail: worker }))
      if (registration.waiting) announce(registration.waiting)
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) announce(worker)
        })
      })
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!refreshing) { refreshing = true; window.location.reload() } })
    } catch (error) { console.warn('Offline support could not be enabled.', error) }
  })
}
