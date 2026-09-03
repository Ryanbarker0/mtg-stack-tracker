import type { GameState, StackItem } from '../lib/types'

/**
 * Pure reducer for the stack. The stack array has its bottom at index 0 and its top
 * (the next object to resolve) at the end, matching CR 405.
 *
 * Undo is handled outside this reducer by keeping a list of previous states, so every
 * action here is a plain transition.
 */

export const YOU = 'You'

export type GameAction =
  | { type: 'push'; item: Omit<StackItem, 'id' | 'createdAt'> }
  | { type: 'resolveTop' }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; direction: 'up' | 'down' }
  | { type: 'copy'; id: string }
  | { type: 'resolveTopCopyingOthers'; controller: string }
  | { type: 'setNote'; id: string; note: string }
  | { type: 'clearStack' }
  | { type: 'clearHistory' }
  | { type: 'newGame' }

export const emptyGame = (): GameState => ({ stack: [], history: [] })

let counter = 0
export function newId(): string {
  counter += 1
  return `${Date.now().toString(36)}-${counter.toString(36)}`
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'push': {
      const item: StackItem = { ...action.item, id: newId(), createdAt: Date.now() }
      return { ...state, stack: [...state.stack, item] }
    }
    case 'resolveTop': {
      if (state.stack.length === 0) return state
      const top = state.stack[state.stack.length - 1]
      return {
        stack: state.stack.slice(0, -1),
        history: [...state.history, { item: top, outcome: 'resolved', at: Date.now() }],
      }
    }
    case 'remove': {
      const target = state.stack.find((i) => i.id === action.id)
      if (!target) return state
      return {
        stack: state.stack.filter((i) => i.id !== action.id),
        history: [...state.history, { item: target, outcome: 'removed', at: Date.now() }],
      }
    }
    case 'move': {
      const index = state.stack.findIndex((i) => i.id === action.id)
      if (index < 0) return state
      // "up" means closer to the top of the stack, i.e. a higher array index.
      const target = action.direction === 'up' ? index + 1 : index - 1
      if (target < 0 || target >= state.stack.length) return state
      const stack = [...state.stack]
      ;[stack[index], stack[target]] = [stack[target], stack[index]]
      return { ...state, stack }
    }
    case 'copy': {
      const source = state.stack.find((i) => i.id === action.id)
      if (!source) return state
      return { ...state, stack: [...state.stack, makeCopy(source)] }
    }
    case 'resolveTopCopyingOthers': {
      // The top object resolves and, as it does, copies every other spell and ability its
      // controller has on the stack (Ulalek's trigger). Copies are created above the
      // originals (CR 707.10) in the same relative order so the visual order stays honest.
      if (state.stack.length === 0) return state
      const top = state.stack[state.stack.length - 1]
      const remaining = state.stack.slice(0, -1)
      const sources = remaining.filter(
        (i) => i.controller === action.controller && i.kind !== 'note',
      )
      return {
        stack: [...remaining, ...sources.map(makeCopy)],
        history: [...state.history, { item: top, outcome: 'resolved', at: Date.now() }],
      }
    }
    case 'setNote': {
      return {
        ...state,
        stack: state.stack.map((i) => (i.id === action.id ? { ...i, note: action.note } : i)),
      }
    }
    case 'clearStack':
      return { ...state, stack: [] }
    case 'clearHistory':
      return { ...state, history: [] }
    case 'newGame':
      return emptyGame()
  }
}

function makeCopy(source: StackItem): StackItem {
  return {
    ...source,
    id: newId(),
    createdAt: Date.now(),
    kind: 'copy',
    copyOf: source.copyOf ?? source.id,
    title: source.title.startsWith('Copy of ') ? source.title : `Copy of ${source.title}`,
  }
}
