import { describe, expect, it } from 'vitest'
import { castTriggers, entersTriggers, isPermanentSpell, qualifierMatches } from './triggers'
import type { BattlefieldPermanent, Card } from './types'

/** Real oracle text from Scryfall, fetched 2026-09-03. */
const card = (name: string, typeLine: string, oracleText: string, colors: string[] = []): Card => ({
  scryfallId: name,
  oracleId: name,
  name,
  typeLine,
  keywords: [],
  colors,
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

describe('entersTriggers', () => {
  it('offers enters triggers from the battlefield and marks intervening-if conditions uncertain', () => {
    const entering = onField(kozilek)
    const result = entersTriggers(
      entering,
      [onField(ulalek), onField(guardian), entering],
      commanderIds,
    )
    expect(result.map((s) => [s.source.name, s.certain])).toEqual([['Guardian Project', undefined]])
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
