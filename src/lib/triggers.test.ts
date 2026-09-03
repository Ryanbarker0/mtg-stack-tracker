import { describe, expect, it } from 'vitest'
import { castTriggers, entersTriggers, isPermanentSpell, qualifierMatches } from './triggers'
import type { BattlefieldPermanent, Card } from './types'

/** Real oracle text from Scryfall, fetched 2026-09-03. */
const card = (
  name: string,
  typeLine: string,
  oracleText: string,
  colors: string[] = [],
  manaValue = 10,
): Card => ({
  scryfallId: name,
  oracleId: name,
  name,
  typeLine,
  keywords: [],
  colors,
  manaValue,
  faces: [{ name, manaCost: '', typeLine, oracleText }],
  scryfallUri: `https://scryfall.com/card/x/1/${name}`,
})

const ulalek = card(
  'Ulalek, Fused Atrocity',
  'Legendary Creature — Eldrazi',
  "Devoid (This card has no color.)\nWhenever you cast an Eldrazi spell, you may pay {C}{C}. If you do, copy all spells you control, then copy all other activated and triggered abilities you control. You may choose new targets for the copies. (Mana abilities can't be copied.)",
)
const monument = card(
  'Forsaken Monument',
  'Legendary Artifact',
  'Colorless creatures you control get +2/+2.\nWhenever you tap a permanent for {C}, add an additional {C}.\nWhenever you cast a colorless spell, you gain 2 life.',
)
const echoes = card(
  'Echoes of Eternity',
  'Kindred Enchantment — Eldrazi',
  'If a triggered ability of a colorless spell you control or another colorless permanent you control triggers, that ability triggers an additional time.\nWhenever you cast a colorless spell, copy it. You may choose new targets for the copy. (A copy of a permanent spell becomes a token.)',
)
const guardian = card(
  'Guardian Project',
  'Enchantment',
  "Whenever a nontoken creature you control enters, if it doesn't have the same name as another creature you control or a creature card in your graveyard, draw a card.",
  ['G'],
)
const kozilek = card(
  'Kozilek, Butcher of Truth',
  'Legendary Creature — Eldrazi',
  'When you cast this spell, draw four cards.\nAnnihilator 4 (Whenever this creature attacks, defending player sacrifices four permanents of their choice.)\nWhen Kozilek is put into a graveyard from anywhere, its owner shuffles their graveyard into their library.',
)
const counterspell = card('Counterspell', 'Instant', 'Counter target spell.', ['U'])

const onField = (c: Card, isToken = false): BattlefieldPermanent => ({
  id: `field-${c.name}-${isToken}`,
  card: c,
  faceIndex: 0,
  isToken,
})

const commanderIds = new Set([ulalek.oracleId])

describe('qualifierMatches', () => {
  const subject = { card: kozilek, face: kozilek.faces[0], isToken: false }
  it('evaluates types, subtypes and colours', () => {
    expect(qualifierMatches('Eldrazi', subject)).toBe(true)
    expect(qualifierMatches('colorless', subject)).toBe(true)
    expect(qualifierMatches('colorless creature', subject)).toBe(true)
    expect(qualifierMatches('noncreature', subject)).toBe(false)
    expect(qualifierMatches('instant or sorcery', subject)).toBe(false)
    expect(qualifierMatches('Human', subject)).toBe(false)
    expect(
      qualifierMatches('blue', { card: counterspell, face: counterspell.faces[0], isToken: false }),
    ).toBe(true)
  })

  it('is uncertain when colours are unknown or a word is not understood', () => {
    const noColors = { ...kozilek, colors: undefined }
    expect(
      qualifierMatches('colorless', { card: noColors, face: noColors.faces[0], isToken: false }),
    ).toBe(undefined)
  })
})

