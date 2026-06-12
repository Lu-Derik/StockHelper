// Content script — submits questions to DeepSeek on behalf of StockHelper
// Capture is handled entirely by background.js via chrome.scripting.executeScript
const CAPTURE_KEY = 'stockhelper_pending'

console.log('[StockHelper] Content script loaded:', location.href)

let activeQueryId = null

// ── On page load: check for pending query to submit ──────────────────────────
;(async () => {
  try {
    const data = await chrome.storage.session.get(CAPTURE_KEY)
    const pending = data?.[CAPTURE_KEY]
    if (pending?.queryId && pending.queryId !== activeQueryId) {
      activeQueryId = pending.queryId
      console.log('[StockHelper] Resuming submit after navigation, queryId:', pending.queryId)
      // Wait for page to load, then submit
      await waitForTextarea()
      await submitQuestion(pending.question)
    }
  } catch (err) {
    console.warn('[StockHelper] storage.session read failed:', err.message)
  }
})()

// ── Listen for new query injections from background ───────────────────────────
window.addEventListener('message', async (event) => {
  if (event.source !== window) return
  if (event.data?.type !== 'STOCKHELPER_QUERY') return

  const { queryId, question } = event.data

  if (activeQueryId === queryId) {
    console.log('[StockHelper] Duplicate injection for queryId:', queryId)
    return
  }
  activeQueryId = queryId
  console.log('[StockHelper] Submitting query', queryId)

  try {
    await submitQuestion(question)
  } catch (err) {
    console.error('[StockHelper] Submit failed:', err)
  }
})

async function waitForTextarea(maxWait = 10000) {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    if (document.querySelector('textarea')) return
    await sleep(300)
  }
}

async function submitQuestion(question) {
  const input = document.querySelector('textarea')
  if (!input) throw new Error('Cannot find textarea')

  input.focus()
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  nativeSetter.call(input, question)
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: question }))

  await sleep(600)

  const sendBtn = [...document.querySelectorAll('button')].find(
    (b) => b.className.includes('ds-button--primary') && b.className.includes('ds-button--filled')
  )

  if (sendBtn) {
    console.log('[StockHelper] Clicking send button')
    sendBtn.click()
  } else {
    console.log('[StockHelper] Fallback: Enter key')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))
  }
  console.log('[StockHelper] Question submitted — background.js will capture response')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
