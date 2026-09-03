import { describe, expect, it } from 'vitest'
import { YOU, emptyGame, gameReducer, type GameAction } from './game'
import { itemForSpell } from '../lib/stackItems'
import type { Card, GameState, StackItem } from '../lib/types'

const push = (title: string, controller = YOU, kind: StackItem['kind'] = 'spell'): GameAction => ({
  type: 'push',
  item: { kind, controller, title, text: `${title} text` },
})

const run = (...actions: GameAction[]): GameState => actions.reduce(gameReducer, emptyGame())

const titles = (state: GameState) => state.stack.map((i) => i.title)

describe('gameReducer', () => {
  it('pushes onto the top and resolves last in, first out', () => {
    let state = run(push('A'), push('B'), push('C'))
    expect(titles(state)).toEqual(['A', 'B', 'C'])
    state = gameReducer(state, { type: 'resolveTop' })
    expect(titles(state)).toEqual(['A', 'B'])
    expect(state.history.map((h) => [h.item.title, h.outcome])).toEqual([['C', 'resolved']])
  })

  it('removes an item from anywhere and records it as removed', () => {
    const initial = run(push('A'), push('B'), push('C'))
    const state = gameReducer(initial, { type: 'remove', id: initial.stack[1].id })
    expect(titles(state)).toEqual(['A', 'C'])
    expect(state.history[0]).toMatchObject({ outcome: 'removed', item: { title: 'B' } })
  })

  it('moves items up and down within bounds', () => {
    const initial = run(push('A'), push('B'), push('C'))
    const a = initial.stack[0].id
    let state = gameReducer(initial, { type: 'move', id: a, direction: 'up' })
    expect(titles(state)).toEqual(['B', 'A', 'C'])
    state = gameReducer(state, { type: 'move', id: a, direction: 'down' })
    expect(titles(state)).toEqual(['A', 'B', 'C'])
    expect(gameReducer(state, { type: 'move', id: a, direction: 'down' })).toBe(state)
  })

  it('copies a single item on top of the stack pointing at the original', () => {
    const initial = run(push('A'), push('B'))
    const state = gameReducer(initial, { type: 'copy', id: initial.stack[0].id })
    expect(titles(state)).toEqual(['A', 'B', 'Copy of A'])
    expect(state.stack[2]).toMatchObject({ kind: 'copy', copyOf: initial.stack[0].id })
  })

  it('resolves the top item and copies every other item its controller has, in order', () => {
    const initial = run(
      push('Kozilek', YOU, 'spell'),
      push('Kozilek cast trigger', YOU, 'triggered'),
      push('Counterspell', 'Kyle', 'spell'),
      push('reminder', YOU, 'note'),
      push('Ulalek trigger', YOU, 'triggered'),
    )
    const state = gameReducer(initial, { type: 'resolveTopCopyingOthers', controller: YOU })
    expect(titles(state)).toEqual([
      'Kozilek',
      'Kozilek cast trigger',
      'Counterspell',
      'reminder',
      'Copy of Kozilek',
      'Copy of Kozilek cast trigger',
    ])
    expect(state.history.map((h) => [h.item.title, h.outcome])).toEqual([
      ['Ulalek trigger', 'resolved'],
    ])
  })

  it('copying a copy does not stack "Copy of" prefixes', () => {
    const initial = run(push('A'))
    let state = gameReducer(initial, { type: 'copy', id: initial.stack[0].id })
    state = gameReducer(state, { type: 'copy', id: state.stack[1].id })
    expect(state.stack[2].title).toBe('Copy of A')
    expect(state.stack[2].copyOf).toBe(initial.stack[0].id)
  })

  it('does nothing when resolving an empty stack', () => {
    const state = emptyGame()
    expect(gameReducer(state, { type: 'resolveTop' })).toBe(state)
  })

  it('moves a resolved permanent spell onto the battlefield, and a copy as a token', () => {
    const kozilek: Card = {
      scryfallId: 'k',
      oracleId: 'k',
      name: 'Kozilek, Butcher of Truth',
      typeLine: 'Legendary Creature — Eldrazi',
      keywords: [],
      colors: [],
      faces: [
        {
          name: 'Kozilek, Butcher of Truth',
          manaCost: '{10}',
          typeLine: 'Legendary Creature — Eldrazi',
          oracleText: 'When you cast this spell, draw four cards.',
        },
      ],
      scryfallUri: 'https://scryfall.com/card/m3c/191/kozilek',
    }
    let state = gameReducer(emptyGame(), { type: 'push', item: itemForSpell(kozilek) })
    state = gameReducer(state, { type: 'copy', id: state.stack[0].id })
    state = gameReducer(state, { type: 'resolveTop' })
    expect(state.battlefield.map((p) => [p.card.name, p.isToken])).toEqual([
      ['Kozilek, Butcher of Truth', true],
    ])
    state = gameReducer(state, { type: 'resolveTop' })
    expect(state.battlefield.map((p) => p.isToken)).toEqual([true, false])
  })

  it('does not put instants or triggers onto the battlefield', () => {
    const counterspell: Card = {
      scryfallId: 'c',
      oracleId: 'c',
      name: 'Counterspell',
      typeLine: 'Instant',
      keywords: [],
      colors: ['U'],
      faces: [
        {
          name: 'Counterspell',
          manaCost: '{U}{U}',
          typeLine: 'Instant',
          oracleText: 'Counter target spell.',
        },
      ],
      scryfallUri: 'https://scryfall.com/card/x/1/counterspell',
    }
    let state = run(push('Ulalek trigger', YOU, 'triggered'))
    state = gameReducer(state, { type: 'push', item: itemForSpell(counterspell) })
    state = gameReducer(state, { type: 'resolveTop' })
    state = gameReducer(state, { type: 'resolveTop' })
    expect(state.battlefield).toEqual([])
  })

  it('starts a new game with the commanders on the battlefield', () => {
    const ulalek: Card = {
      scryfallId: 'u',
      oracleId: 'u',
      name: 'Ulalek, Fused Atrocity',
      typeLine: 'Legendary Creature — Eldrazi',
      keywords: [],
      colors: [],
      faces: [
        {
          name: 'Ulalek, Fused Atrocity',
          manaCost: '',
          typeLine: 'Legendary Creature — Eldrazi',
          oracleText: '',
        },
      ],
      scryfallUri: 'https://scryfall.com/card/m3c/4/ulalek',
    }
    const state = gameReducer(run(push('A')), { type: 'newGame', commanders: [ulalek] })
    expect(state.stack).toEqual([])
    expect(state.battlefield.map((p) => p.card.name)).toEqual(['Ulalek, Fused Atrocity'])
  })
})
