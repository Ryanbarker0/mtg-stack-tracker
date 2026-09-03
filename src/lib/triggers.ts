import { extractAbilities } from './abilities'
import type { Ability, BattlefieldPermanent, Card, CardFace } from './types'

/**
 * Suggests which triggered abilities go on the stack when a spell is cast or a
 * permanent enters, by reading the oracle text of the permanents you control.
 *
 * This is deliberately shallow. It recognises the two trigger shapes that dominate a
 * copy-heavy turn, "whenever you cast a[n] X spell" and "whenever a[n] X enters", and
 * evaluates the X against Scryfall's type line and colours. Anything it cannot
 * evaluate is still offered, marked uncertain, so the user decides. Intervening-if
 * clauses and anything after the qualifier are never evaluated.
 */

export interface Suggestion {
  /** The permanent (or the spell itself) whose ability triggers. */
  source: Card
  sourceFaceIndex: number
  ability: Ability
  /**
   * true: the condition was evaluated and holds. undefined: the condition could not be
   * fully evaluated, so the user should check it. Conditions that evaluate to false are
   * never returned.
   */
  certain: boolean | undefined
  /** How many times the ability triggers (2 when a doubler such as Echoes of Eternity applies). */
  times: number
  /** Name of the doubler, when times > 1. */
  doubledBy?: string
  /** True when the source is a commander; these are placed on top of the stack. */
  fromCommander: boolean
  /** True when the ability copies the spell that triggered it ("whenever you cast ..., copy it"). */
  copiesSpell: boolean
}

const COPIES_SPELL_PATTERN = /\bcopy (?:it|that spell)\b/i

const CAST_PATTERN =
  /\bwhenever you cast (?:a|an|your first|another|one or more) ([a-z][a-z\- ]*?) spells?\b(.*)$/i
const OWN_CAST_PATTERN = /^when you cast this spell\b/i
const ENTERS_PATTERN =
  /\bwhenever (?:a|an|another|one or more) ([a-z][a-z\- ]*?) (?:you control )?enters?\b(?:\s+(?:the battlefield\s+)?under your control)?(.*)$/i
const OWN_ENTERS_PATTERN = /^when (?:this|[^,]+?) enters\b/i
const DOUBLER_PATTERN = /triggers an additional time/i

const CARD_TYPES = [
  'creature',
  'artifact',
  'enchantment',
  'instant',
  'sorcery',
  'planeswalker',
  'battle',
  'land',
  'kindred',
  'legendary',
]
const COLOR_WORDS: Record<string, string> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
}

interface Subject {
  card: Card
  face: CardFace
  isToken: boolean
}

/**
 * Evaluates a qualifier such as "Eldrazi", "colorless creature" or "nontoken creature"
 * against a spell or permanent. Returns undefined when any word is not understood.
 */
export function qualifierMatches(qualifier: string, subject: Subject): boolean | undefined {
  const results = qualifier
    .toLowerCase()
    .split(/\s+or\s+/)
    .map((term) => termMatches(term.trim(), subject))
  if (results.some((r) => r === true)) return true
  if (results.every((r) => r === false)) return false
  return undefined
}

function termMatches(term: string, subject: Subject): boolean | undefined {
  const typeLine = subject.face.typeLine
  const words = term.split(/\s+/).filter((w) => w !== '' && w !== 'spell' && w !== 'permanent')
  let uncertain = false
  for (const word of words) {
    const result = wordMatches(word, typeLine, subject)
    if (result === false) return false
    if (result === undefined) uncertain = true
  }
  return uncertain ? undefined : true
}

function wordMatches(word: string, typeLine: string, subject: Subject): boolean | undefined {
  const colors = subject.card.colors
  if (word === 'colorless') return colors === undefined ? undefined : colors.length === 0
  if (word === 'multicolored') return colors === undefined ? undefined : colors.length > 1
  if (word === 'monocolored') return colors === undefined ? undefined : colors.length === 1
  if (word in COLOR_WORDS)
    return colors === undefined ? undefined : colors.includes(COLOR_WORDS[word])
  if (word === 'nontoken') return !subject.isToken
  if (word === 'token') return subject.isToken
  if (word === 'historic') return /\b(Artifact|Legendary|Saga)\b/.test(typeLine)
  if (word.startsWith('non')) {
    const inner = word.slice(3)
    const result = wordMatches(inner, typeLine, subject)
    return result === undefined ? undefined : !result
  }
  if (CARD_TYPES.includes(word)) return new RegExp(`\\b${word}\\b`, 'i').test(typeLine)
  // Anything else is treated as a subtype (Eldrazi, Human, Equipment, ...).
  if (/^[a-z][a-z-]*$/.test(word)) return new RegExp(`\\b${word}\\b`, 'i').test(typeLine)
  return undefined
}

/** A trailing clause after the qualifier ("from your hand", "with mana value 4 or greater") is not evaluated. */
function trailingClauseMakesUncertain(rest: string): boolean {
  const trimmed = rest.replace(/^[,.\s]+/, '')
  return /^(from|with|that|during|if|while|other than|each)\b/i.test(trimmed)
}