describe('castTriggers', () => {
  it("offers the spell's own cast trigger and every matching cast trigger on the battlefield", () => {
    const result = castTriggers(
      kozilek,
      0,
      [onField(ulalek), onField(monument), onField(guardian)],
      commanderIds,
    )
    expect(result.map((s) => [s.source.name, s.certain, s.times, s.fromCommander])).toEqual([
      ['Kozilek, Butcher of Truth', true, 1, false],
      ['Forsaken Monument', true, 1, false],
      ['Ulalek, Fused Atrocity', true, 1, true],
    ])
  })

  it('places the commander last so its trigger sits on top of the stack', () => {
    const result = castTriggers(kozilek, 0, [onField(ulalek), onField(monument)], commanderIds)
    expect(result[result.length - 1].source.name).toBe('Ulalek, Fused Atrocity')
  })

  it('skips triggers whose condition clearly fails', () => {
    const result = castTriggers(counterspell, 0, [onField(ulalek), onField(monument)], commanderIds)
    expect(result).toEqual([])
  })

  it('flags Echoes of Eternity as copying the spell so the app can do it on resolve', () => {
    const result = castTriggers(kozilek, 0, [onField(echoes), onField(monument)], commanderIds)
    expect(result.map((s) => [s.source.name, s.copiesSpell])).toEqual([
      ['Kozilek, Butcher of Truth', false],
      ['Echoes of Eternity', true],
      ['Forsaken Monument', false],
    ])
  })

  it('doubles triggers from colorless sources when Echoes of Eternity is out, but not its own', () => {
    const result = castTriggers(kozilek, 0, [onField(ulalek), onField(echoes)], commanderIds)
    expect(result.map((s) => [s.source.name, s.times, s.doubledBy])).toEqual([
      ['Kozilek, Butcher of Truth', 2, 'Echoes of Eternity'],
      ['Echoes of Eternity', 1, undefined],
      ['Ulalek, Fused Atrocity', 2, 'Echoes of Eternity'],
    ])
  })
})

describe('granted abilities', () => {
  const zhulodok = card(
    'Zhulodok, Void Gorger',
    'Legendary Creature — Eldrazi',
    'Colorless spells you cast from your hand with mana value 7 or greater have "Cascade, cascade." (When you cast one, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order. Then do it again.)',
  )

  it("offers Zhulodok's double cascade as the spell's own trigger, doubled by Echoes", () => {
    const result = castTriggers(kozilek, 0, [onField(zhulodok), onField(echoes)], new Set())
    const cascade = result.find((s) => s.ability.fromKeyword)
    expect(cascade).toMatchObject({
      source: kozilek,
      certain: undefined,
      uncertainReason: 'from your hand',
      times: 4,
      doubledBy: 'Zhulodok, Void Gorger + Echoes of Eternity',
    })
    expect(cascade?.ability.text).toMatch(
      /^Cascade \(granted by Zhulodok, Void Gorger\)\. When you cast one, exile cards/,
    )
    expect(castTriggers(counterspell, 0, [onField(zhulodok)], new Set())).toEqual([])
  })

  it('marks an own cast trigger with an intervening if as uncertain', () => {
    const distortion = card(
      'Kozilek, the Great Distortion',
      'Legendary Creature — Eldrazi',
      'When you cast this spell, if you have fewer than seven cards in hand, draw cards equal to the difference.\nMenace\nDiscard a card with mana value X: Counter target spell with mana value X.',
    )
    const result = castTriggers(distortion, 0, [], new Set())
    expect(result.map((s) => [s.certain, s.uncertainReason])).toEqual([
      [undefined, 'if you have fewer than seven cards in hand'],
    ])
  })
})

