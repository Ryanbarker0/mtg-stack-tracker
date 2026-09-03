import { describe, expect, it } from 'vitest'
import { matchCard, toCard, type ScryfallCard } from './scryfall'
import type { DecklistLine } from './types'

const line = (name: string, set?: string, collectorNumber?: string): DecklistLine => ({
  quantity: 1,
  name,
  set,
  collectorNumber,
  isCommander: false,
  raw: name,
})

const scry = (overrides: Partial<ScryfallCard>): ScryfallCard => ({
  id: 'id',
  oracle_id: 'oracle',
  name: 'Sol Ring',
  layout: 'normal',
  type_line: 'Artifact',
  oracle_text: '{T}: Add {C}{C}.',
  scryfall_uri: 'https://scryfall.com/card/m3c/269/sol-ring',
  image_uris: { normal: 'https://cards.scryfall.io/normal/sol.jpg' },
  ...overrides,
})

describe('toCard', () => {
  it('builds one face from top-level fields for a normal card', () => {
    const card = toCard(scry({}))
    expect(card.faces).toHaveLength(1)
    expect(card.faces[0]).toMatchObject({
      name: 'Sol Ring',
      oracleText: '{T}: Add {C}{C}.',
      imageUrl: 'https://cards.scryfall.io/normal/sol.jpg',
    })
  })

  it('uses per-face images for transform cards and the shared image for split cards', () => {
    const transform = toCard(
      scry({
        layout: 'modal_dfc',
        name: 'Valakut Awakening // Valakut Stoneforge',
        image_uris: undefined,
        card_faces: [
          { name: 'Valakut Awakening', oracle_text: 'Front', image_uris: { normal: 'front.jpg' } },
          { name: 'Valakut Stoneforge', oracle_text: 'Back', image_uris: { normal: 'back.jpg' } },
        ],
      }),
    )
    expect(transform.faces.map((f) => f.imageUrl)).toEqual(['front.jpg', 'back.jpg'])

    const split = toCard(
      scry({
        layout: 'split',
        name: 'Fire // Ice',
        image_uris: { normal: 'shared.jpg' },
        card_faces: [
          { name: 'Fire', oracle_text: 'Fire' },
          { name: 'Ice', oracle_text: 'Ice' },
        ],
      }),
    )
    expect(split.faces.map((f) => f.imageUrl)).toEqual(['shared.jpg', 'shared.jpg'])
  })
})

describe('matchCard', () => {
  const solRing = toCard(scry({}))
  const archon = toCard(
    scry({
      id: 'archon',
      name: 'Archon of Cruelty',
      scryfall_uri: 'https://scryfall.com/card/m3c/191/archon-of-cruelty',
    }),
  )

  it('matches by exact name when no printing is given', () => {
    expect(matchCard(line('sol ring'), [archon, solRing], { name: 'sol ring' })).toBe(solRing)
  })

  it('matches by printing only when the name agrees', () => {
    const wrongNumber = line('Kozilek, Butcher of Truth', 'm3c', '191')
    expect(
      matchCard(wrongNumber, [archon], { set: 'm3c', collector_number: '191' }),
    ).toBeUndefined()
    const right = line('Archon of Cruelty', 'm3c', '191')
    expect(matchCard(right, [archon], { set: 'm3c', collector_number: '191' })).toBe(archon)
  })

  it('matches a front-face name against a double-faced card', () => {
    const dfc = toCard(
      scry({
        name: 'Valakut Awakening // Valakut Stoneforge',
        card_faces: [{ name: 'Valakut Awakening' }, { name: 'Valakut Stoneforge' }],
      }),
    )
    expect(matchCard(line('Valakut Awakening'), [dfc], { name: 'Valakut Awakening' })).toBe(dfc)
  })
})
