// Offscreen document — runs persistently, polls server every 3 seconds
const SERVER = 'http://localhost:3001'

setInterval(async () => {
  try {
    chrome.runtime.sendMessage({ type: 'poll_tick' })
  } catch {
    // background context gone — offscreen will be recreated
  }
}, 3000)
