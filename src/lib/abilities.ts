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

/** Verbs that mark a line as granting or modifying something rather than being an ability of its own. */
const GRANTING_VERB = /\b(gets?|has|have|gains?|becomes?)\b/i

/** Ability words ("Landfall — Whenever ...") prefix the real text with a word and a dash. */
const ABILITY_WORD_PREFIX = /^[A-Z][A-Za-z' ]{1,30}\s+[—–-]\s+/

export function classifyLine(line: string): AbilityKind {
  const withoutAbilityWord = line.replace(ABILITY_WORD_PREFIX, '')
  const reminder = /\(([^)]*)\)/.exec(withoutAbilityWord)?.[1] ?? ''
  const main = withoutAbilityWord.replace(/\s*\([^)]*\)/g, '').trim()
  const lower = main.toLowerCase()

  if (TRIGGER_START.test(main)) {
    return isTriggeredManaAbility(main) ? 'mana' : 'triggered'
  }

  const colonIndex = findCostColon(main)
  if (colonIndex >= 0) {
    const effect = main.slice(colonIndex + 1).trim()
    // A mana ability whose text also says "when that mana is spent, ..." carries a triggered
    // ability that does use the stack (Path of Ancestry). Show the line as triggered so it
    // can be put on the stack; the mana part never goes there anyway.
    if (isManaEffect(effect) && /\bwhen(ever)? that mana is spent\b/i.test(effect))
      return 'triggered'
    return isManaEffect(effect) ? 'mana' : 'activated'
  }

  // A line that grants abilities to something else ("Enchanted creature has ...",
  // "Colorless spells you cast ... have 'Cascade'") is itself a static ability, however its
  // reminder text or keyword list reads. The granted ability's owner is what goes on the stack.
  if (GRANTING_VERB.test(main)) return 'static'

  if (TRIGGER_START.test(reminder.trim())) return 'triggered'
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
export function hasStackAbility(card: Card): boolean {
  return extractAbilities(card).some((a) => a.kind === 'triggered' || a.kind === 'activated')
}

/** True if any face is an instant or sorcery: a spell that only ever exists on the stack. */
export function isInstantOrSorcery(card: Card): boolean {
  return card.faces.some((f) => /\b(Instant|Sorcery)\b/.test(f.typeLine))
}

/**
 * Types a commander cares about, read from its own oracle text: what it watches you cast
 * ("Whenever you cast an Eldrazi spell") or watches enter ("Whenever Pantlaza or another
 * Dinosaur you control enters"). Only words that can appear on a type line are useful
 * here; a qualifier such as "colorless" is returned but will match nothing.
 */
export function castTriggerTypes(commanders: Card[]): string[] {
  const types = new Set<string>()
  for (const card of commanders) {
    for (const ability of extractAbilities(card)) {
      if (ability.kind !== 'triggered') continue
      const text = ability.text.replace(/\s*\([^)]*\)/g, '')
      const patterns = [
        /\byou cast (?:a|an|your first|another|one or more) ([A-Za-z][A-Za-z\- ]*?) spells?\b/gi,
        /\bwhenever (?:[A-Za-z][\w',\- ]*? or )?(?:a|an|another|one or more) ([A-Za-z][A-Za-z\- ]*?) (?:you control )?enters?\b/gi,
      ]
      for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
          for (const word of match[1].split(/\s*(?:,|\bor\b)\s*/)) {
            const cleaned = word.trim()
            // Generic words name no type worth ticking a whole deck for.
            if (
              cleaned !== '' &&
              !/^(creature|permanent|spell|nontoken creature|token)$/i.test(cleaned)
            ) {
              types.add(cleaned)
            }
          }
        }
      }
    }
  }
  return [...types]
}

/** True if any nonland face of the card carries one of the given types on its type line. */
export function hasSpellType(card: Card, types: string[]): boolean {
  return card.faces.some(
    (f) =>
      !isLand(f) && types.some((t) => new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i').test(f.typeLine)),
  )
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whether a card belongs in the game palette by default.
 *
 * Every nonland card uses the stack when cast (CR 601), so in principle the whole deck
 * qualifies. The palette exists to cut the deck down to what matters mid-turn, so the
 * default picks cards that have an ability that uses the stack, instants and sorceries,
 * which exist nowhere but the stack, and any spell whose type the commander's own
 * cast trigger names, since casting those is what sets the turn off. Ability-less
 * permanents such as mana rocks are left out; the user can tick them at import or add
 * them mid-game with quick add.
 */
export function includedByDefault(card: Card, watchedTypes: string[] = []): boolean {
  return hasStackAbility(card) || isInstantOrSorcery(card) || hasSpellType(card, watchedTypes)
}

/** Short reason shown at import for why a card is or is not ticked. */
export function inclusionReason(card: Card, watchedTypes: string[] = []): string {
  const abilities = extractAbilities(card)
  const triggered = abilities.filter((a) => a.kind === 'triggered').length
  const activated = abilities.filter((a) => a.kind === 'activated').length
  const parts: string[] = []
  const watched = watchedTypes.filter((t) => hasSpellType(card, [t]))
  if (watched.length > 0) parts.push(`${watched.join(' ')} spell`)
  if (isInstantOrSorcery(card))
    parts.push(card.faces.some((f) => /\bInstant\b/.test(f.typeLine)) ? 'instant' : 'sorcery')
  if (triggered) parts.push(`${triggered} triggered`)
  if (activated) parts.push(`${activated} activated`)
  if (parts.length > 0) return parts.join(', ')
  return card.faces.every(isLand) ? 'land, does not use the stack' : 'no stack abilities'
}

export function isLand(face: CardFace): boolean {
  return /\bLand\b/.test(face.typeLine)
}
