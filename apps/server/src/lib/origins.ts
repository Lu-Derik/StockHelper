const EXTENSION_SCHEMES = [
  'chrome-extension',
  'ms-browser-extension',
  'moz-extension',
  'extension',
  'safari-web-extension',
]

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: Set<string>): boolean {
  if (!origin) return false

  const normalized = origin.trim()
  if (!normalized) return false

  if (allowedOrigins.has(normalized)) return true

  return EXTENSION_SCHEMES.some((scheme) => normalized.startsWith(`${scheme}://`))
}
