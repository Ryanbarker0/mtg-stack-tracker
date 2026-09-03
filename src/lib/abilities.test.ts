import { describe, expect, it } from 'vitest'
import {
  castTriggerTypes,
  classifyLine,
  extractAbilities,
  includedByDefault,
  inclusionReason,
  splitOracleText,
} from './abilities'
import type { Card } from './types'

describe('classifyLine', () => {
  it('classifies triggered abilities', () => {
    expect(
      classifyLine(
        "Whenever you cast an Eldrazi spell, you may pay {C}{C}. If you do, copy all spells you control, then copy all other activated and triggered abilities you control. You may choose new targets for the copies. (Mana abilities can't be copied.)",
      ),
    ).toBe('triggered')
    expect(classifyLine('When this creature enters, draw a card.')).toBe('triggered')
    expect(classifyLine('At the beginning of your upkeep, you lose 1 life.')).toBe('triggered')
    expect(classifyLine('When you cast this spell, exile target permanent.')).toBe('triggered')
  })

  it('classifies ability-word triggers', () => {
    expect(classifyLine('Landfall — Whenever a land enters under your control, scry 1.')).toBe(
      'triggered',
    )
  })

  it('classifies triggered keywords with and without reminder text', () => {
    expect(classifyLine('Annihilator 2')).toBe('triggered')
    expect(
      classifyLine(
        'Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents.)',
      ),
    ).toBe('triggered')
    expect(classifyLine('Ward {2}')).toBe('triggered')
    expect(classifyLine('Ward—Pay 7 life.')).toBe('triggered')
    expect(classifyLine('Cascade')).toBe('triggered')
    expect(
      classifyLine('Flying, protection from spells that are one or more colors, annihilator 6'),
    ).toBe('triggered')
    expect(classifyLine('Flying, trample, protection from instants')).toBe('static')
  })

  it('classifies activated abilities', () => {
    expect(classifyLine('{2}, {T}: Draw a card.')).toBe('activated')
    expect(
      classifyLine('Sacrifice a creature: Target creature gets +2/+2 until end of turn.'),
    ).toBe('activated')
    expect(classifyLine('Equip {3}')).toBe('activated')
    expect(classifyLine('Cycling {2} ({2}, Discard this card: Draw a card.)')).toBe('activated')
  })

  it('classifies mana abilities so they are excluded from the stack', () => {
    expect(classifyLine('{T}: Add {C}.')).toBe('mana')
    expect(classifyLine('{T}: Add one mana of any color.')).toBe('mana')
    expect(classifyLine('Whenever you tap a Forest for mana, add an additional {G}.')).toBe('mana')
  })

  it('treats an "Add" effect with a target as a real activated ability', () => {
    expect(classifyLine('{T}: Add {C}. Target creature gains haste until end of turn.')).toBe(
      'activated',
    )
  })

  it('classifies static abilities and granted-ability text', () => {
    expect(classifyLine('Devoid (This card has no color.)')).toBe('static')
    expect(classifyLine('Flying')).toBe('static')
    expect(classifyLine('Eldrazi spells you cast cost {1} less to cast.')).toBe('static')
    expect(classifyLine('Enchanted creature has "{T}: Add {C}."')).toBe('static')
  })

  it('does not treat a modal "Choose one:" colon as a cost', () => {
    expect(classifyLine('Choose one: destroy target artifact; or draw a card.')).toBe('static')
  })
})

describe('splitOracleText', () => {
  it('folds modal bullets into the introducing paragraph', () => {
    const text =
      'When this creature enters, choose one —\n• Draw a card.\n• Discard a card.\nFlying'
    expect(splitOracleText(text)).toEqual([
      'When this creature enters, choose one —\n• Draw a card.\n• Discard a card.',
      'Flying',
    ])
  })
})

const card = (oracleText: string, typeLine = 'Creature — Eldrazi'): Card => ({
  scryfallId: 'id',
  oracleId: 'oracle',
  name: 'Test',
  typeLine,
  keywords: [],
  faces: [{ name: 'Test', manaCost: '', typeLine, oracleText }],
  scryfallUri: 'https://scryfall.com/card/x/1/test',
})