/** Doublers on the battlefield, e.g. Echoes of Eternity. */
function doublersFor(
  source: Card,
  battlefield: BattlefieldPermanent[],
): { times: number; doubledBy?: string } {
  for (const permanent of battlefield) {
    if (permanent.card.scryfallId === source.scryfallId && !permanent.isToken) continue
    const face = permanent.card.faces[permanent.faceIndex] ?? permanent.card.faces[0]
    if (!DOUBLER_PATTERN.test(face.oracleText)) continue
    // Echoes of Eternity is the only such card in print; it doubles colorless sources.
    const wantsColorless = /colorless/i.test(face.oracleText)
    const isColorless = source.colors !== undefined && source.colors.length === 0
    if (!wantsColorless || isColorless) return { times: 2, doubledBy: permanent.card.name }
  }
  return { times: 1 }
}

function triggeredAbilities(card: Card, faceIndex: number): Ability[] {
  return extractAbilities(card).filter((a) => a.kind === 'triggered' && a.faceIndex === faceIndex)
}

/**
 * Triggers to offer when `spell` is cast: its own "when you cast this spell" abilities
 * plus every matching "whenever you cast" ability on the battlefield.
 */
export function castTriggers(
  spell: Card,
  spellFaceIndex: number,
  battlefield: BattlefieldPermanent[],
  commanderIds: Set<string>,
): Suggestion[] {
  const face = spell.faces[spellFaceIndex] ?? spell.faces[0]
  const subject: Subject = { card: spell, face, isToken: false }
  const suggestions: Suggestion[] = []

  for (const ability of triggeredAbilities(spell, spellFaceIndex)) {
    if (!OWN_CAST_PATTERN.test(ability.text)) continue
    suggestions.push({
      source: spell,
      sourceFaceIndex: spellFaceIndex,
      ability,
      certain: true,
      ...doublersFor(spell, battlefield),
      fromCommander: false,
      copiesSpell: false,
    })
  }

  for (const permanent of battlefield) {
    for (const ability of triggeredAbilities(permanent.card, permanent.faceIndex)) {
      const match = CAST_PATTERN.exec(ability.text.replace(/\s*\([^)]*\)/g, ''))
      if (!match) continue
      let certain = qualifierMatches(match[1], subject)
      if (certain === false) continue
      if (certain && trailingClauseMakesUncertain(match[2])) certain = undefined
      suggestions.push({
        source: permanent.card,
        sourceFaceIndex: permanent.faceIndex,
        ability,
        certain,
        ...doublersFor(permanent.card, battlefield),
        fromCommander: commanderIds.has(permanent.card.oracleId),
        copiesSpell: COPIES_SPELL_PATTERN.test(ability.text),
      })
    }
  }

  return orderForStack(suggestions)
}

/**
 * Triggers to offer when `permanent` enters: its own "when this enters" abilities plus
 * every matching "whenever a[n] X enters" ability on the battlefield, including its own
 * if it watches for other permanents entering.
 */
export function entersTriggers(
  permanent: BattlefieldPermanent,
  battlefield: BattlefieldPermanent[],
  commanderIds: Set<string>,
): Suggestion[] {
  const face = permanent.card.faces[permanent.faceIndex] ?? permanent.card.faces[0]
  const subject: Subject = { card: permanent.card, face, isToken: permanent.isToken }
  const suggestions: Suggestion[] = []

  for (const ability of triggeredAbilities(permanent.card, permanent.faceIndex)) {
    if (!OWN_ENTERS_PATTERN.test(ability.text)) continue
    suggestions.push({
      source: permanent.card,
      sourceFaceIndex: permanent.faceIndex,
      ability,
      certain: true,
      ...doublersFor(permanent.card, battlefield),
      fromCommander: commanderIds.has(permanent.card.oracleId),
      copiesSpell: false,
    })
  }

  for (const watcher of battlefield) {
    for (const ability of triggeredAbilities(watcher.card, watcher.faceIndex)) {
      const match = ENTERS_PATTERN.exec(ability.text.replace(/\s*\([^)]*\)/g, ''))
      if (!match) continue
      // "another" excludes the entering permanent itself.
      if (/\bwhenever another\b/i.test(ability.text) && watcher.id === permanent.id) continue
      let certain = qualifierMatches(match[1], subject)
      if (certain === false) continue
      if (certain && trailingClauseMakesUncertain(match[2])) certain = undefined
      suggestions.push({
        source: watcher.card,
        sourceFaceIndex: watcher.faceIndex,
        ability,
        certain,
        ...doublersFor(watcher.card, battlefield),
        fromCommander: commanderIds.has(watcher.card.oracleId),
        copiesSpell: false,
      })
    }
  }

  return orderForStack(suggestions)
}

/**
 * Simultaneous triggers go on the stack in the order their controller chooses (CR 603.3b).
 * The commander's triggers are placed last so they sit on top and resolve first, which is
 * what a copy commander such as Ulalek wants. The user can still reorder on the stack.
 */
function orderForStack(suggestions: Suggestion[]): Suggestion[] {
  return [...suggestions].sort((a, b) => Number(a.fromCommander) - Number(b.fromCommander))
}

/** Whether a resolving spell becomes a permanent (CR 608.3). */
export function isPermanentSpell(face: CardFace): boolean {
  return (
    /\b(Creature|Artifact|Enchantment|Planeswalker|Battle)\b/.test(face.typeLine) &&
    !/\b(Instant|Sorcery)\b/.test(face.typeLine)
  )
}
