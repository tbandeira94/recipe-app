const status = document.querySelector('#status')
const limit = document.querySelector('#limit')
const start = document.querySelector('#start')
const download = document.querySelector('#download')
const reset = document.querySelector('#reset')

function describe(job) {
  if (!job) return 'No saved collection.'
  const state = job.running ? 'Running' : job.finished ? 'Finished' : 'Paused'
  return `${state}\nPins discovered: ${job.pinUrls.length}\nPins resolved: ${job.cursor}/${job.pinUrls.length}\nOutbound URLs: ${job.urls.length}\nNo destination: ${job.noDestination.length}\nOther issue: ${job.errors.length}`
}

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: 'status' })
  status.textContent = describe(response.job)
  download.disabled = !response.job?.urls?.length
}

start.addEventListener('click', async () => {
  start.disabled = true
  status.textContent = 'Collecting board pins…'
  const number = Number(limit.value)
  const response = await chrome.runtime.sendMessage({ type: 'start', limit: Number.isInteger(number) && number > 0 ? number : undefined })
  if (!response.ok) status.textContent = response.error
  await refresh()
  start.disabled = false
})

download.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'download' })
})

reset.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'reset' })
  await refresh()
})

refresh()
