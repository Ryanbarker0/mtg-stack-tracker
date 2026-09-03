import { describe, expect, it } from 'vitest'
import { groupItems } from './summary'
import type { StackItem } from './types'

const item = (over: Partial<StackItem>): StackItem => ({
  id: Math.random().toString(36),
  kind: 'triggered',
  controller: 'You',
  title: 'Forsaken Monument',
  text: 'Whenever you cast a colorless spell, you gain 2 life.',
  createdAt: 0,
  ...over,
})

describe('groupItems', () => {
  it('folds copies into their original and names granted keywords', () => {
    const groups = groupItems([
      item({}),
      item({}),
      item({ kind: 'copy', originalKind: 'triggered', title: 'Copy of Forsaken Monument' }),
      item({ kind: 'spell', title: 'Ulamog', text: 'Indestructible' }),
      item({
        kind: 'copy',
        originalKind: 'spell',
        title: 'Copy of Ulamog',
        text: 'Indestructible',
      }),
      item({
        title: 'Ulamog',
        text: 'Cascade (granted by Zhulodok, Void Gorger). When you cast one, exile...',
      }),
    ])
    expect(groups.map((g) => [g.title, g.kind, g.originals, g.copies])).toEqual([
      ['Forsaken Monument', 'triggered', 2, 1],
      ['Ulamog', 'spell', 1, 1],
      ['Cascade on Ulamog', 'triggered', 1, 0],
    ])
  })

  it('keeps the keyword title when the item is already named by it', () => {
    const groups = groupItems([
      item({ title: 'Cascade (Ulamog)', text: 'Cascade (granted by Zhulodok, Void Gorger). ...' }),
    ])
    expect(groups.map((g) => g.title)).toEqual(['Cascade (Ulamog)'])
  })
})
