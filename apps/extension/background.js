// StockHelper Bridge — poll-based, MV3-safe
const SERVER = 'http://localhost:3011'
const VERSION = 'v7-sibling-toolbar'
let dispatchBusy = false
let captureState = null  // { tabId, queryId, startedAt }

// Remote debug log (server console access workaround)
function rlog(message) {
  console.log('[StockHelper]', message)
  fetch(`${SERVER}/api/queries/ext/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: VERSION, message }),
  }).catch(() => {})
}

// ── Grant content scripts access to session storage ──────────────────────────
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })

// ── On startup: reset any queries stuck in 'running' ─────────────────────────
async function resetStuckQueries() {
  try {
    await fetch(`${SERVER}/api/queries/reset-running`, { method: 'POST' })
  } catch {}
}

// ── Create offscreen document for persistent 3-second polling ────────────────
async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument()
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen.html'),
      reasons: ['BLOBS'],
      justification: 'Poll server for pending queries every 3 seconds',
    })
  }
}

ensureOffscreen().catch(console.error)
resetStuckQueries()
rlog('background started')

chrome.runtime.onStartup.addListener(() => {
  ensureOffscreen().catch(console.error)
  resetStuckQueries()
})

// ── Handle poll ticks from offscreen document ─────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ping') {
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === 'poll_tick') {
    if (captureState) {
      checkCapture()
    } else if (!dispatchBusy) {
      pollAndDispatch()
    }
    return
  }

  // Legacy message from old content script (kept for safety)
  if (msg.type === 'save_response') {
    if (captureState) {
      saveAndFinish(captureState.queryId, msg.html)
      captureState = null
    }
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === 'capture_failed') {
    captureState = null
    dispatchBusy = false
    chrome.storage.session.remove('stockhelper_pending')
    updateBadge('ON', '#22c55e')
  }
})

// ── Check DeepSeek tab for completed response (runs every poll_tick) ─────────
async function checkCapture() {
  if (!captureState) return
  const { tabId, queryId, startedAt } = captureState

  // 5-minute timeout
  if (Date.now() - startedAt > 300_000) {
    rlog(`capture TIMEOUT query=${queryId}`)
    captureState = null
    dispatchBusy = false
    chrome.storage.session.remove('stockhelper_pending')
    updateBadge('ERR', '#ef4444')
    return
  }

  let tab
  try {
    tab = await chrome.tabs.get(tabId)
  } catch {
    // Tab was closed — abort
    rlog(`tab closed, abort query=${queryId}`)
    captureState = null
    dispatchBusy = false
    chrome.storage.session.remove('stockhelper_pending')
    updateBadge('ON', '#22c55e')
    return
  }

  // Don't check while tab is still loading
  if (tab.status === 'loading') return

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Capture the full last .ds-message (includes web search + response text)
        const messages = document.querySelectorAll('.ds-message')
        const lastMsg = messages[messages.length - 1]
        const html = lastMsg?.innerHTML ?? ''
        // The action toolbar (copy/regenerate/like/dislike/share) renders as a
        // SIBLING after the message once generation completes — count icons in
        // everything that follows lastMsg inside its parent.
        let tailIcons = 0
        let sibTags = ''
        if (lastMsg && lastMsg.parentElement) {
          let sib = lastMsg.nextElementSibling
          while (sib) {
            tailIcons += sib.querySelectorAll('svg, [class*="icon"]').length
            sibTags += sib.tagName.toLowerCase() + '.' + String(sib.className).slice(0, 30) + ' '
            sib = sib.nextElementSibling
          }
        }
        return { len: html.length, tailIcons, sibTags: sibTags.slice(0, 120) }
      }
    })

    const result = results?.[0]?.result
    if (!result) return

    // Stability detection: done when content stops growing for 5 consecutive
    // checks (~15s). DOM-agnostic — does not depend on DeepSeek's button markup.
    if (result.len > captureState.lastLen) {
      captureState.lastLen = result.len
      captureState.stable = 0
    } else if (result.len >= 500) {
      captureState.stable++
    }

    // Done when the action toolbar appeared after the message, or content went stable
    const toolbarDone = result.len >= 500 && result.tailIcons >= 4
    rlog(`check query=${queryId} len=${result.len} stable=${captureState.stable}/5 tailIcons=${result.tailIcons} sibs=[${result.sibTags}]`)

    if (toolbarDone || captureState.stable >= 5) {
      // Grab the full HTML now that we know it's ready
      const htmlResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const messages = document.querySelectorAll('.ds-message')
          const lastMsg = messages[messages.length - 1]
          return lastMsg?.innerHTML ?? ''
        }
      })
      const html = htmlResults?.[0]?.result ?? ''
      captureState = null
      await saveAndFinish(queryId, html)
    }
  } catch (e) {
    rlog(`executeScript FAILED: ${e.message}`)
  }
}

async function saveAndFinish(queryId, html) {
  try {
    const res = await fetch(`${SERVER}/api/queries/${queryId}/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    })
    const d = await res.json()
    rlog(`SAVED query=${queryId} ok=${d.success}`)
  } catch (e) {
    rlog(`save FAILED query=${queryId}: ${e.message}`)
  }
  dispatchBusy = false
  chrome.storage.session.remove('stockhelper_pending')
  updateBadge('ON', '#22c55e')
}

// ── Poll server for pending queries ──────────────────────────────────────────
async function pollAndDispatch() {
  try {
    const res = await fetch(`${SERVER}/api/queries/claim`, { method: 'POST' })
    const data = await res.json()
    const query = data.query
    if (!query) return

    dispatchBusy = true
    updateBadge('...', '#f59e0b')
    await dispatchQuery(query)
  } catch {
    // Server not reachable
  }
}

async function dispatchQuery({ id, question, provider }) {
  const providerUrls = { deepseek: 'https://chat.deepseek.com/' }
  const url = providerUrls[provider]
  if (!url) { dispatchBusy = false; return }

  await chrome.storage.session.set({
    stockhelper_pending: { queryId: id, question, provider }
  })

  // Find or open DeepSeek tab
  const tabs = await chrome.tabs.query({ url: url + '*' })
  let tab

  if (tabs.length > 0) {
    tab = tabs[0]
    await chrome.tabs.update(tab.id, { active: true })
    await sleep(500)
  } else {
    tab = await chrome.tabs.create({ url })
    await waitForTabComplete(tab.id)
    await sleep(3000)
  }

  // Record the tab so background can poll it for the response
  captureState = { tabId: tab.id, queryId: id, startedAt: Date.now(), lastLen: 0, stable: 0 }

  // Inject question into MAIN world (content script receives via window.postMessage)
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (qId, q) => window.postMessage({ type: 'STOCKHELPER_QUERY', queryId: qId, question: q }, '*'),
    args: [id, question],
    world: 'MAIN',
  })

  rlog(`dispatched query=${id} tab=${tab.id}`)
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    })
  })
}

function updateBadge(text, color) {
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

updateBadge('ON', '#22c55e')
