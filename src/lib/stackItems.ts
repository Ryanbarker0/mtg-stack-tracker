import type { Ability, Card, StackItem } from './types'
import { YOU } from '../state/game'

export type NewStackItem = Omit<StackItem, 'id' | 'createdAt'>

/** A triggered or activated ability going onto the stack. */
export function itemForAbility(card: Card, ability: Ability, controller = YOU): NewStackItem {
  const face = card.faces[ability.faceIndex] ?? card.faces[0]
  return {
    kind: ability.kind === 'activated' ? 'activated' : 'triggered',
    controller,
    title: face.name,
    text: ability.text,
    imageUrl: face.imageUrl,
    scryfallUri: card.scryfallUri,
    card,
  }
}

/** A card being cast as a spell. */
export function itemForSpell(card: Card, faceIndex = 0, controller = YOU): NewStackItem {
  const face = card.faces[faceIndex] ?? card.faces[0]
  return {
    kind: 'spell',
    controller,
    title: face.name,
    text: face.oracleText || face.typeLine,
    imageUrl: face.imageUrl,
    scryfallUri: card.scryfallUri,
    card,
  }
}

/** Free text, e.g. "Kyle: Counterspell" when the opponent's card is not worth looking up. */
export function itemForNote(controller: string, title: string): NewStackItem {
  return { kind: 'note', controller, title, text: '' }
}

/**
 * Splits "Kyle: Counterspell" into a controller and the rest. Text without a colon
 * belongs to the app user.
 */
export function parseControllerPrefix(input: string): { controller: string; text: string } {
  const match = /^([^:{}]{1,24}):\s*(.+)$/.exec(input.trim())
  if (!match) return { controller: YOU, text: input.trim() }
  return { controller: match[1].trim(), text: match[2].trim() }
}
