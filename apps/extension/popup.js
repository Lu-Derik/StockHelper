const DEFAULT_SERVER = 'http://localhost:3011'

async function loadConfig() {
  const data = await chrome.storage.local.get(['stockhelper_server', 'stockhelper_api_key', 'stockhelper_mode'])
  document.getElementById('server').value = data.stockhelper_server || DEFAULT_SERVER
  document.getElementById('apiKey').value = data.stockhelper_api_key || ''
  document.getElementById('mode').value = data.stockhelper_mode || 'app'
  document.getElementById('status').textContent = '已加载当前配置'
  document.getElementById('status').className = 'ok'
}

document.getElementById('save').addEventListener('click', async () => {
  const server = document.getElementById('server').value.trim() || DEFAULT_SERVER
  const apiKey = document.getElementById('apiKey').value.trim()
  const mode = document.getElementById('mode').value
  await chrome.storage.local.set({
    stockhelper_server: server.replace(/\/$/, ''),
    stockhelper_api_key: apiKey,
    stockhelper_mode: mode,
  })
  document.getElementById('status').textContent = '已保存，正在重载扩展…'
  document.getElementById('status').className = 'ok'
  chrome.runtime.reload()
})

loadConfig().catch(() => {
  document.getElementById('status').textContent = '读取配置失败'
  document.getElementById('status').className = 'warn'
})
