// StockHelper Bridge — poll-based, MV3-safe
const DEFAULT_SERVER = 'https://stock-api.unibuy.fun'
const VERSION = 'v13-auto-worker'
// Where the backend is exposed on the machine that hosts it (docker → 3011).
const LOCAL_BACKEND = 'http://localhost:3011'
let dispatchBusy = false
let captureState = null  // { tabId, queryId, startedAt }
// Server is hardcoded (tunnel); only the API key is user-configurable.
let extensionConfig = { server: DEFAULT_SERVER, apiKey: '' }
let configLoaded = false
// Cached auto-probe of whether this machine hosts the backend (short TTL).
let workerProbe = { ts: 0, value: null }

function normalizeServer(value) {
  const raw = (value || DEFAULT_SERVER).trim()
  if (!raw) return DEFAULT_SERVER
  return raw.replace(/\/$/, '')
}

async function ensureConfigLoaded() {
  if (configLoaded) return extensionConfig
  const data = await chrome.storage.local.get(['stockhelper_api_key'])
  extensionConfig = {
    // Server is hardcoded to the tunnel; storage overrides are ignored.
    server: DEFAULT_SERVER,
    apiKey: data.stockhelper_api_key || '',
  }
  configLoaded = true
  return extensionConfig
}

async function apiFetch(path, init = {}, serverOverride) {
  const cfg = await ensureConfigLoaded()
  const headers = new Headers(init.headers || {})
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (cfg.apiKey) {
    headers.set('X-API-Key', cfg.apiKey)
  }
  // serverOverride lets a single dispatch (e.g. dev mode) target a different
  // backend than the configured one — its status/callback go there instead.
  const base = serverOverride || cfg.server
  return fetch(`${base}${path}`, { ...init, headers })
}

// Remote debug log (server console access workaround)
function rlog(message) {
  console.log('[StockHelper]', message)
  apiFetch('/api/queries/ext/log', {
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
    await apiFetch('/api/queries/reset-running', { method: 'POST' })
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

// ── Persist/restore captureState across service-worker restarts ──────────────
const CAPTURE_STATE_KEY = 'stockhelper_capture_state'

async function saveCaptureState(state) {
  if (state) {
    await chrome.storage.session.set({ [CAPTURE_STATE_KEY]: state }).catch(() => {})
  } else {
    await chrome.storage.session.remove(CAPTURE_STATE_KEY).catch(() => {})
  }
}

async function restoreCaptureState() {
  if (captureState) return  // already in memory
  try {
    const data = await chrome.storage.session.get(CAPTURE_STATE_KEY)
    const saved = data?.[CAPTURE_STATE_KEY]
    if (saved?.tabId && saved?.queryId) {
      captureState = saved
      dispatchBusy = true
      rlog(`restored captureState query=${saved.queryId} tab=${saved.tabId}`)
    }
  } catch {}
}

// ── Handle poll ticks from offscreen document ─────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ping') {
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === 'run_query') {
    const { queryId, question, provider, server } = msg.payload || {}
    if (!queryId || !question) {
      sendResponse({ ok: false, error: 'invalid payload' })
      return true
    }
    dispatchBusy = true
    updateBadge('...', '#f59e0b')
    dispatchQuery({ id: queryId, question, provider: provider || 'deepseek', server }, { source: 'app' })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'failed' }))
    return true
  }

  if (msg.type === 'poll_tick') {
    restoreCaptureState().then(() => {
      if (captureState) {
        checkCapture()
      } else if (!dispatchBusy) {
        pollAndDispatch()
      }
    })
    return
  }

  // Legacy message from old content script (kept for safety)
  if (msg.type === 'save_response') {
    if (captureState) {
      saveAndFinish(captureState.queryId, msg.html)
      captureState = null
      saveCaptureState(null)
    }
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === 'capture_failed') {
    captureState = null
    dispatchBusy = false
    chrome.storage.session.remove('stockhelper_pending')
    saveCaptureState(null)
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
    saveCaptureState(null)
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
    saveCaptureState(null)
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
    // Use len > 0 so short responses (< 500 chars) can also complete.
    if (result.len > captureState.lastLen) {
      captureState.lastLen = result.len
      captureState.stable = 0
    } else if (result.len > 0) {
      captureState.stable++
    }
    await saveCaptureState(captureState)

    // Done when the action toolbar appeared after the message, or content went stable.
    // Lower tailIcons threshold to 1 — DeepSeek may show fewer icons than before.
    const toolbarDone = result.len > 0 && result.tailIcons >= 1
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
      const server = captureState.server
      captureState = null
      saveCaptureState(null)
      await saveAndFinish(queryId, html, server)
    }
  } catch (e) {
    rlog(`executeScript FAILED: ${e.message}`)
  }
}

