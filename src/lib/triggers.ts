import { extractAbilities, splitOracleText } from './abilities'
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
  /** When `certain` is undefined, the clause the user needs to check, in the card's words. */
  uncertainReason?: string
}

interface Evaluation {
  result: boolean | undefined
  reason?: string
}

const COPIES_SPELL_PATTERN = /\bcopy (?:it|that spell)\b/i

const CAST_PATTERN =
  /\bwhenever you cast (?:a|an|your first|another|one or more) ([a-z][a-z\- ]*?) spells?\b(.*)$/i
const OWN_CAST_PATTERN = /^when you cast this spell\b/i
const OWN_CAST_CONDITION = /^when you cast this spell, if\b/i
/** "Colorless spells you cast from your hand with mana value 7 or greater have "Cascade, cascade."" */
const GRANTED_CASCADE_PATTERN = /^(.*?)\bspells? you cast\b(.*?) have "((?:cascade[,.]?\s*)+)"/i
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

/**
 * Evaluates what follows the qualifier. Mana value clauses are checked against Scryfall's
 * value for the card. Anything else ("from your hand", "from anywhere other than your
 * hand") cannot be known from card data alone and is handed back as the reason for the
 * user to check. Text after the first comma or period is the effect, not a condition.
 */
const MANA_VALUE_CLAUSES: Array<[RegExp, (m: RegExpExecArray, value: number) => boolean]> = [
  [/\bwith mana value (\d+) or greater\b/i, (m, v) => v >= Number(m[1])],
  [/\bwith mana value (\d+) or less\b/i, (m, v) => v <= Number(m[1])],
  [
    /\bwith mana value ((?:\d+, )+or \d+|\d+ or \d+)\b/i,
    (m, v) =>
      m[1]
        .split(/,? or |, /)
        .map(Number)
        .includes(v),
  ],
  [/\bwith mana value (\d+)\b/i, (m, v) => v === Number(m[1])],
]

function evaluateTrailing(rest: string, subject: Subject): Evaluation {
  // An intervening "if" right after the trigger condition is for the user to judge.
  const ifClause = /^\s*,\s*(if\b[^,]+)/i.exec(rest)
  if (ifClause) return { result: undefined, reason: ifClause[1].trim() }
  // The effect follows straight after the qualifier: no condition to evaluate.
  if (!/^\s+[a-z]/i.test(rest)) return { result: true }
  let text = rest.trim()
  let result: boolean | undefined = true
  const reasons: string[] = []

  // Mana value clauses come first because the list form ("4, 5, or 6") contains commas.
  for (const [pattern, test] of MANA_VALUE_CLAUSES) {
    const match = pattern.exec(text)
    if (!match) continue
    text = text.replace(match[0], '').trim()
    if (subject.card.manaValue === undefined) {
      result = undefined
      reasons.push('mana value unknown, re-import the deck')
    } else if (!test(match, subject.card.manaValue)) {
      return { result: false }
    }
    break
  }

  const leftover = text
    .replace(/[,.].*$/s, '')
    .replace(/^(and|,)\s*/, '')
    .trim()
  if (leftover !== '') {
    result = undefined
    reasons.push(leftover)
  }
  return { result, reason: reasons.length > 0 ? reasons.join('; ') : undefined }
}

/** The intervening-if clause of a trigger, if it has one, in the card's words. */
function interveningIf(text: string): string | undefined {
  const match = /^[^,]*,\s*(if [^,]+),/i.exec(text)
  return match?.[1]
}

/** Joins the qualifier result with whatever follows it into one verdict. */
function combine(qualifier: boolean | undefined, rest: string, subject: Subject): Evaluation {
  if (qualifier === false) return { result: false }
  const trailing = evaluateTrailing(rest, subject)
  if (trailing.result === false) return { result: false }
  if (qualifier === undefined) {
    const reasons = ['type or colour could not be read']
    if (trailing.reason) reasons.push(trailing.reason)
    return { result: undefined, reason: reasons.join('; ') }
  }
  return trailing
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
      // "When you cast this spell, if ..." has an intervening-if the app cannot check.
      certain: OWN_CAST_CONDITION.test(ability.text) ? undefined : true,
      uncertainReason: OWN_CAST_CONDITION.test(ability.text)
        ? interveningIf(ability.text)
        : undefined,
      ...doublersFor(spell, battlefield),
      fromCommander: false,
      copiesSpell: false,
    })
  }

  // Abilities granted to the spell by a permanent, e.g. Zhulodok's double cascade. The
  // trigger belongs to the spell, so Echoes doubles it like any other colorless spell trigger.
  for (const permanent of battlefield) {
    const face = permanent.card.faces[permanent.faceIndex] ?? permanent.card.faces[0]
    for (const line of splitOracleText(face.oracleText)) {
      const main = line.replace(/\s*\([^)]*\)/g, '')
      const match = GRANTED_CASCADE_PATTERN.exec(main)
      if (!match) continue
      const evaluation = combine(
        qualifierMatches(match[1].trim() || 'spell', subject),
        match[2],
        subject,
      )
      if (evaluation.result === false) continue
      const cascades = (match[3].match(/cascade/gi) ?? []).length
      const reminder = /\(([^)]*)\)/.exec(line)?.[1] ?? ''
      const doubling = doublersFor(spell, battlefield)
      suggestions.push({
        source: spell,
        sourceFaceIndex: spellFaceIndex,
        ability: {
          id: `${spell.oracleId}:${spellFaceIndex}:granted:${permanent.card.oracleId}`,
          cardOracleId: spell.oracleId,
          faceIndex: spellFaceIndex,
          kind: 'triggered',
          text: `Cascade (granted by ${permanent.card.name}). ${reminder}`.trim(),
          fromKeyword: true,
        },
        certain: evaluation.result,
        uncertainReason: evaluation.reason,
        times: cascades * doubling.times,
        doubledBy: [permanent.card.name, doubling.doubledBy].filter(Boolean).join(' + '),
        fromCommander: false,
        copiesSpell: false,
      })
    }
  }

  for (const permanent of battlefield) {
    for (const ability of triggeredAbilities(permanent.card, permanent.faceIndex)) {
      const match = CAST_PATTERN.exec(ability.text.replace(/\s*\([^)]*\)/g, ''))
      if (!match) continue
      const evaluation = combine(qualifierMatches(match[1], subject), match[2], subject)
      if (evaluation.result === false) continue
      suggestions.push({
        source: permanent.card,
        sourceFaceIndex: permanent.faceIndex,
        ability,
        certain: evaluation.result,
        uncertainReason: evaluation.reason,
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
    const condition = interveningIf(ability.text)
    suggestions.push({
      source: permanent.card,
      sourceFaceIndex: permanent.faceIndex,
      ability,
      certain: condition ? undefined : true,
      uncertainReason: condition,
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
      const evaluation = combine(qualifierMatches(match[1], subject), match[2], subject)
      if (evaluation.result === false) continue
      suggestions.push({
        source: watcher.card,
        sourceFaceIndex: watcher.faceIndex,
        ability,
        certain: evaluation.result,
        uncertainReason: evaluation.reason,
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
