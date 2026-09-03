import { useMemo, useState } from 'react'
import { extractAbilities, isLand } from '../lib/abilities'
import { itemForAbility, itemForSpell, type NewStackItem } from '../lib/stackItems'
import type { Ability, Card, Deck } from '../lib/types'

interface Props {
  deck: Deck
  onPush: (item: NewStackItem) => void
  onShowCard: (card: Card) => void
}

/**
 * The in-game card palette: every included card in the deck with its triggered and
 * activated abilities as tappable rows. Tapping a row puts that ability on the stack;
 * "Cast" puts the card itself on as a spell.
 */
export function Palette({ deck, onPush, onShowCard }: Props) {
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
      <div className="pane-body">
        {cards.length === 0 && <div className="empty">No cards match.</div>}
        {cards.map((entry) => (
          <PaletteCard
            key={entry.card.scryfallId}
            card={entry.card}
            isCommander={entry.isCommander}
            onPush={onPush}
            onShowCard={onShowCard}
          />
        ))}
      </div>
    </>
  )
}

interface CardProps {
  card: Card
  isCommander: boolean
  onPush: (item: NewStackItem) => void
  onShowCard: (card: Card) => void
}

function PaletteCard({ card, isCommander, onPush, onShowCard }: CardProps) {
  const abilities = extractAbilities(card)
  const front = card.faces[0]
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
          {card.faces.map((face, index) =>
            isLand(face) ? null : (
              <button
                key={index}
                onClick={() => onPush(itemForSpell(card, index))}
                title={`Put ${face.name} on the stack as a spell`}
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
