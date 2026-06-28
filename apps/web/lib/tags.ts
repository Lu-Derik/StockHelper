// Separators: space, comma, Chinese comma, 顿号, semicolons, period
const SEP = /[\s,，、；;。]+/

export function parseTags(concept: string | null | undefined): string[] {
  if (!concept?.trim()) return []
  return concept.split(SEP).map((t) => t.trim()).filter(Boolean)
}

// Normalise user input → comma-separated canonical form stored in DB
export function normaliseTags(raw: string): string {
  return parseTags(raw).join(',')
}
