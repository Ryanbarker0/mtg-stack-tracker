import { isPermanentSpell } from '../lib/triggers'
import type { BattlefieldPermanent, Card, GameState, StackItem } from '../lib/types'

/**
 * Pure reducer for the stack. The stack array has its bottom at index 0 and its top
 * (the next object to resolve) at the end, matching CR 405.
 *
 * The battlefield is a light list of permanents you control, kept only so the app can
 * suggest triggers. Permanent spells you resolve move onto it automatically; the user
 * can add or remove anything by hand.
 *
 * Undo is handled outside this reducer by keeping a list of previous states, so every
 * action here is a plain transition.
 */

export const YOU = 'You'

export type NewItem = Omit<StackItem, 'id' | 'createdAt'>

export type GameAction =
  | { type: 'push'; item: NewItem }
  | { type: 'pushMany'; items: NewItem[] }
  | { type: 'resolveTop' }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; direction: 'up' | 'down' }
  | { type: 'copy'; id: string }
  | { type: 'resolveTopCopyingOthers'; controller: string }
  | { type: 'setNote'; id: string; note: string }
  | { type: 'battlefieldAdd'; card: Card; faceIndex?: number; isToken?: boolean }
  | { type: 'battlefieldRemove'; id: string }
  | { type: 'clearStack' }
  | { type: 'clearHistory' }
  | { type: 'newGame'; commanders: Card[] }

export const emptyGame = (): GameState => ({ stack: [], history: [], battlefield: [] })

let counter = 0
export function newId(): string {
  counter += 1
  return `${Date.now().toString(36)}-${counter.toString(36)}`
}

function makeItem(item: NewItem): StackItem {
  return { ...item, id: newId(), createdAt: Date.now() }
}

function makePermanent(card: Card, faceIndex = 0, isToken = false): BattlefieldPermanent {
  return { id: newId(), card, faceIndex, isToken }
}

/** The permanent a resolving stack item becomes, if any. */
export function permanentFromResolved(item: StackItem): BattlefieldPermanent | null {
  const kind = item.kind === 'copy' ? item.originalKind : item.kind
  if (kind !== 'spell' || !item.card) return null
  const faceIndex = item.faceIndex ?? 0
  const face = item.card.faces[faceIndex] ?? item.card.faces[0]
  if (!isPermanentSpell(face)) return null
  // Copies of permanent spells become tokens as they resolve (CR 707.10a).
  return makePermanent(item.card, faceIndex, item.kind === 'copy')
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'push':
      return { ...state, stack: [...state.stack, makeItem(action.item)] }
    case 'pushMany':
      return { ...state, stack: [...state.stack, ...action.items.map(makeItem)] }
    case 'resolveTop': {
      if (state.stack.length === 0) return state
      const top = state.stack[state.stack.length - 1]
      const entering = permanentFromResolved(top)
      return {
        stack: state.stack.slice(0, -1),
        history: [...state.history, { item: top, outcome: 'resolved', at: Date.now() }],
        battlefield: entering ? [...state.battlefield, entering] : state.battlefield,
      }
    }
    case 'remove': {
      const target = state.stack.find((i) => i.id === action.id)
      if (!target) return state
      return {
        ...state,
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
        ...state,
        stack: [...remaining, ...sources.map(makeCopy)],
        history: [...state.history, { item: top, outcome: 'resolved', at: Date.now() }],
      }
    }
    case 'setNote':
      return {
        ...state,
        stack: state.stack.map((i) => (i.id === action.id ? { ...i, note: action.note } : i)),
      }
    case 'battlefieldAdd':
      return {
        ...state,
        battlefield: [
          ...state.battlefield,
          makePermanent(action.card, action.faceIndex ?? 0, action.isToken ?? false),
        ],
      }
    case 'battlefieldRemove':
      return { ...state, battlefield: state.battlefield.filter((p) => p.id !== action.id) }
    case 'clearStack':
      return { ...state, stack: [] }
    case 'clearHistory':
      return { ...state, history: [] }
    case 'newGame':
      return { ...emptyGame(), battlefield: action.commanders.map((c) => makePermanent(c)) }
  }
}

function makeCopy(source: StackItem): StackItem {
  return {
    ...source,
    id: newId(),
    createdAt: Date.now(),
    kind: 'copy',
    originalKind: source.originalKind ?? source.kind,
    copyOf: source.copyOf ?? source.id,
    title: source.title.startsWith('Copy of ') ? source.title : `Copy of ${source.title}`,
  }
}