describe('mana value conditions', () => {
  const sanctum = card(
    'Sanctum of Ugin',
    'Land',
    '{T}: Add {C}.\nWhenever you cast a colorless spell with mana value 7 or greater, you may sacrifice this land. If you do, search your library for a colorless creature card, reveal it, put it into your hand, then shuffle.',
  )
  const unsealing = card(
    "Kozilek's Unsealing",
    'Enchantment',
    'Devoid (This card has no color.)\nWhenever you cast a creature spell with mana value 4, 5, or 6, create two 0/1 colorless Eldrazi Spawn creature tokens with "Sacrifice this token: Add {C}."\nWhenever you cast a creature spell with mana value 7 or greater, draw three cards.',
  )
  const seer = card(
    'Thought-Knot Seer',
    'Creature — Eldrazi',
    'Devoid (This card has no color.)',
    [],
    4,
  )

  it("evaluates 'or greater' and lists against the spell's mana value", () => {
    const fromField = (list: ReturnType<typeof castTriggers>) =>
      list.filter((s) => s.source !== kozilek && s.source !== seer)
    const big = fromField(
      castTriggers(kozilek, 0, [onField(sanctum), onField(unsealing)], new Set()),
    )
    expect(big.map((s) => [s.source.name, s.certain, /7 or greater/.test(s.ability.text)])).toEqual(
      [
        ['Sanctum of Ugin', true, true],
        ["Kozilek's Unsealing", true, true],
      ],
    )

    const small = fromField(
      castTriggers(seer, 0, [onField(sanctum), onField(unsealing)], new Set()),
    )
    expect(small.map((s) => [s.source.name, s.certain, /4, 5, or 6/.test(s.ability.text)])).toEqual(
      [["Kozilek's Unsealing", true, true]],
    )
  })

  it('notes that a doubled self-sacrifice trigger only does anything once', () => {
    const result = castTriggers(kozilek, 0, [onField(sanctum), onField(echoes)], new Set()).filter(
      (s) => s.source.name === 'Sanctum of Ugin',
    )
    expect(result).toHaveLength(1)
    expect(result[0].times).toBe(2)
    expect(result[0].note).toMatch(/only the first/)
    const single = castTriggers(kozilek, 0, [onField(sanctum)], new Set()).filter(
      (s) => s.source.name === 'Sanctum of Ugin',
    )
    expect(single[0].note).toBeUndefined()
  })

  it('asks the user when the mana value was never stored', () => {
    const old = { ...kozilek, manaValue: undefined }
    const result = castTriggers(old, 0, [onField(sanctum)], new Set()).filter(
      (s) => s.source.name === 'Sanctum of Ugin',
    )
    expect(result.map((s) => [s.certain, s.uncertainReason])).toEqual([
      [undefined, 'mana value unknown, re-import the deck'],
    ])
  })
})

describe('entersTriggers', () => {
  it('offers enters triggers from the battlefield and marks intervening-if conditions uncertain', () => {
    const entering = onField(kozilek)
    const result = entersTriggers(
      entering,
      [onField(ulalek), onField(guardian), entering],
      commanderIds,
    )
    expect(result.map((s) => [s.source.name, s.certain, s.uncertainReason])).toEqual([
      [
        'Guardian Project',
        undefined,
        "if it doesn't have the same name as another creature you control or a creature card in your graveyard",
      ],
    ])
  })

  it('does not offer Guardian Project for a token', () => {
    const token = onField(kozilek, true)
    expect(entersTriggers(token, [onField(guardian), token], commanderIds)).toEqual([])
  })

  it("offers the permanent's own enters trigger", () => {
    const seer = card(
      'Thought-Knot Seer',
      'Creature — Eldrazi',
      'Devoid (This card has no color.)\nWhen this creature enters, target opponent reveals their hand. You choose a nonland card from it and exile that card.\nWhen this creature leaves the battlefield, target opponent draws a card.',
    )
    const entering = onField(seer)
    const result = entersTriggers(entering, [entering], new Set())
    expect(result.map((s) => s.ability.text.slice(0, 26))).toEqual(['When this creature enters,'])
  })
})

describe('isPermanentSpell', () => {
  it('distinguishes permanents from instants and sorceries', () => {
    expect(isPermanentSpell(kozilek.faces[0])).toBe(true)
    expect(isPermanentSpell(counterspell.faces[0])).toBe(false)
    expect(isPermanentSpell(echoes.faces[0])).toBe(true)
  })
})
