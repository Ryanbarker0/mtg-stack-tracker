import type { DecklistLine } from './types'

/**
 * Parses a pasted decklist into lines we can look up on Scryfall.
 *
 * Supported shapes (all commonly produced by Archidekt, Moxfield and Arena exports):
 *
 *   1 Ulalek, Fused Atrocity
 *   1x Ulalek, Fused Atrocity (m3c) 4 [Commander{top}]
 *   1 Ulalek, Fused Atrocity (M3C) 4 *CMDR*
 *   Ulalek, Fused Atrocity
 *
 * Section headings such as "Commander", "Deck", "Sideboard" and "Maybeboard" are
 * recognised. Cards under a Commander heading are flagged as commanders and cards
 * under a Maybeboard heading are ignored. Blank lines and "//" or "#" comments are skipped.
 */
export function parseDecklist(text: string): DecklistLine[] {
  const lines: DecklistLine[] = []
  let section: 'main' | 'commander' | 'maybeboard' = 'main'

  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim()
    if (raw === '' || raw.startsWith('#')) continue

    const heading = matchHeading(raw)
    if (heading) {
      section = heading
      continue
    }
    if (raw.startsWith('//')) continue
    if (section === 'maybeboard') continue

    const parsed = parseLine(raw)
    if (!parsed) continue
    if (section === 'commander') parsed.isCommander = true
    lines.push(parsed)
  }

  return lines
}

function matchHeading(line: string): 'main' | 'commander' | 'maybeboard' | null {
  const normalised = line
    .replace(/^\/\/\s*/, '')
    .replace(/[:\s]+$/, '')
    .toLowerCase()
  if (/^commanders?$/.test(normalised)) return 'commander'
  if (/^(maybeboard|maybe|considering)$/.test(normalised)) return 'maybeboard'
  if (/^(deck|main|mainboard|main deck|sideboard|companion|tokens?)$/.test(normalised))
    return 'main'
  return null
}

const LINE_PATTERN =
  // quantity          name                       (set) number
  /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([A-Za-z0-9★-]+))?)?\s*$/

export function parseLine(raw: string): DecklistLine | null {
  let working = raw
  let isCommander = false

  // Moxfield style commander marker.
  if (/\*CMDR\*/i.test(working)) {
    isCommander = true
    working = working.replace(/\*CMDR\*/gi, '')
  }

  // Archidekt categories, e.g. "[Commander{top}]" or "[Ramp,Removal]".
  const categories = [...working.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1])
  if (categories.some((c) => /commander/i.test(c))) isCommander = true
  working = working.replace(/\[[^\]]*\]/g, '')

  // Archidekt foil / modifier markers, e.g. "^Foil^", and Moxfield "*F*".
  working = working.replace(/\^[^^]*\^/g, '').replace(/\*F\*/gi, '')

  working = working.trim()
  if (working === '') return null

  const match = LINE_PATTERN.exec(working)
  if (!match) return null

  const [, qty, name, set, collectorNumber] = match
  const cleanName = name.trim()
  if (cleanName === '') return null

  return {
    quantity: qty ? Math.max(1, parseInt(qty, 10)) : 1,
    name: cleanName,
    set: set?.toLowerCase(),
    collectorNumber,
    isCommander,
    raw,
  }
}
