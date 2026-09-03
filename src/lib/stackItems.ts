import type { Ability, Card, StackItem } from './types'
import { YOU } from '../state/game'

export type NewStackItem = Omit<StackItem, 'id' | 'createdAt'>

/** A triggered or activated ability going onto the stack. */
export function itemForAbility(card: Card, ability: Ability, controller = YOU): NewStackItem {
  const face = card.faces[ability.faceIndex] ?? card.faces[0]
  // A granted keyword such as cascade is named by the keyword so it is not mistaken for the
  // spell itself once copies of both sit side by side.
  const keyword = ability.fromKeyword ? /^([A-Z][a-z]+)\b/.exec(ability.text)?.[1] : undefined
  return {
    kind: ability.kind === 'activated' ? 'activated' : 'triggered',
    controller,
    title: keyword ? `${keyword} (${face.name})` : face.name,
    text: ability.text,
    imageUrl: face.imageUrl,
    scryfallUri: card.scryfallUri,
    card,
    faceIndex: ability.faceIndex,
  }
}

/** A card being cast as a spell. */
export function itemForSpell(card: Card, faceIndex = 0, controller = YOU): NewStackItem {
  const face = card.faces[faceIndex] ?? card.faces[0]
  // A permanent spell on the stack is just the creature or artifact itself; its abilities
  // are not what is resolving, so the item shows the type line. Instants and sorceries
  // show their text because that is the effect.
  const isPermanent = !/\b(Instant|Sorcery)\b/.test(face.typeLine)
  return {
    kind: 'spell',
    controller,
    title: face.name,
    text: isPermanent ? face.typeLine : face.oracleText || face.typeLine,
    imageUrl: face.imageUrl,
    scryfallUri: card.scryfallUri,
    card,
    faceIndex,
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
