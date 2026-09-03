import type { StackItem } from './types'

/**
 * Plain-language explanations of a stack item: what it is, why it exists, and what will
 * happen when it resolves. Built from the item's own facts (kind, lineage, text) so the
 * wording always matches what is actually on the stack.
 */

export interface Insight {
  /** One line naming what the item is. */
  what: string
  /** The rules behind it, one short paragraph each. */
  why: string[]
  /** What resolving it does, when the app knows. */
  onResolve?: string
}

const copiesAll = (text: string) => /copy all spells you control/i.test(text)
const copiesIt = (text: string) => /\bcopy (it|that spell)\b/i.test(text)
const isCascade = (text: string) => /^cascade\b/i.test(text)
const sacrificesSelf = (text: string) =>
  /\bsacrifice this (land|creature|artifact|enchantment|permanent)\b/i.test(text)

export function explain(item: StackItem, stack: StackItem[]): Insight {
  const base = item.title.replace(/^Copy of /, '')
  const kind = item.kind === 'copy' ? (item.originalKind ?? 'spell') : item.kind
  const origin = item.origin ?? []
  const why: string[] = []

  let what: string
  if (item.kind === 'copy') {
    what =
      kind === 'spell'
        ? `A copy of the spell ${base}. It was created on the stack, not cast.`
        : `A copy of a triggered ability of ${base}. It was created on the stack, not triggered.`
  } else if (kind === 'spell') {
    what = `${base}, a spell you cast.`
  } else if (kind === 'triggered') {
    what = `A triggered ability of ${base}.`
  } else if (kind === 'activated') {
    what = `An activated ability of ${base}.`
  } else {
    what = `A note you added.`
  }

  if (item.kind === 'copy') {
    why.push(
      'Copies are put straight onto the stack. Nothing that says "when you cast" or "whenever you cast" fires for a copy, and a doubler such as Echoes of Eternity does not double copies, because they never trigger.',
    )
    if (kind === 'spell') {
      why.push(
        'When a copy of a permanent spell resolves it becomes a token. The token has all the abilities of the original.',
      )
    }
  }

  if (origin.some((o) => /^Doubled by/.test(o))) {
    why.push(
      'This ability triggered an extra time because a colorless permanent or spell you control has a doubler out. Each instance is a separate object with its own choices.',
    )
  }

  if (origin.some((o) => /^Granted by/.test(o))) {
    const granter = origin.find((o) => /^Granted by/.test(o))?.replace(/^Granted by /, '')
    why.push(
      `${base} does not have this ability printed on it. ${granter} gives it to the spell while it is being cast, and the trigger belongs to the spell.`,
    )
  }

  if (copiesAll(item.text)) {
    const others = stack.filter(
      (i) => i.id !== item.id && i.controller === item.controller && i.kind !== 'note',
    )
    const ulalekTriggers = stack.filter((i) => i.id !== item.id && copiesAll(i.text)).length
    why.push(
      `If you pay {C}{C} when this resolves, it copies every other spell and ability you control on the stack. Right now that is ${others.length} item${others.length === 1 ? '' : 's'}.`,
    )
    if (ulalekTriggers > 0) {
      why.push(
        `${ulalekTriggers} other copy-all trigger${ulalekTriggers === 1 ? ' is' : 's are'} on the stack. Paying copies ${ulalekTriggers === 1 ? 'it' : 'them'} too, which is why a new one appears on top after each payment. The chain ends when you stop paying.`,
      )
    }
  }

  if (copiesIt(item.text)) {
    why.push(
      'When this trigger resolves it copies the spell that was cast. Copies of this trigger copy the spell again, so several of these mean several extra copies of the spell.',
    )
  }

  if (isCascade(item.text)) {
    why.push(
      'Cascade resolves before the spell it came from. Exile cards from the top of your library until you hit a nonland card that costs less, then you may cast it free. That card is cast, so cast triggers fire for it, but it comes from exile so it does not get cascade itself.',
    )
  }

  if (sacrificesSelf(item.text)) {
    why.push(
      'This ability sacrifices its own source. If several instances are on the stack, only the first one you say yes to does anything; once the permanent is gone the rest cannot sacrifice it.',
    )
  }

  if (kind === 'triggered' && item.kind !== 'copy' && origin.some((o) => /^Cast of/.test(o))) {
    why.push(
      'Triggers from casting a spell go on the stack above the spell, so they resolve before it does. When several trigger at once, their controller chooses the order.',
    )
  }

  let onResolve: string | undefined
  if (item.onResolve === 'copySpell') {
    const target = stack.find((i) => i.id === item.refersTo)
    onResolve = target
      ? `Puts a copy of ${target.title.replace(/^Copy of /, '')} on top of the stack.`
      : 'Nothing. The spell it would copy has already left the stack.'
  } else if (item.onResolve === 'cascade') {
    onResolve = 'Exile until a cheaper nonland card; you may cast it for free.'
  } else if (copiesAll(item.text)) {
    onResolve =
      'Your choice: pay {C}{C} and copy everything else you control, or decline and nothing happens.'
  } else if (kind === 'spell' && item.kind === 'copy') {
    onResolve = 'Becomes a token on the battlefield.'
  } else if (kind === 'spell') {
    onResolve = /\b(Instant|Sorcery)\b/.test(item.text)
      ? 'Does what it says.'
      : 'Enters the battlefield. Its abilities only matter once it is there.'
  }

  return { what, why, onResolve }
}