async function updateQueryStatus(queryId, status, server) {
  try {
    await apiFetch(`/api/queries/${queryId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }, server)
  } catch (e) {
    rlog(`status update failed query=${queryId} status=${status}: ${e.message}`)
  }
}

async function saveAndFinish(queryId, html, server) {
  try {
    const res = await apiFetch(`/api/queries/${queryId}/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    }, server)
    const d = await res.json()
    rlog(`SAVED query=${queryId} ok=${d.success}`)
  } catch (e) {
    await updateQueryStatus(queryId, 'failed', server)
    rlog(`save FAILED query=${queryId}: ${e.message}`)
  }
  dispatchBusy = false
  chrome.storage.session.remove('stockhelper_pending')
  updateBadge('ON', '#22c55e')
}

// ── Poll server for pending queries ──────────────────────────────────────────
// Serves both queues: backend-mode queries, plus app-mode queries whose direct
// postMessage dispatch was missed (server enforces a 20s grace period on those).
// Decide whether this machine serves the backend queue. In 'auto' mode we probe
// the local backend: only the machine that actually hosts it (docker on 3011)
// can reach localhost:3011, so it becomes the worker and others opt out.
async function isBackendWorker() {
  // Cache the probe for 60s to avoid hitting localhost every 3s tick.
  if (workerProbe.value !== null && Date.now() - workerProbe.ts < 60_000) {
    return workerProbe.value
  }
  let ok = false
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch(`${LOCAL_BACKEND}/health`, { signal: ctrl.signal })
    clearTimeout(t)
    ok = res.ok
  } catch { ok = false }
  // Log only when the decision changes, so we can confirm each machine's role.
  if (workerProbe.value !== ok) {
    rlog(`backend-worker=${ok} (localhost:3011 reachable=${ok})`)
  }
  workerProbe = { ts: Date.now(), value: ok }
  return ok
}

async function pollAndDispatch() {
  try {
    // Always serve the app-mode fallback queue (missed direct dispatches).
    // Only a designated backend worker serves the backend queue, so 后台DeepSeek
    // queries run on that one machine instead of whichever polls first.
    const claimPaths = (await isBackendWorker())
      ? ['/api/queries/claim', '/api/queries/claim-app']
      : ['/api/queries/claim-app']
    let query = null
    for (const claimPath of claimPaths) {
      const res = await apiFetch(claimPath, { method: 'POST' })
      const data = await res.json()
      if (data.query) { query = data.query; break }
    }
    if (!query) return

    dispatchBusy = true
    updateBadge('...', '#f59e0b')
    await dispatchQuery(query)
  } catch {
    // Server not reachable
  }
}

