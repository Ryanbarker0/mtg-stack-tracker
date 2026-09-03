/**
 * Core domain types.
 *
 * Everything about a card comes verbatim from Scryfall. We never hand-author
 * card text; we only classify the text Scryfall gives us so the user can pick
 * abilities to put on the stack.
 */

/** One face of a card as stored locally. Single-faced cards have exactly one face. */
export interface CardFace {
  name: string
  manaCost: string
  typeLine: string
  oracleText: string
  /** Small image URL (Scryfall "small" or "normal"). May be missing for some faces. */
  imageUrl?: string
}

/** A card as stored in a deck, trimmed down from the Scryfall response. */
export interface Card {
  /** Scryfall card id (printing-specific). */
  scryfallId: string
  /** Scryfall oracle id (shared across printings). */
  oracleId: string
  name: string
  typeLine: string
  keywords: string[]
  /** Scryfall colour codes (W U B R G). Empty for colorless. Missing on decks imported before colours were stored. */
  colors?: string[]
  /** Mana value (Scryfall cmc). Missing on decks imported before it was stored. */
  manaValue?: number
  faces: CardFace[]
  scryfallUri: string
  /** Rulings text pulled from Scryfall, fetched lazily. */
  rulings?: string[]
}

/** 'mana' marks mana abilities, which never use the stack (CR 605). */
export type AbilityKind = 'triggered' | 'activated' | 'mana' | 'static'

/** One ability line extracted from a card's oracle text. */
export interface Ability {
  /** Stable id: `${oracleId}:${faceIndex}:${lineIndex}` */
  id: string
  cardOracleId: string
  faceIndex: number
  kind: AbilityKind
  text: string
  /** True for keyword abilities we synthesised (e.g. "Annihilator 2") rather than raw lines. */
  fromKeyword?: boolean
}

export interface DeckEntry {
  card: Card
  quantity: number
  /**
   * Whether this card appears in the in-game palette. Defaults to true when the
   * card has any triggered or activated ability; the user can override either way.
   */
  included: boolean
  isCommander: boolean
}

export interface Deck {
  id: string
  name: string
  entries: DeckEntry[]
  createdAt: string
  updatedAt: string
}

export type StackItemKind = 'spell' | 'triggered' | 'activated' | 'copy' | 'note'

/** An object on the stack. */
export interface StackItem {
  id: string
  kind: StackItemKind
  /** Who controls it. "You" for the app user; free text for opponents. */
  controller: string
  title: string
  /** The rules text of the spell or ability, shown under the title. */
  text: string
  imageUrl?: string
  scryfallUri?: string
  /** If this is a copy, the id of the item it was copied from (may be resolved already). */
  copyOf?: string
  /** For copies, the kind of the original so a copied permanent spell still becomes a token. */
  originalKind?: StackItemKind
  /** Which face of the card this item represents. */
  faceIndex?: number
  /**
   * What the app does when this item resolves. 'copySpell' copies the spell in
   * `refersTo` (Echoes of Eternity's "whenever you cast a colorless spell, copy it").
   * Copies of the item inherit this, so a copied Echoes trigger copies the spell again.
   */
  onResolve?: 'copySpell'
  /** Stack item id this item refers to, e.g. the spell whose cast triggered it. */
  refersTo?: string
  /** Free-form annotation the user typed, e.g. targets. */
  note?: string
  /** The full card, when the item came from one, so the detail view can show image and rulings. */
  card?: Card
  createdAt: number
}

export interface ResolvedItem {
  item: StackItem
  /** How it left the stack. */
  outcome: 'resolved' | 'removed'
  at: number
}

/** A permanent you control. Used only to suggest triggers; it is not a full board state. */
export interface BattlefieldPermanent {
  id: string
  card: Card
  faceIndex: number
  isToken: boolean
}

export interface GameState {
  /** Bottom of the stack is index 0; top (next to resolve) is the last element. */
  stack: StackItem[]
  history: ResolvedItem[]
  battlefield: BattlefieldPermanent[]
}

/** A parsed line from a pasted decklist before it has been looked up on Scryfall. */
export interface DecklistLine {
  quantity: number
  name: string
  /** Set code if the list included one, e.g. "m3c". */
  set?: string
  /** Collector number if the list included one. */
  collectorNumber?: string
  isCommander: boolean
  /** Original text, kept for error reporting. */
  raw: string
}
