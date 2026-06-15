// Central API helper. In remote (personal) deployment the Vercel frontend
// reaches the local backend through a Cloudflare Tunnel; those public requests
// must carry the shared secret. Locally NEXT_PUBLIC_API_KEY is unset and no
// header is sent (the backend's localhost path is exempt anyway).
// 本机后端经 Docker 映射在 3011（容器内仍是 3001）。Vercel 上由 NEXT_PUBLIC_API_URL 覆盖。
export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3011'
const KEY = process.env.NEXT_PUBLIC_API_KEY ?? ''

export function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (KEY) headers.set('X-API-Key', KEY)
  return fetch(path.startsWith('http') ? path : `${API}${path}`, { ...init, headers })
}