describe('extractAbilities and usesStack', () => {
  it('gives each paragraph a stable id and kind', () => {
    const abilities = extractAbilities(
      card(
        'Devoid (This card has no color.)\nWhen this creature enters, draw a card.\n{T}: Add {C}.',
      ),
    )
    expect(abilities.map((a) => [a.id, a.kind])).toEqual([
      ['oracle:0:0', 'static'],
      ['oracle:0:1', 'triggered'],
      ['oracle:0:2', 'mana'],
    ])
  })

  it('includes cards with stack abilities and instants or sorceries by default', () => {
    expect(includedByDefault(card('When this creature enters, draw a card.'))).toBe(true)
    expect(includedByDefault(card('{T}: Add {C}.', 'Land'))).toBe(false)
    expect(includedByDefault(card('Flying'))).toBe(false)
    expect(includedByDefault(card('{T}: Add {C}{C}.', 'Artifact'))).toBe(false)
    const command = card(
      'Choose two —\n• Target player creates X 0/1 colorless Eldrazi Spawn creature tokens with "Sacrifice this token: Add {C}."\n• Target player scries X, then draws a card.',
      'Kindred Instant — Eldrazi',
    )
    expect(includedByDefault(command)).toBe(true)
    expect(inclusionReason(command)).toBe('instant')
    expect(includedByDefault(card('Destroy target creature.', 'Sorcery'))).toBe(true)
    expect(inclusionReason(card('{T}: Add {C}.', 'Land'))).toBe('land, does not use the stack')
    expect(inclusionReason(card('Flying'))).toBe('no stack abilities')
  })

  it('does not misread a modal instant as an activated ability', () => {
    const abilities = extractAbilities(
      card(
        'Choose two —\n• Target player creates X 0/1 colorless Eldrazi Spawn creature tokens with "Sacrifice this token: Add {C}."\n• Exile target creature with mana value X or less.',
        'Kindred Instant — Eldrazi',
      ),
    )
    expect(abilities.map((a) => a.kind)).toEqual(['static'])
  })

  it('reads the spell types a commander triggers on from its oracle text', () => {
    const ulalek = card(
      "Devoid (This card has no color.)\nWhenever you cast an Eldrazi spell, you may pay {C}{C}. If you do, copy all spells you control, then copy all other activated and triggered abilities you control. You may choose new targets for the copies. (Mana abilities can't be copied.)",
      'Legendary Creature — Eldrazi',
    )
    expect(castTriggerTypes([ulalek])).toEqual(['Eldrazi'])
    expect(
      castTriggerTypes([
        card(
          'Whenever you cast an instant or sorcery spell, draw a card.',
          'Legendary Creature — Human Wizard',
        ),
      ]),
    ).toEqual(['instant', 'sorcery'])
    expect(castTriggerTypes([card('Flying')])).toEqual([])
  })

  it('ticks cards of a watched type even without stack abilities, but never lands', () => {
    const endlessOne = card(
      'This creature enters with X +1/+1 counters on it.',
      'Creature — Eldrazi',
    )
    const allIsDust = card(
      'Each player sacrifices all permanents they control that are one or more colors.',
      'Kindred Sorcery — Eldrazi',
    )
    const temple = card('{T}: Add {C}.', 'Land')
    expect(includedByDefault(endlessOne)).toBe(false)
    expect(includedByDefault(endlessOne, ['Eldrazi'])).toBe(true)
    expect(inclusionReason(endlessOne, ['Eldrazi'])).toBe('Eldrazi spell')
    expect(inclusionReason(allIsDust, ['Eldrazi'])).toBe('Eldrazi spell, sorcery')
    expect(includedByDefault(temple, ['Eldrazi', 'Land'])).toBe(false)
    expect(includedByDefault(card('Flying', 'Creature — Human'), ['Eldrazi'])).toBe(false)
  })
})
