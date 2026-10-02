import { extractAbilities, isTriggerDoubler, splitOracleText, stripAbilityWord } from './abilities'
import type { Ability, BattlefieldPermanent, Card, CardFace } from './types'

/**
 * Suggests which triggered abilities go on the stack when a spell is cast, a permanent
 * enters, or a permanent leaves and comes back, by reading the oracle text of the
 * permanents you control.
 *
 * This is deliberately shallow. It recognises the trigger shapes that dominate a
 * copy-heavy or blink-heavy turn, "whenever you cast a[n] X spell", "whenever a[n] X
 * enters" and "when this leaves the battlefield", and evaluates the X against Scryfall's
 * type line and colours. Anything it cannot evaluate is still offered, marked uncertain,
 * so the user decides. Intervening-if clauses are evaluated only when the app knows the
 * answer ("if it wasn't cast"); anything else after the qualifier is handed to the user.
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
  /** Text explaining the count when times > 1, e.g. "Panharmonicon" or "2× from Zhulodok + Echoes of Eternity". */
  doubledBy?: string
  /** Names of the permanents whose doubling applied, for the item's lineage. */
  doublers?: string[]
  /** True when the source is a commander; these are placed on top of the stack. */
  fromCommander: boolean
  /** True when the ability copies the spell that triggered it ("whenever you cast ..., copy it"). */
  copiesSpell: boolean
  /** When `certain` is undefined, the clause the user needs to check, in the card's words. */
  uncertainReason?: string
  /** A rules note worth showing, e.g. that extra copies of a self-sacrifice trigger do nothing. */
  note?: string
  /** True when the condition depended on where the spell was cast from. */
  dependsOnCastFrom?: boolean
  /** True when the condition depended on whether the entering permanent was cast. */
  dependsOnEntry?: boolean
  /** For abilities a permanent gives the spell, the permanent's name. */
  grantedBy?: string
}

/**
 * How a permanent came to be on the battlefield. A resolved spell was cast; a blinked
 * permanent, a card put onto the battlefield by an effect, or a token was not.
 */
export type Entry = 'cast' | 'notCast'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** "you may sacrifice this land", "Sacrifice Sanctum of Ugin": the ability removes its own source. */
export function sacrificesItself(text: string, sourceName: string): boolean {
  const shortName = sourceName.split(',')[0]
  return new RegExp(
    `\\bsacrifice (this (land|creature|artifact|enchantment|permanent)|${escapeRegExp(shortName)})\\b`,
    'i',
  ).test(text)
}

/** Adds the self-sacrifice note when an ability will be on the stack more than once. */
function withNotes(suggestion: Suggestion): Suggestion {
  if (suggestion.times > 1 && sacrificesItself(suggestion.ability.text, suggestion.source.name)) {
    return {
      ...suggestion,
      note: 'Sacrifices itself, so only the first of these to resolve does anything. The rest fizzle.',
    }
  }
  if (DO_ONCE_EACH_TURN.test(suggestion.ability.text)) {
    return {
      ...suggestion,
      note: 'Once each turn (CR 603.2h). It only triggers if it has not done this yet this turn.',
    }
  }
  if (TRIGGERS_ONCE_EACH_TURN.test(suggestion.ability.text)) {
    return {
      ...suggestion,
      note: 'Triggers only once each turn. If it has already triggered this turn, it does not trigger again.',
    }
  }
  return suggestion
}

interface Evaluation {
  result: boolean | undefined
  reason?: string
  dependsOnCastFrom?: boolean
  dependsOnEntry?: boolean
}

const COPIES_SPELL_PATTERN = /\bcopy (?:it|that spell)\b/i

const CAST_PATTERN =
  /\bwhenever you cast (?:a|an|your first|another|one or more) ([a-z][a-z\- ]*?) spells?\b(.*)$/i
const OWN_CAST_PATTERN = /^when you cast this spell\b/i
const OWN_CAST_CONDITION = /^when you cast this spell, if\b/i
/** "Colorless spells you cast from your hand with mana value 7 or greater have "Cascade, cascade."" */
const GRANTED_CASCADE_PATTERN = /^(.*?)\bspells? you cast\b(.*?) have "((?:cascade[,.]?\s*)+)"/i
/**
 * "Whenever a[n] X [you control] [with ...] enters". Group 1 is the type qualifier, group 2
 * any "with ..." clause (power, mana value), group 3 the rest of the sentence.
 */
const ENTERS_PATTERN =
  /\bwhenever (?:a|an|another|one or more) ([a-z][a-z\- ]*?)(?: you control)?((?: with [^,.]*?)?) enters?\b(?:\s+(?:the battlefield\s+)?under your control)?(.*)$/i
