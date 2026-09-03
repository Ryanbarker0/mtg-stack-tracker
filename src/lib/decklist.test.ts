import { describe, expect, it } from 'vitest'
import { parseDecklist, parseLine } from './decklist'

describe('parseLine', () => {
  it('parses a bare quantity and name', () => {
    expect(parseLine('1 Ulalek, Fused Atrocity')).toMatchObject({
      quantity: 1,
      name: 'Ulalek, Fused Atrocity',
      isCommander: false,
    })
  })

  it('parses an Archidekt export line with set, number and category', () => {
    expect(parseLine('1x Ulalek, Fused Atrocity (m3c) 4 [Commander{top}]')).toMatchObject({
      quantity: 1,
      name: 'Ulalek, Fused Atrocity',
      set: 'm3c',
      collectorNumber: '4',
      isCommander: true,
    })
  })

  it('parses a Moxfield export line with the CMDR marker', () => {
    expect(parseLine('1 Ulalek, Fused Atrocity (M3C) 4 *CMDR*')).toMatchObject({
      name: 'Ulalek, Fused Atrocity',
      set: 'm3c',
      collectorNumber: '4',
      isCommander: true,
    })
  })

  it('strips foil markers and multiple categories', () => {
    expect(parseLine('2x Sol Ring (cmm) 464 [Ramp,Artifacts] ^Foil^')).toMatchObject({
      quantity: 2,
      name: 'Sol Ring',
      set: 'cmm',
      collectorNumber: '464',
      isCommander: false,
    })
  })

  it('parses a name with no quantity', () => {
    expect(parseLine('Counterspell')).toMatchObject({ quantity: 1, name: 'Counterspell' })
  })

  it('keeps double-faced names intact', () => {
    expect(parseLine('1 Valakut Awakening // Valakut Stoneforge')).toMatchObject({
      name: 'Valakut Awakening // Valakut Stoneforge',
    })
  })

  it('does not treat a parenthetical inside the name as a set code when no number follows', () => {
    // Set codes are 2-6 alphanumerics; "(Steamflogger Boss)" is longer so stays in the name.
    expect(parseLine('1 Who (Steamflogger Boss)')).toMatchObject({
      name: 'Who (Steamflogger Boss)',
    })
  })
})

describe('parseDecklist', () => {
  it('handles headings, comments and maybeboards', () => {
    const text = `
Commander
1 Ulalek, Fused Atrocity

Deck
1 Sol Ring
# a comment
// another comment
2 Eldrazi Temple

Maybeboard
1 Counterspell
`
    const lines = parseDecklist(text)
    expect(lines.map((l) => l.name)).toEqual([
      'Ulalek, Fused Atrocity',
      'Sol Ring',
      'Eldrazi Temple',
    ])
    expect(lines[0].isCommander).toBe(true)
    expect(lines[1].isCommander).toBe(false)
    expect(lines[2].quantity).toBe(2)
  })
})
