import type { Ability, AbilityKind, Card, CardFace } from './types'

/**
 * Classifies each paragraph of a card's Scryfall oracle text as a triggered,
 * activated, mana or static ability.
 *
 * This is deliberately a heuristic over the printed text, not a rules engine.
 * The user reviews the result at import time and can include or exclude any
 * card, so mistakes here cost a tap rather than a wrong game action.
 *
 * Rules references:
 *  - CR 603.1: triggered abilities begin with "when", "whenever" or "at".
 *  - CR 602.1: activated abilities are written "[cost]: [effect]".
 *  - CR 605: mana abilities don't use the stack. We treat an activated ability whose
 *    effect starts with "Add" and has no target as a mana ability, and a triggered
 *    ability that triggers on tapping for mana and adds mana likewise.
 */

/** Keyword abilities that are triggered abilities (CR 702), shown as-is when the line has no reminder text. */
const TRIGGERED_KEYWORDS = [
  'annihilator',
  'afflict',
  'afterlife',
  'backup',
  'battle cry',
  'bushido',
  'cascade',
  'casualty',
  'dethrone',
  'demonstrate',
  'enlist',
  'evolve',
  'exalted',
  'extort',
  'fabricate',
  'gravestorm',
  'haunt',
  'ingest',
  'living weapon',
  'melee',
  'mentor',
  'modular',
  'myriad',
  'persist',
  'poisonous',
  'prowess',
  'rampage',
  'renown',
  'ripple',
  'soulbond',
  'storm',
  'undying',
  'ward',
]

/** Keyword abilities that are activated abilities (CR 702). */
const ACTIVATED_KEYWORDS = [
  'adapt',
  'boast',
  'channel',
  'craft',
  'crew',
  'cycling',
  'embalm',
  'equip',
  'eternalize',
  'forecast',
  'fortify',
  'level up',
  'monstrosity',
  'ninjutsu',
  'commander ninjutsu',
  'outlast',
  'reconfigure',
  'reinforce',
  'scavenge',
  'transfigure',
  'transmute',
  'unearth',
]

const TRIGGER_START = /^(when|whenever|at)\b/i

/** Ability words ("Landfall — Whenever ...") prefix the real text with a word and a dash. */
const ABILITY_WORD_PREFIX = /^[A-Z][A-Za-z' ]{1,30}\s+[—–-]\s+/

export function classifyLine(line: string): AbilityKind {
  const withoutAbilityWord = line.replace(ABILITY_WORD_PREFIX, '')
  const reminder = /\(([^)]*)\)/.exec(withoutAbilityWord)?.[1] ?? ''
  const main = withoutAbilityWord.replace(/\s*\([^)]*\)/g, '').trim()
  const lower = main.toLowerCase()

  if (TRIGGER_START.test(main) || TRIGGER_START.test(reminder.trim())) {
    return isTriggeredManaAbility(main) ? 'mana' : 'triggered'
  }

  const colonIndex = findCostColon(main)
  if (colonIndex >= 0) {
    const effect = main.slice(colonIndex + 1).trim()
    return isManaEffect(effect) ? 'mana' : 'activated'
  }
  if (findCostColon(reminder) >= 0) {
    const effect = reminder.slice(findCostColon(reminder) + 1).trim()
    return isManaEffect(effect) ? 'mana' : 'activated'
  }

  // Keyword lines: "Flying, trample, annihilator 6" or "Ward—Pay 7 life." Any triggered or
  // activated keyword in the list makes the line usable on the stack.
  const keywords = lower.split(/,|;|\band\b/).map((k) =>
    k
      .replace(/[—–-].*$/, '')
      .replace(/\s+\{.*$/, '')
      .replace(/\s+\d+$/, '')
      .trim(),
  )
  if (keywords.some((k) => ACTIVATED_KEYWORDS.includes(k))) return 'activated'
  if (keywords.some((k) => TRIGGERED_KEYWORDS.includes(k))) return 'triggered'

  return 'static'
}

/**
 * Finds the colon that separates cost from effect. Colons inside quotes belong to
 * granted abilities ("has '{T}: Add {C}'") and are ignored; a real activated ability's
 * colon appears before any quote mark.
 */
function findCostColon(text: string): number {
  const quoteIndex = text.search(/["“]/)
  const searchable = quoteIndex >= 0 ? text.slice(0, quoteIndex) : text
  const index = searchable.indexOf(':')
  if (index < 0) return -1
  // A colon at the very end of a sentence ("Choose one:") is not a cost separator.
  const before = searchable.slice(0, index).trim().toLowerCase()
  if (/^choose (one|two|any number|up to)/.test(before)) return -1
  return index
}

function isManaEffect(effect: string): boolean {
  return /^add\b/i.test(effect) && !/\btarget\b/i.test(effect)
}

function isTriggeredManaAbility(text: string): boolean {
  return /for mana/i.test(text) && /\badd\b/i.test(text) && !/\btarget\b/i.test(text)
}

/**
 * Splits oracle text into ability paragraphs. Modal bullet lines ("• ...") are
 * folded back into the paragraph that introduced them.
 */
export function splitOracleText(oracleText: string): string[] {
  const paragraphs: string[] = []
  for (const rawLine of oracleText.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    if (line.startsWith('•') && paragraphs.length > 0) {
      paragraphs[paragraphs.length - 1] += '\n' + line
    } else {
      paragraphs.push(line)
    }
  }
  return paragraphs
}

export function extractFaceAbilities(card: Card, face: CardFace, faceIndex: number): Ability[] {
  return splitOracleText(face.oracleText).map((text, lineIndex) => ({
    id: `${card.oracleId}:${faceIndex}:${lineIndex}`,
    cardOracleId: card.oracleId,
    faceIndex,
    kind: classifyLine(text),
    text,
  }))
}

export function extractAbilities(card: Card): Ability[] {
  return card.faces.flatMap((face, index) => extractFaceAbilities(card, face, index))
}

/** True if any ability on the card would use the stack (triggered or activated, not mana). */
export function usesStack(card: Card): boolean {
  return extractAbilities(card).some((a) => a.kind === 'triggered' || a.kind === 'activated')
}

export function isLand(face: CardFace): boolean {
  return /\bLand\b/.test(face.typeLine)
}
