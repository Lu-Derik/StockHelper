const LOCAL_BACKEND = 'http://localhost:3011'

// The 开发DeepSeek option only makes sense on the machine that hosts the backend
// locally (the all-local dev setup), so we probe localhost:3011 before showing it.
async function localBackendReachable() {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch(`${LOCAL_BACKEND}/health`, { signal: ctrl.signal })
    clearTimeout(t)
    return res.ok
  } catch { return false }
}

async function loadConfig() {
  const data = await chrome.storage.local.get(['stockhelper_api_key', 'stockhelper_mode'])
  document.getElementById('apiKey').value = data.stockhelper_api_key || ''

  const devOpt = document.querySelector('#mode option[value="dev"]')
  const showDev = await localBackendReachable()
  devOpt.hidden = !showDev

  let mode = data.stockhelper_mode
  if (mode !== 'backend' && mode !== 'dev') mode = 'local'
  if (mode === 'dev' && !showDev) mode = 'local'  // dev not applicable here
  document.getElementById('mode').value = mode

  document.getElementById('status').textContent = '已加载当前配置'
  document.getElementById('status').className = 'ok'
}

document.getElementById('save').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim()
  const mode = document.getElementById('mode').value
  await chrome.storage.local.set({ stockhelper_api_key: apiKey, stockhelper_mode: mode })
  // Clean up legacy keys so server stays hardcoded.
  await chrome.storage.local.remove(['stockhelper_server', 'stockhelper_worker_mode', 'stockhelper_backend_worker'])
  document.getElementById('status').textContent = '已保存，正在重载扩展…'
  document.getElementById('status').className = 'ok'
  chrome.runtime.reload()
})

loadConfig().catch(() => {
  document.getElementById('status').textContent = '读取配置失败'
  document.getElementById('status').className = 'warn'
})
