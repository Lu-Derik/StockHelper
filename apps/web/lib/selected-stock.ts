// Shared "currently selected stock" so that switching pages (提问 / K线 / 记录)
// via the navbar carries the stock highlighted in the sidebar as the default.
const KEY = 'stockhelper_selected_stock'
export const SELECTED_EVENT = 'selected-stock-changed'

export interface SelectedStock {
  code: string
  name: string
}

export function getSelectedStock(): SelectedStock | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SelectedStock) : null
  } catch {
    return null
  }
}

export function setSelectedStock(s: SelectedStock) {
  localStorage.setItem(KEY, JSON.stringify(s))
  window.dispatchEvent(new CustomEvent(SELECTED_EVENT))
}
