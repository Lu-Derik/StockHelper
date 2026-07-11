async function loadConfig() {
  const data = await chrome.storage.local.get(['stockhelper_api_key'])
  document.getElementById('apiKey').value = data.stockhelper_api_key || ''
  document.getElementById('status').textContent = '已加载当前配置'
  document.getElementById('status').className = 'ok'
}

document.getElementById('save').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim()
  await chrome.storage.local.set({ stockhelper_api_key: apiKey })
  // Clean up legacy keys so server stays hardcoded and worker stays automatic.
  await chrome.storage.local.remove(['stockhelper_server', 'stockhelper_mode', 'stockhelper_worker_mode', 'stockhelper_backend_worker'])
  document.getElementById('status').textContent = '已保存，正在重载扩展…'
  document.getElementById('status').className = 'ok'
  chrome.runtime.reload()
})

loadConfig().catch(() => {
  document.getElementById('status').textContent = '读取配置失败'
  document.getElementById('status').className = 'warn'
})
