import { describe, expect, it } from 'vitest'
import { explain } from './insights'
import type { StackItem } from './types'

const item = (over: Partial<StackItem>): StackItem => ({
  id: over.id ?? Math.random().toString(36),
  kind: 'triggered',
  controller: 'You',
  title: 'Ulalek, Fused Atrocity',
  text: 'Whenever you cast an Eldrazi spell, you may pay {C}{C}. If you do, copy all spells you control, then copy all other activated and triggered abilities you control.',
  createdAt: 0,
  ...over,
})

describe('explain', () => {
  it('explains a copied Ulalek trigger and counts the other copy-all triggers', () => {
    const original = item({ id: 'a', origin: ['Cast of Ulamog', 'Doubled by Echoes of Eternity'] })
    const copy = item({
      id: 'b',
      kind: 'copy',
      originalKind: 'triggered',
      title: 'Copy of Ulalek, Fused Atrocity',
      origin: [
        'Cast of Ulamog',
        'Doubled by Echoes of Eternity',
        'Copied by Ulalek, Fused Atrocity, round 1',
      ],
    })
    const insight = explain(copy, [original, copy])
    expect(insight.what).toMatch(/copy of a triggered ability of Ulalek/)
    expect(insight.why.join(' ')).toMatch(/Copies are put straight onto the stack/)
    expect(insight.why.join(' ')).toMatch(/triggered an extra time/)
    expect(insight.why.join(' ')).toMatch(/1 other copy-all trigger is on the stack/)
    expect(insight.onResolve).toMatch(/pay \{C\}\{C\}/)
  })

  it('explains a copied spell and what it becomes', () => {
    const copy = item({
      kind: 'copy',
      originalKind: 'spell',
      title: 'Copy of Ulamog, the Ceaseless Hunger',
      text: 'Indestructible',
      origin: ['Cast from hand', 'Copied by Echoes of Eternity trigger'],
    })
    const insight = explain(copy, [copy])
    expect(insight.what).toMatch(/copy of the spell Ulamog/)
    expect(insight.onResolve).toBe('Becomes a token on the battlefield.')
  })

  it('explains a granted cascade', () => {
    const cascade = item({
      title: 'Cascade (Ulamog, the Ceaseless Hunger)',
      text: 'Cascade. Exile cards from the top of your library until you exile a nonland card that costs less.',
      onResolve: 'cascade',
      origin: ['Cast of Ulamog, the Ceaseless Hunger', 'Granted by Zhulodok, Void Gorger'],
    })
    const insight = explain(cascade, [cascade])
    expect(insight.why.join(' ')).toMatch(/Zhulodok, Void Gorger gives it to the spell/)
    expect(insight.why.join(' ')).toMatch(/does not get cascade itself/)
  })
})
