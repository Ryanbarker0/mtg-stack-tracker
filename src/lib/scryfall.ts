import { normaliseText } from './text'
import type { Card, CardFace, DecklistLine } from './types'

/**
 * Thin client for the public Scryfall API (https://scryfall.com/docs/api).
 *
 * Scryfall asks for at most ~10 requests per second, so batch requests are spaced
 * out. All card data in the app originates here; nothing is hand-authored.
 */

const BASE = 'https://api.scryfall.com'
const BATCH_SIZE = 75
const REQUEST_GAP_MS = 120

interface ScryfallImageUris {
  small?: string
  normal?: string
  art_crop?: string
}

interface ScryfallFace {
  name: string
  colors?: string[]
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  image_uris?: ScryfallImageUris
}

export interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  layout: string
  type_line: string
  mana_cost?: string
  oracle_text?: string
  keywords?: string[]
  colors?: string[]
  cmc?: number
  image_uris?: ScryfallImageUris
  card_faces?: ScryfallFace[]
  scryfall_uri: string
}

interface CollectionResponse {
  data: ScryfallCard[]
  not_found: Array<Record<string, string>>
}

interface RulingsResponse {
  data: Array<{ comment: string; published_at: string }>
}

interface AutocompleteResponse {
  data: string[]
}

export interface LookupResult {
  found: Array<{ line: DecklistLine; card: Card }>
  notFound: DecklistLine[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = (await response.json()) as { details?: string }
      if (body.details) detail = body.details
    } catch {
      // Body wasn't JSON; keep the status text.
    }
    throw new Error(`Scryfall ${response.status}: ${detail}`)
  }
  return (await response.json()) as T
}

/**
 * Converts a Scryfall card into our trimmed local shape.
 *
 * Layout handling: transform / modal DFC cards carry per-face images and text and no
 * top-level image. Split, adventure and flip cards carry per-face text but a single
 * shared image. Everything else has one face built from the top-level fields.
 */
export function toCard(source: ScryfallCard): Card {
  const sharedImage = source.image_uris?.normal ?? source.image_uris?.small
  const faces: CardFace[] =
    source.card_faces && source.card_faces.length > 0
      ? source.card_faces.map((face) => ({
          name: face.name,
          manaCost: face.mana_cost ?? '',
          typeLine: face.type_line ?? source.type_line,
          oracleText: face.oracle_text ?? '',
          imageUrl: face.image_uris?.normal ?? face.image_uris?.small ?? sharedImage,
        }))
      : [
          {
            name: source.name,
            manaCost: source.mana_cost ?? '',
            typeLine: source.type_line,
            oracleText: source.oracle_text ?? '',
            imageUrl: sharedImage,
          },
        ]

  return {
    scryfallId: source.id,
    // Reversible cards and a few odd layouts lack oracle_id; fall back to the printing id.
    oracleId: source.oracle_id ?? source.id,
    name: source.name,
    typeLine: source.type_line,
    keywords: source.keywords ?? [],
    colors: source.colors ?? unionColors(source.card_faces),
    manaValue: source.cmc,
    faces,
    scryfallUri: source.scryfall_uri,
  }
}

/** Transform cards carry colours per face; the card's colour is the union. */
function unionColors(faces: ScryfallFace[] | undefined): string[] | undefined {
  if (!faces || faces.every((f) => f.colors === undefined)) return undefined
  return [...new Set(faces.flatMap((f) => f.colors ?? []))]
}

function identifierFor(line: DecklistLine): Record<string, string> {
  if (line.set && line.collectorNumber) {
    return { set: line.set, collector_number: line.collectorNumber }
  }
  return { name: line.name }
}

/**
 * Looks up every line of a decklist. Lines with a set and collector number are
 * requested by printing; the rest by exact name. Anything Scryfall cannot match by
 * printing is retried by name, and anything still missing is retried with fuzzy
 * matching so minor typos and single-face names still resolve.
 */
export async function lookupDecklist(
  lines: DecklistLine[],
  onProgress?: (done: number, total: number) => void,
): Promise<LookupResult> {
  const found: LookupResult['found'] = []
  let pending = [...lines]
  let done = 0

  const runBatches = async (
    items: DecklistLine[],
    toIdentifier: (line: DecklistLine) => Record<string, string>,
  ): Promise<DecklistLine[]> => {
    const missing: DecklistLine[] = []
    for (let start = 0; start < items.length; start += BATCH_SIZE) {
      const batch = items.slice(start, start + BATCH_SIZE)
      if (start > 0) await sleep(REQUEST_GAP_MS)
      const response = await request<CollectionResponse>('/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map(toIdentifier) }),
      })
      const cards = response.data.map(toCard)
      for (const line of batch) {
        const card = matchCard(line, cards, toIdentifier(line))
        if (card) {
          found.push({ line, card })
          done += 1
          onProgress?.(done, lines.length)
        } else {
          missing.push(line)
        }
      }
    }
    return missing
  }

  // Pass 1: by printing where we have one, else by name.
  pending = await runBatches(pending, identifierFor)
  // Pass 2: retry anything that failed by printing using the name instead.
  const byPrinting = pending.filter((l) => l.set && l.collectorNumber)
  if (byPrinting.length > 0) {
    const stillMissing = await runBatches(byPrinting, (l) => ({ name: l.name }))
    pending = pending.filter((l) => !byPrinting.includes(l) || stillMissing.includes(l))
  }
  // Pass 3: fuzzy, one request per line.
  const notFound: DecklistLine[] = []
  for (const line of pending) {
    await sleep(REQUEST_GAP_MS)
    const card = await fetchNamed(line.name, 'fuzzy')
    if (card) {
      found.push({ line, card })
      done += 1
      onProgress?.(done, lines.length)
    } else {
      notFound.push(line)
    }
  }

  return { found, notFound }
}

/**
 * Picks the returned card for a decklist line. A printing match (set and collector
 * number) is only accepted when the card's name also agrees with the list, because a
 * stale or mistyped collector number is far more likely than a wrong name. Lines whose
 * printing points at a different card fall through to the by-name retry.
 */
export function matchCard(
  line: DecklistLine,
  cards: Card[],
  identifier: Record<string, string>,
): Card | undefined {
  const wanted = normaliseText(line.name)
  const nameMatches = (c: Card) =>
    normaliseText(c.name) === wanted ||
    c.faces.some((f) => normaliseText(f.name) === wanted) ||
    normaliseText(c.name).startsWith(`${wanted} //`)

  if (identifier.set && identifier.collector_number) {
    const printing = cards.find((c) =>
      c.scryfallUri.toLowerCase().includes(`/${identifier.set}/${identifier.collector_number}/`),
    )
    return printing && nameMatches(printing) ? printing : undefined
  }
  return cards.find(nameMatches)
}

export async function fetchNamed(name: string, mode: 'exact' | 'fuzzy'): Promise<Card | null> {
  try {
    const card = await request<ScryfallCard>(`/cards/named?${mode}=${encodeURIComponent(name)}`)
    return toCard(card)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Scryfall 404')) return null
    throw error
  }
}

export async function autocomplete(query: string): Promise<string[]> {
  if (query.trim().length < 2) return []
  const response = await request<AutocompleteResponse>(
    `/cards/autocomplete?q=${encodeURIComponent(query)}`,
  )
  return response.data
}

export async function fetchRulings(scryfallId: string): Promise<string[]> {
  const response = await request<RulingsResponse>(`/cards/${scryfallId}/rulings`)
  return response.data.map((r) => r.comment)
}
