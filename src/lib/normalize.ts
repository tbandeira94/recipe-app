export function normalizeIngredientName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function uniqueLabels(values: string[]): string[] {
  const seen = new Set<string>()
  return values
    .map((value) => value.trim().replace(/\s+/g, ' '))
    .filter((value) => {
      const key = value.toLocaleLowerCase()
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}