/** "Whenever Pantlaza or another Dinosaur you control enters": the source itself counts too. */
const SELF_OR_ANOTHER_ENTERS_PATTERN =
  /\bwhenever (?:this (?:creature|permanent|artifact|enchantment)|[A-Z][\w',\- ]*?) or another ([a-z][a-z\- ]*?)(?: you control)?((?: with [^,.]*?)?) enters?\b(.*)$/i
/** "Do this only once each turn": the ability does not trigger once it has happened (CR 603.2h). */
const DO_ONCE_EACH_TURN = /\bdo this only once each turn\b/i
/** "This ability triggers only once each turn." */
const TRIGGERS_ONCE_EACH_TURN = /\btriggers only once each turn\b/i
/**
 * "When this creature enters", "Whenever this creature enters or attacks", "When Dack
 * Fayden enters". Case-sensitive on purpose: a lowercase subject ("a creature", "another
 * Dinosaur") is a watcher, handled by ENTERS_PATTERN, not the permanent's own trigger.
 */
const OWN_ENTERS_PATTERN = /^When(?:ever)? (?:this\b[^,]*?|[A-Z][^,]*?) enters\b/
/** "When this creature leaves the battlefield" (CR 603.6c). */
const OWN_LEAVES_PATTERN = /^When(?:ever)? (?:this\b[^,]*?|[A-Z][^,]*?) leaves the battlefield\b/
/**
 * Panharmonicon: "If an artifact or creature entering causes a triggered ability of a
 * permanent you control to trigger, that ability triggers an additional time." Group 1 is
 * the qualifier on what entered. Yarok and Elesh Norn say "a permanent entering".
 */
const ENTERING_DOUBLER_PATTERN =
  /^If (?:a|an) ([a-z][a-z\- ]*?) entering(?: the battlefield)? causes a triggered ability of a permanent you control to trigger\b/i

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

/** Where a spell is being cast from. Cascade hits and free casts come from exile. */
export type CastFrom = 'hand' | 'elsewhere'

interface Subject {
  card: Card
  face: CardFace
  isToken: boolean
  castFrom?: CastFrom
  /** For an entering permanent, whether it was cast. Undefined when the app does not know. */
  wasCast?: boolean
}

/** The event a trigger is being suggested for; doublers only apply to some events. */
type TriggerEvent = { kind: 'cast' } | { kind: 'enters'; entering: Subject } | { kind: 'leaves' }

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
  const words = term.split(/\s+/).filter((w) => w !== '' && !/^(spells?|permanents?)$/.test(w))
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
  if (word === 'token' || word === 'tokens') return subject.isToken
  if (word === 'historic') return /\b(Artifact|Legendary|Saga)\b/.test(typeLine)
  if (word.startsWith('non')) {
    const inner = word.slice(3)
    const result = wordMatches(inner, typeLine, subject)
    return result === undefined ? undefined : !result
  }
  // "one or more creatures enter" names the type in the plural; the type line is singular.
  const forms = word.endsWith('s') ? [word, word.slice(0, -1)] : [word]
  const onTypeLine = (w: string) => new RegExp(`\\b${w}\\b`, 'i').test(typeLine)
  if (forms.some((w) => CARD_TYPES.includes(w))) return forms.some(onTypeLine)
  // Anything else is treated as a subtype (Eldrazi, Human, Equipment, ...).
  if (/^[a-z][a-z-]*$/.test(word)) return forms.some(onTypeLine)
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

const POWER_CLAUSES: Array<[RegExp, (m: RegExpExecArray, value: number) => boolean]> = [
  [/\bwith power (\d+) or greater\b/i, (m, v) => v >= Number(m[1])],
  [/\bwith power (\d+) or less\b/i, (m, v) => v <= Number(m[1])],
]

function evaluateTrailing(rest: string, subject: Subject): Evaluation {
  // An intervening "if" right after the trigger condition is for the user to judge, except
  // "if it wasn't cast" (Preston, the Vanisher), which the app knows for a permanent that
  // resolved as a spell, was blinked, or was put onto the battlefield by an effect.
  const ifClause = /^\s*,\s*(if\b[^,]+)/i.exec(rest)
  if (ifClause) {
    const clause = ifClause[1].trim()
    if (/^if it wasn't cast$/i.test(clause)) {
      if (subject.wasCast === undefined)
        return { result: undefined, reason: clause, dependsOnEntry: true }
      return { result: !subject.wasCast, dependsOnEntry: true }
    }
    return { result: undefined, reason: clause }
  }
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

  // Power clauses, for "creature you control with power 4 or greater enters".
  for (const [pattern, test] of POWER_CLAUSES) {
    const match = pattern.exec(text)
    if (!match) continue
    text = text.replace(match[0], '').trim()
    const power = Number.parseInt(subject.card.power ?? '', 10)
    if (Number.isNaN(power)) {
      result = undefined
      reasons.push(`power ${match[0].replace(/^with power /i, '')}`)
    } else if (!test(match, power)) {
      return { result: false }
    }
    break
  }

  let leftover = text
    .replace(/[,.].*$/s, '')
    .replace(/^(and|,)\s*/, '')
    .trim()
  let dependsOnCastFrom = false
  const fromHand = /^from your hand\b/i.exec(leftover)
  const notFromHand = /^from anywhere other than your hand\b/i.exec(leftover)
  if (fromHand || notFromHand) {
    dependsOnCastFrom = true
    const wantsHand = Boolean(fromHand)
    leftover = leftover.replace((fromHand ?? notFromHand)![0], '').trim()
    if (subject.castFrom === undefined) {
      result = undefined
      reasons.push(wantsHand ? 'from your hand' : 'from anywhere other than your hand')
    } else if ((subject.castFrom === 'hand') !== wantsHand) {
      return { result: false }
    }
  }
  if (leftover !== '') {
    result = undefined
    reasons.push(leftover)
  }
  return {
    result,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    dependsOnCastFrom,
  }
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
    return {
      result: undefined,
      reason: reasons.join('; '),
      dependsOnCastFrom: trailing.dependsOnCastFrom,
      dependsOnEntry: trailing.dependsOnEntry,
    }
  }
  return trailing
}

/**
 * Doublers on the battlefield that apply to `source` triggering for `event`. Echoes of
 * Eternity doubles any trigger of a colorless source; Panharmonicon doubles a trigger
 * only when an artifact or creature entering caused it. Each applicable doubler adds one
 * more instance (CR 603.2d): two Panharmonicons make three, not four.
 */
function doublersFor(
  source: Card,
  battlefield: BattlefieldPermanent[],
  event: TriggerEvent,
): { times: number; doubledBy?: string; doublers?: string[] } {
  const doublers: string[] = []
  for (const permanent of battlefield) {
    if (permanent.card.scryfallId === source.scryfallId && !permanent.isToken) continue
    if (!isTriggerDoubler(permanent.card)) continue
    const face = permanent.card.faces[permanent.faceIndex] ?? permanent.card.faces[0]
    const text = face.oracleText.replace(/\s*\([^)]*\)/g, '')
    const entering = ENTERING_DOUBLER_PATTERN.exec(text)
    if (entering) {
      if (event.kind !== 'enters') continue
      if (qualifierMatches(entering[1], event.entering) !== true) continue
      doublers.push(permanent.card.name)
      continue
    }
    // Echoes of Eternity doubles colorless sources; an unrecognised doubler is assumed to apply.
    const wantsColorless = /colorless/i.test(text)
    const isColorless = source.colors !== undefined && source.colors.length === 0
    if (!wantsColorless || isColorless) doublers.push(permanent.card.name)
  }
  if (doublers.length === 0) return { times: 1 }
  return { times: 1 + doublers.length, doubledBy: doublers.join(' + '), doublers }
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
  castFrom: CastFrom = 'hand',
): Suggestion[] {
  const face = spell.faces[spellFaceIndex] ?? spell.faces[0]
  const subject: Subject = { card: spell, face, isToken: false, castFrom }
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
      ...doublersFor(spell, battlefield, { kind: 'cast' }),
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
      // Reminder text reads "When you cast one, exile cards..."; on the trigger itself the
      // lead-in is noise, so the item text starts at the effect.
      // "Then do it again" describes the second cascade, which is its own item here.
      const reminder = (/\(([^)]*)\)/.exec(line)?.[1] ?? '')
        .replace(/^when you cast one,\s*/i, '')
        .replace(/\s*Then do it again\.?\s*$/i, '')
      const effect = reminder.charAt(0).toUpperCase() + reminder.slice(1)
      const doubling = doublersFor(spell, battlefield, { kind: 'cast' })
      suggestions.push({
        source: spell,
        sourceFaceIndex: spellFaceIndex,
        ability: {
          id: `${spell.oracleId}:${spellFaceIndex}:granted:${permanent.card.oracleId}`,
          cardOracleId: spell.oracleId,
          faceIndex: spellFaceIndex,
          kind: 'triggered',
          text: `Cascade. ${effect}`.trim(),
          fromKeyword: true,
        },
        grantedBy: permanent.card.name,
        certain: evaluation.result,
        uncertainReason: evaluation.reason,
        dependsOnCastFrom: evaluation.dependsOnCastFrom,
        times: cascades * doubling.times,
        doubledBy: [`${cascades}× from ${permanent.card.name}`, doubling.doubledBy]
          .filter(Boolean)
          .join(' + '),
        doublers: doubling.doublers,
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
        dependsOnCastFrom: evaluation.dependsOnCastFrom,
        ...doublersFor(permanent.card, battlefield, { kind: 'cast' }),
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
 * if it watches for other permanents entering. `entry` says whether it was cast, which
 * decides conditions such as Preston, the Vanisher's "if it wasn't cast"; leave it
 * undefined when the app does not know and the user is asked.
 */
export function entersTriggers(
  permanent: BattlefieldPermanent,
  battlefield: BattlefieldPermanent[],
  commanderIds: Set<string>,
  entry?: Entry,
): Suggestion[] {
  const face = permanent.card.faces[permanent.faceIndex] ?? permanent.card.faces[0]
  const subject: Subject = {
    card: permanent.card,
    face,
    isToken: permanent.isToken,
    wasCast: entry === undefined ? undefined : entry === 'cast',
  }
  const event: TriggerEvent = { kind: 'enters', entering: subject }
  const suggestions: Suggestion[] = []

  for (const ability of triggeredAbilities(permanent.card, permanent.faceIndex)) {
    const text = stripAbilityWord(ability.text)
    if (!OWN_ENTERS_PATTERN.test(text)) continue
    if (SELF_OR_ANOTHER_ENTERS_PATTERN.test(text)) continue
    const condition = interveningIf(text)
    suggestions.push({
      source: permanent.card,
      sourceFaceIndex: permanent.faceIndex,
      ability,
      certain: condition ? undefined : true,
      uncertainReason: condition,
      ...doublersFor(permanent.card, battlefield, event),
      fromCommander: commanderIds.has(permanent.card.oracleId),
      copiesSpell: false,
    })
  }

  for (const watcher of battlefield) {
    for (const ability of triggeredAbilities(watcher.card, watcher.faceIndex)) {
      const clean = stripAbilityWord(ability.text).replace(/\s*\([^)]*\)/g, '')
      const match = ENTERS_PATTERN.exec(clean) ?? SELF_OR_ANOTHER_ENTERS_PATTERN.exec(clean)
      if (!match) continue
      const isSelf = watcher.id === permanent.id
      const selfOrAnother = SELF_OR_ANOTHER_ENTERS_PATTERN.test(clean)
      // "Whenever another creature enters" excludes the entering permanent itself, but
      // "Whenever this creature or another Dinosaur enters" includes it.
      if (/\bwhenever another\b/i.test(clean) && isSelf) continue
      // The source entering on its own satisfies "this creature or another ..." regardless of type.
      if (selfOrAnother && isSelf) {
        suggestions.push({
          source: watcher.card,
          sourceFaceIndex: watcher.faceIndex,
          ability,
          certain: true,
          ...doublersFor(watcher.card, battlefield, event),
          fromCommander: commanderIds.has(watcher.card.oracleId),
          copiesSpell: false,
        })
        continue
      }
      const evaluation = combine(qualifierMatches(match[1], subject), match[2] + match[3], subject)
      if (evaluation.result === false) continue
      suggestions.push({
        source: watcher.card,
        sourceFaceIndex: watcher.faceIndex,
        ability,
        certain: evaluation.result,
        uncertainReason: evaluation.reason,
        dependsOnEntry: evaluation.dependsOnEntry,
        ...doublersFor(watcher.card, battlefield, event),
        fromCommander: commanderIds.has(watcher.card.oracleId),
        copiesSpell: false,
      })
    }
  }

  return orderForStack(suggestions)
}

/**
 * The permanent's own "when this leaves the battlefield" abilities. These look back in
 * time (CR 603.10a), so they trigger even though the permanent is already gone.
 */
export function leavesTriggers(
  permanent: BattlefieldPermanent,
  battlefield: BattlefieldPermanent[],
  commanderIds: Set<string>,
): Suggestion[] {
  const suggestions: Suggestion[] = []
  for (const ability of triggeredAbilities(permanent.card, permanent.faceIndex)) {
    const text = stripAbilityWord(ability.text)
    if (!OWN_LEAVES_PATTERN.test(text)) continue
    const condition = interveningIf(text)
    suggestions.push({
      source: permanent.card,
      sourceFaceIndex: permanent.faceIndex,
      ability,
      certain: condition ? undefined : true,
      uncertainReason: condition,
      ...doublersFor(permanent.card, battlefield, { kind: 'leaves' }),
      fromCommander: commanderIds.has(permanent.card.oracleId),
      copiesSpell: false,
    })
  }
  return orderForStack(suggestions)
}

/**
 * Triggers to offer when a permanent is blinked: exiled and returned at once. It leaves,
 * then comes back as a new object that was not cast (CR 400.7), so its leaves triggers
 * and the full set of enters triggers go on the stack together. A token that leaves the
 * battlefield ceases to exist and never returns (CR 111.8), so only its leaves triggers
 * are offered.
 */
export function blinkTriggers(
  permanent: BattlefieldPermanent,
  battlefield: BattlefieldPermanent[],
  commanderIds: Set<string>,
): Suggestion[] {
  const leaves = leavesTriggers(permanent, battlefield, commanderIds)
  if (permanent.isToken) return leaves
  return [...leaves, ...entersTriggers(permanent, battlefield, commanderIds, 'notCast')]
}

/**
 * What a resolving spell or ability may put onto the battlefield, read from its text, so
 * the app can ask what entered and offer the enters triggers.
 *
 * - blink: exiles a permanent and returns it straight away (Cloudshift, Ephemerate,
 *   Restoration Angel, Teleportation Circle). Returns that happen "at the beginning of the
 *   next end step" are not included; the ↻ button on the battlefield covers those.
 * - fromElsewhere: puts or returns cards onto the battlefield from a library, graveyard
 *   or hand (Dack Fayden, Sun Titan, Karmic Guide). `several` when more than one card may
 *   enter; `keeps` is false when the text hands the permanents to opponents, as Dack
 *   Fayden does. Basic lands and Plains fetched by ramp pieces are skipped: nothing in a
 *   deck watches for them and the picker would only get in the way.
 * - tokenCopy: creates a token copy of a creature or permanent (Preston, the Vanisher,
 *   embalm). The token enters, so its own enters triggers fire again.
 */
export type EntryEffect =
  | { kind: 'blink' }
  | {
      kind: 'fromElsewhere'
      several: boolean
      keeps: boolean
      /** The card type the effect names ("creature cards", "permanent card"), to narrow the picker. */
      cardType?: string
    }
  | { kind: 'tokenCopy' }

export function entryEffect(text: string): EntryEffect | null {
  const clean = text.replace(/\s*\([^)]*\)/g, '')
  if (
    /\bexile\b[^.]*?\btarget\b[^.]*?, then return (?:it|that card|them|those cards) to the battlefield\b/i.test(
      clean,
    )
  ) {
    return { kind: 'blink' }
  }
  // Embalm's copy is in its reminder text, so this one reads the raw line.
  if (/\bcreate a token that's a copy of (?:that|target|it\b)/i.test(text)) {
    return { kind: 'tokenCopy' }
  }
  for (const sentence of clean.split(/(?<=\.)\s+/)) {
    const match = /\b(?:put|return)\b(.*?)\b(?:onto|to) the battlefield\b/i.exec(sentence)
    if (!match) continue
    if (/\bat the beginning of\b/i.test(sentence)) continue
    if (/\b(?:basic|Plains|land cards?)\b/.test(sentence)) continue
    const object = match[1]
    const cardType = /\b(creature|artifact|enchantment|planeswalker|land|permanent)\b/i.exec(
      object,
    )?.[1]
    return {
      kind: 'fromElsewhere',
      several: /\b(?:cards|those|them|each|all)\b/i.test(object),
      keeps: !/\bopponents? gains? control\b/i.test(clean),
      ...(cardType ? { cardType: cardType.toLowerCase() } : {}),
    }
  }
  return null
}

/**
 * Simultaneous triggers go on the stack in the order their controller chooses (CR 603.3b).
 * The commander's triggers are placed last so they sit on top and resolve first, which is
 * what a copy commander such as Ulalek wants. The user can still reorder on the stack.
 */
function orderForStack(suggestions: Suggestion[]): Suggestion[] {
  return [...suggestions]
    .map(withNotes)
    .sort((a, b) => Number(a.fromCommander) - Number(b.fromCommander))
}

/** True for a trigger whose resolution exiles cards and may cast one for free: cascade or discover. */
export function castsExiledCard(text: string): boolean {
  return /^cascade\b/i.test(text) || /\bdiscover (\d+|x)\b/i.test(text)
}

/** Whether a resolving spell becomes a permanent (CR 608.3). */
export function isPermanentSpell(face: CardFace): boolean {
  return (
    /\b(Creature|Artifact|Enchantment|Planeswalker|Battle)\b/.test(face.typeLine) &&
    !/\b(Instant|Sorcery)\b/.test(face.typeLine)
  )
}
