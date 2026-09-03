import { useMemo, useState } from 'react'
import { extractAbilities, isLand } from '../lib/abilities'
import { itemForAbility, type NewStackItem } from '../lib/stackItems'
import type { Ability, BattlefieldPermanent, Card, Deck } from '../lib/types'

interface Props {
  deck: Deck
  battlefield: BattlefieldPermanent[]
  onPush: (item: NewStackItem) => void
  onCast: (card: Card, faceIndex: number) => void
  onShowCard: (card: Card) => void
  onFieldAdd: (card: Card, faceIndex: number) => void
  onFieldRemove: (id: string) => void
}

/**
 * The in-game card palette: every included card in the deck with its triggered and
 * activated abilities as tappable rows. Tapping a row puts that ability on the stack;
 * "Cast" puts the card itself on as a spell and offers matching triggers. The strip at
 * the top lists the permanents you control, which drives trigger suggestions.
 */
export function Palette({
  deck,
  battlefield,
  onPush,
  onCast,
  onShowCard,
  onFieldAdd,
  onFieldRemove,
}: Props) {
  const [filter, setFilter] = useState('')

  const cards = useMemo(() => {
    const included = deck.entries.filter((e) => e.included)
    const sorted = [...included].sort((a, b) => {
      if (a.isCommander !== b.isCommander) return a.isCommander ? -1 : 1
      return a.card.name.localeCompare(b.card.name)
    })
    const needle = filter.trim().toLowerCase()
    if (needle === '') return sorted
    return sorted.filter(
      (e) =>
        e.card.name.toLowerCase().includes(needle) ||
        e.card.faces.some((f) => f.oracleText.toLowerCase().includes(needle)),
    )
  }, [deck, filter])

  return (
    <>
      <div className="pane-header">
        <input
          type="search"
          name="filter"
          placeholder="Filter deck…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter deck"
          autoCorrect="off"
          autoCapitalize="none"
        />
      </div>
      <div className="battlefield" aria-label="Battlefield">
        <span className="label">Battlefield</span>
        {battlefield.length === 0 && (
          <span className="faint" style={{ fontSize: 13 }}>
            Nothing yet. Resolved permanents land here, or tap “Field” on a card.
          </span>
        )}
        {battlefield.map((p) => (
          <button
            key={p.id}
            className={`chip ${p.isToken ? 'token' : ''}`}
            onClick={() => onFieldRemove(p.id)}
            title={
              p.isToken
                ? 'Token. Tap to remove from the battlefield'
                : 'Tap to remove from the battlefield'
            }
          >
            {p.card.faces[p.faceIndex]?.name ?? p.card.name}
            {p.isToken && <span className="faint">token</span>}
            <span className="x">✕</span>
          </button>
        ))}
      </div>
      <div className="pane-body">
        {cards.length === 0 && <div className="empty">No cards match.</div>}
        {cards.map((entry) => (
          <PaletteCard
            key={entry.card.scryfallId}
            card={entry.card}
            isCommander={entry.isCommander}
            onField={battlefield.filter((p) => p.card.scryfallId === entry.card.scryfallId)}
            onPush={onPush}
            onCast={onCast}
            onShowCard={onShowCard}
            onFieldAdd={onFieldAdd}
            onFieldRemove={onFieldRemove}
          />
        ))}
      </div>
    </>
  )
}

interface CardProps {
  card: Card
  isCommander: boolean
  onField: BattlefieldPermanent[]
  onPush: (item: NewStackItem) => void
  onCast: (card: Card, faceIndex: number) => void
  onShowCard: (card: Card) => void
  onFieldAdd: (card: Card, faceIndex: number) => void
  onFieldRemove: (id: string) => void
}

function PaletteCard({
  card,
  isCommander,
  onField,
  onPush,
  onCast,
  onShowCard,
  onFieldAdd,
  onFieldRemove,
}: CardProps) {
  const abilities = extractAbilities(card)
  const front = card.faces[0]
  // Lands are permanents too: Sanctum of Ugin's cast trigger only matters once it is in play.
  const isPermanentCard = card.faces.some((f) => !/\b(Instant|Sorcery)\b/.test(f.typeLine))
  const inPlay = onField.length > 0
  return (
    <div className="palette-card">
      {front.imageUrl ? (
        <img
          className="thumb"
          src={front.imageUrl}
          alt=""
          loading="lazy"
          onClick={() => onShowCard(card)}
        />
      ) : (
        <div className="thumb" onClick={() => onShowCard(card)} />
      )}
      <div>
        <div className="name">
          <span onClick={() => onShowCard(card)}>{card.name}</span>
          {isCommander && <span className="tag commander">Commander</span>}
          <span className="spacer" />
          {isPermanentCard && (
            <button
              className={`field-toggle ${inPlay ? 'on' : ''}`}
              onClick={() =>
                inPlay ? onFieldRemove(onField[onField.length - 1].id) : onFieldAdd(card, 0)
              }
              title={inPlay ? 'On the battlefield. Tap to remove' : 'Mark as on the battlefield'}
            >
              {inPlay ? `✓ Field${onField.length > 1 ? ` ×${onField.length}` : ''}` : 'Field'}
            </button>
          )}
          {card.faces.map((face, index) =>
            isLand(face) ? null : (
              <button
                key={index}
                onClick={() => onCast(card, index)}
                title={`Cast ${face.name}`}
                style={{ minHeight: 36, padding: '0 12px', fontSize: 14 }}
              >
                Cast{card.faces.length > 1 ? ` ${face.name}` : ''}
              </button>
            ),
          )}
        </div>
        <div className="ability-list">
          {abilities.map((ability) => (
            <AbilityRow
              key={ability.id}
              ability={ability}
              onPush={() => onPush(itemForAbility(card, ability))}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function AbilityRow({ ability, onPush }: { ability: Ability; onPush: () => void }) {
  const usesStack = ability.kind === 'triggered' || ability.kind === 'activated'
  return (
    <button
      className={`ability ${usesStack ? '' : 'static'}`}
      onClick={onPush}
      disabled={!usesStack}
      title={usesStack ? 'Put on the stack' : 'Does not use the stack'}
    >
      <span className={`bar bar-${ability.kind}`} />
      <span>
        <span className={`kind kind-${ability.kind}`}>{ability.kind}</span>
        <span className="text">{ability.text}</span>
      </span>
    </button>
  )
}