async function dispatchQuery({ id, question, provider, server }, options = {}) {
  const providerUrls = { deepseek: 'https://chat.deepseek.com/' }
  const url = providerUrls[provider]
  if (!url) { dispatchBusy = false; return }

  await chrome.storage.session.set({
    stockhelper_pending: { queryId: id, question, provider }
  })
  await updateQueryStatus(id, 'running', server)

  // Force the extension to operate on the currently visible DeepSeek tab.
  // If a matching tab is already open in the current window, use it and focus it.
  // If not, create a new visible tab explicitly.
  const tabs = await chrome.tabs.query({ url: url + '*' })
  let tab

  const currentWindowActiveTab = tabs.find(
    (t) => t.active && t.windowId === chrome.windows.WINDOW_ID_CURRENT
  )
  const currentWindowTab = tabs.find((t) => t.windowId === chrome.windows.WINDOW_ID_CURRENT)
  const preferredTab = currentWindowActiveTab || currentWindowTab || tabs[0]

  if (preferredTab) {
    tab = preferredTab
    await chrome.tabs.update(tab.id, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
    await waitForTabReady(tab.id)
  } else {
    tab = await chrome.tabs.create({ url, active: true })
    await waitForTabComplete(tab.id)
    await waitForTabReady(tab.id)
  }

  // Record the tab so background can poll it for the response
  captureState = { tabId: tab.id, queryId: id, startedAt: Date.now(), lastLen: 0, stable: 0, server }
  await saveCaptureState(captureState)

  rlog(`dispatching query=${id} tab=${tab.id} url=${tab.url || ''} title=${tab.title || ''} active=${tab.active}`)

  // Submit directly in the target page so it works even if the content script
  // was not injected or if the page was already open before the extension loaded.
  let submitResult
  try {
    submitResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (q) => {
        const marker = document.createElement('div')
        marker.id = 'stockhelper-marker'
        marker.textContent = 'StockHelper submitting…'
        marker.style.position = 'fixed'
        marker.style.top = '12px'
        marker.style.right = '12px'
        marker.style.zIndex = '2147483647'
        marker.style.background = '#2563eb'
        marker.style.color = '#fff'
        marker.style.padding = '8px 12px'
        marker.style.borderRadius = '8px'
        marker.style.fontSize = '14px'
        marker.style.fontFamily = 'sans-serif'
        marker.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)'
        document.body?.appendChild(marker)

        const input = document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]')
        if (!input) {
          marker.textContent = 'StockHelper: textarea not found'
          return { ok: false, reason: 'textarea_not_found', url: location.href, title: document.title }
        }

        const textareaCandidates = document.querySelectorAll('textarea')
        const contenteditableCandidates = document.querySelectorAll('div[contenteditable="true"]')
        const buttonCandidates = document.querySelectorAll('button')

        input.focus()
        if (input.tagName === 'TEXTAREA') {
          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          nativeSetter.call(input, q)
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: q }))
        } else if (input.isContentEditable) {
          input.textContent = q
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: q }))
        }

        const sendBtn = [...buttonCandidates].find(
          (b) => b.className.includes('ds-button--primary') || b.className.includes('ds-button--filled') || b.textContent?.includes('Send')
        )

        if (sendBtn) {
          sendBtn.click()
          marker.textContent = 'StockHelper: submitted'
          return {
            ok: true,
            reason: 'clicked_button',
            url: location.href,
            title: document.title,
            textareaCount: textareaCandidates.length,
            contenteditableCount: contenteditableCandidates.length,
            buttonCount: buttonCandidates.length,
          }
        }

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))
        marker.textContent = 'StockHelper: submitted'
        return {
          ok: true,
          reason: 'pressed_enter',
          url: location.href,
          title: document.title,
          textareaCount: textareaCandidates.length,
          contenteditableCount: contenteditableCandidates.length,
          buttonCount: buttonCandidates.length,
        }
      },
      args: [question],
      world: 'MAIN',
    })
  } catch (e) {
    rlog(`inject FAILED query=${id} tab=${tab.id}: ${e.message}`)
    submitResult = []
  }

  const result = submitResult?.[0]?.result
  rlog(`dispatched query=${id} tab=${tab.id} source=${options.source || 'poll'} submit=${JSON.stringify(result)}`)
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

async function waitForTabReady(tabId) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (tab.status === 'complete') {
        await sleep(500)
        return
      }
    } catch {}
    await sleep(500)
  }
}

function updateBadge(text, color) {
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

updateBadge('ON', '#22c55e')
