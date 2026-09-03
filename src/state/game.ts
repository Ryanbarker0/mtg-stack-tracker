import { entersTriggers, isPermanentSpell, sacrificesItself } from '../lib/triggers'
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

/** A stack item before it is placed. The caller may fix the id so other items can refer to it. */
export type NewItem = Omit<StackItem, 'id' | 'createdAt'> & { id?: string }

export type GameAction =
  | { type: 'push'; item: NewItem }
  | { type: 'pushMany'; items: NewItem[] }
  | { type: 'resolveTop' }
  | { type: 'resolveMany'; count: number }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; direction: 'up' | 'down' }
  | { type: 'copy'; id: string }
  | { type: 'resolveTopCopyingOthers'; controller: string }
  | { type: 'resolveTopSacrificingSource' }
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
  return { ...item, id: item.id ?? newId(), createdAt: Date.now() }
}

/** True for a trigger that copies everything else when it resolves (Ulalek). */
export function copiesAllOthers(item: StackItem): boolean {
  return /copy all spells you control/i.test(item.text)
}

/**
 * How many items from the top can resolve with no decision from the player. Stops before
 * an item that needs a choice (a copy-all trigger, a self-sacrifice trigger, a cascade),
 * an opponent's item, or a permanent whose entering would trigger something. A permanent
 * that enters quietly is included and moves to the battlefield as normal.
 */
export function resolvableWithoutDecision(state: GameState, commanderIds: Set<string>): number {
  let current = state
  let count = 0
  while (current.stack.length > 0) {
    const top = current.stack[current.stack.length - 1]
    if (top.controller !== YOU) break
    if (copiesAllOthers(top) || sacrificesSource(top) || top.onResolve === 'cascade') break
    const entering = permanentFromResolved(top)
    if (entering) {
      const suggestions = entersTriggers(entering, [...current.battlefield, entering], commanderIds)
      if (suggestions.length > 0) break
    }
    current = gameReducer(current, { type: 'resolveTop' })
    count += 1
  }
  return count
}

/** True for a trigger that may sacrifice its own source as it resolves (Sanctum of Ugin). */
export function sacrificesSource(item: StackItem): boolean {
  return (
    (item.kind === 'triggered' || item.originalKind === 'triggered') &&
    sacrificesItself(item.text, item.card?.name ?? item.title.replace(/^Copy of /, ''))
  )
}

/** Other stack items that are the same ability of the same source, including copies. */
export function siblingsOf(stack: StackItem[], item: StackItem): StackItem[] {
  return stack.filter(
    (i) =>
      i.id !== item.id &&
      i.text === item.text &&
      (i.card?.scryfallId ?? i.title) === (item.card?.scryfallId ?? item.title),
  )
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
      let stack = state.stack.slice(0, -1)
      if (top.onResolve === 'copySpell') {
        // "Copy it": the spell may already have resolved or been countered, in which case
        // the trigger does nothing.
        const spell = stack.find((i) => i.id === top.refersTo)
        if (spell) stack = [...stack, makeCopy(spell, `Copied by ${baseTitle(top)} trigger`)]
      }
      return {
        stack,
        history: [...state.history, { item: top, outcome: 'resolved', at: Date.now() }],
        battlefield: entering ? [...state.battlefield, entering] : state.battlefield,
      }
    }
    case 'resolveMany': {
      let next = state
      for (let i = 0; i < action.count; i += 1) next = gameReducer(next, { type: 'resolveTop' })
      return next
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
      return { ...state, stack: [...state.stack, makeCopy(source, 'Copied by hand')] }
    }
    case 'resolveTopCopyingOthers': {
      // The top object resolves and, as it does, copies every other spell and ability its
      // controller has on the stack (Ulalek's trigger). Copies are created above the
      // originals (CR 707.10) in the same relative order, except that copies of other
      // copy-all triggers go on top: the controller chooses the order, and keeping the
      // next Ulalek trigger on top is what makes the chain readable and repeatable.
      if (state.stack.length === 0) return state
      const top = state.stack[state.stack.length - 1]
      const remaining = state.stack.slice(0, -1)
      const sources = remaining.filter(
        (i) => i.controller === action.controller && i.kind !== 'note',
      )
      const ordered = [
        ...sources.filter((i) => !copiesAllOthers(i)),
        ...sources.filter((i) => copiesAllOthers(i)),
      ]
      // Number the payments so a copy's lineage reads "Copied by Ulalek, round 2".
      const round =
        1 + state.history.filter((h) => h.outcome === 'resolved' && copiesAllOthers(h.item)).length
      const cause = `Copied by ${baseTitle(top)}, round ${round}`
      return {
        ...state,
        stack: [...remaining, ...ordered.map((i) => makeCopy(i, cause))],
        history: [...state.history, { item: top, outcome: 'resolved', at: Date.now() }],
      }
    }
    case 'resolveTopSacrificingSource': {
      // The top trigger resolves and its source is sacrificed. Every other instance of the
      // same trigger, copies included, can no longer sacrifice anything and does nothing
      // when it resolves, so they leave the stack now as fizzled. The permanent leaves the
      // battlefield.
      if (state.stack.length === 0) return state
      const top = state.stack[state.stack.length - 1]
      const remaining = state.stack.slice(0, -1)
      const siblings = siblingsOf(remaining, top)
      const now = Date.now()
      const sourceIndex = state.battlefield.findIndex(
        (p) => top.card !== undefined && p.card.scryfallId === top.card.scryfallId,
      )
      return {
        stack: remaining.filter((i) => !siblings.includes(i)),
        history: [
          ...state.history,
          { item: top, outcome: 'resolved', at: now },
          ...siblings.map((item) => ({ item, outcome: 'fizzled' as const, at: now })),
        ],
        battlefield:
          sourceIndex >= 0
            ? state.battlefield.filter((_, index) => index !== sourceIndex)
            : state.battlefield,
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

function baseTitle(item: StackItem): string {
  return item.title.replace(/^Copy of /, '')
}

function makeCopy(source: StackItem, cause: string): StackItem {
  return {
    ...source,
    id: newId(),
    createdAt: Date.now(),
    kind: 'copy',
    originalKind: source.originalKind ?? source.kind,
    copyOf: source.copyOf ?? source.id,
    title: source.title.startsWith('Copy of ') ? source.title : `Copy of ${source.title}`,
    origin: [...(source.origin ?? []), cause],
  }
}
