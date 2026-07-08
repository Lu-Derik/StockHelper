// Bridge from the local web app page to the extension background script.
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data || data.type !== 'STOCKHELPER_QUERY') return

  chrome.runtime.sendMessage({
    type: 'run_query',
    payload: data.payload,
  }).catch(() => {})
})
