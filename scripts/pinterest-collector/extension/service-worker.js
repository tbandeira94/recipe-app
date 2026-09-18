const JOB_KEY = 'pantryBookPinterestCollectorJob'

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function getJob() {
  return (await chrome.storage.local.get(JOB_KEY))[JOB_KEY]
}

async function saveJob(job) {
  await chrome.storage.local.set({ [JOB_KEY]: job })
}

function isPinterestUrl(url) {
  try { return new URL(url).hostname.endsWith('pinterest.com') } catch { return false }
}

async function boardPinUrls(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const pinUrls = new Set()
      let unchangedPasses = 0
      let lastCount = 0
      for (let pass = 0; pass < 250 && unchangedPasses < 4; pass += 1) {
        document.querySelectorAll('a[href*="/pin/"]').forEach((link) => {
          const url = new URL(link.href, location.href)
          if (url.pathname.includes('/pin/')) pinUrls.add(url.origin + url.pathname)
        })
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
        await new Promise((resolve) => setTimeout(resolve, 900))
        if (pinUrls.size === lastCount) unchangedPasses += 1
        else { lastCount = pinUrls.size; unchangedPasses = 0 }
      }
      return [...pinUrls]
    },
  })
  return result
}

async function waitForComplete(tabId) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error('Timed out waiting for pin page.'))
    }, 20_000)
    const listener = (changedTabId, change) => {
      if (changedTabId !== tabId || change.status !== 'complete') return
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
  // Pinterest hydrates destination links after the document is complete.
  await pause(900)
}

async function resolvePin(pinUrl) {
  const tab = await chrome.tabs.create({ url: pinUrl, active: false })
  try {
    await waitForComplete(tab.id)
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => [...new Set([...document.querySelectorAll('a[href]')]
        .map((link) => link.href)
        .filter((url) => /^https?:/i.test(url) && !new URL(url).hostname.endsWith('pinterest.com') && !new URL(url).hostname.endsWith('pinimg.com')))],
    })
    return result
  } finally {
    await chrome.tabs.remove(tab.id)
  }
}

async function run(job) {
  try {
    while (job.cursor < job.pinUrls.length) {
      const pinUrl = job.pinUrls[job.cursor]
      try {
        const destinations = await resolvePin(pinUrl)
        if (destinations.length) {
          for (const url of destinations) if (!job.urls.includes(url)) job.urls.push(url)
        } else job.noDestination.push(pinUrl)
      } catch (error) {
        job.errors.push({ pinUrl, message: error instanceof Error ? error.message : String(error) })
      }
      job.cursor += 1
      await saveJob(job)
      await pause(600)
    }
    job.running = false
    job.finished = true
    await saveJob(job)
  } catch (error) {
    job.running = false
    job.errors.push({ pinUrl: null, message: error instanceof Error ? error.message : String(error) })
    await saveJob(job)
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ;(async () => {
    if (message.type === 'status') return sendResponse({ job: await getJob() })
    if (message.type === 'reset') {
      await chrome.storage.local.remove(JOB_KEY)
      return sendResponse({ ok: true })
    }
    if (message.type === 'download') {
      const job = await getJob()
      if (!job?.urls?.length) return sendResponse({ ok: false, error: 'No URLs have been collected yet.' })
      await chrome.downloads.download({ url: `data:text/plain;charset=utf-8,${encodeURIComponent(job.urls.join('\n') + '\n')}`, filename: 'pinterest-recipe-urls.txt', saveAs: true })
      return sendResponse({ ok: true })
    }
    if (message.type === 'start') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !isPinterestUrl(tab.url) || !/\/[^/]+\/[^/]+\/?(?:[?#].*)?$/i.test(tab.url)) {
        return sendResponse({ ok: false, error: 'Open the Pinterest board you want to collect, then try again.' })
      }
      let job = await getJob()
      if (!job || job.boardUrl !== tab.url) {
        const pins = await boardPinUrls(tab.id)
        const pinUrls = message.limit ? pins.slice(0, message.limit) : pins
        job = { boardUrl: tab.url, pinUrls, cursor: 0, urls: [], noDestination: [], errors: [], running: false, finished: false }
      }
      if (!job.running && !job.finished) {
        job.running = true
        await saveJob(job)
        void run(job)
      }
      return sendResponse({ ok: true })
    }
    sendResponse({ ok: false, error: 'Unknown request.' })
  })()
  return true
})
