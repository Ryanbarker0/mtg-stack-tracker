import { describe, expect, it } from 'vitest'
import { normaliseText, straightenPunctuation } from './text'

describe('normaliseText', () => {
  it('matches curly apostrophes typed on iOS against straight ones from Scryfall', () => {
    expect(normaliseText('Kozilek’s Command')).toBe(normaliseText("Kozilek's Command"))
    expect(normaliseText("Kozilek's Command")).toBe("kozilek's command")
  })

  it('ignores accents and dash variants', () => {
    expect(normaliseText('Lim-Dûl')).toBe('lim-dul')
    expect(normaliseText('Valakut Awakening — Valakut Stoneforge')).toBe(
      'valakut awakening - valakut stoneforge',
    )
  })
})

describe('straightenPunctuation', () => {
  it('keeps case but straightens quotes', () => {
    expect(straightenPunctuation('Kozilek’s “Command”')).toBe('Kozilek\'s "Command"')
  })
})
