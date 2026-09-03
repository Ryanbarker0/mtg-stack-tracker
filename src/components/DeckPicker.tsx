import { useMemo, useState } from 'react'
import { isLand } from '../lib/abilities'
import { normaliseText } from '../lib/text'
import type { Card, Deck } from '../lib/types'

interface Props {
  title: string
  subtitle: string
  deck: Deck
  onPick: (card: Card) => void
  onCancel: () => void
}

/**
 * Picks any nonland card from the whole deck, not just the palette. Used for cascade
 * hits, which can be anything in the library.
 */
export function DeckPicker({ title, subtitle, deck, onPick, onCancel }: Props) {
  const [filter, setFilter] = useState('')
  const cards = useMemo(() => {
    const needle = normaliseText(filter)
    return deck.entries
      .map((e) => e.card)
      .filter((c) => c.faces.some((f) => !isLand(f)))
      .filter((c) => needle === '' || normaliseText(c.name).includes(needle))
      .sort((a, b) => (a.manaValue ?? 0) - (b.manaValue ?? 0) || a.name.localeCompare(b.name))
  }, [deck, filter])

  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="modal single"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="stackable">
          <div>
            <h1>{title}</h1>
            <p className="muted">{subtitle}</p>
          </div>
          <input
            type="search"
            name="pick"
            placeholder="Filter by name…"
            value={filter}
            autoFocus
            autoCorrect="off"
            autoCapitalize="none"
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter cards"
          />
          <div className="picker-list">
            {cards.map((card) => (
              <button key={card.scryfallId} className="picker-row" onClick={() => onPick(card)}>
                {card.faces[0].imageUrl ? (
                  <img src={card.faces[0].imageUrl} alt="" loading="lazy" />
                ) : (
                  <span className="thumb" />
                )}
                <span className="body">
                  <strong>{card.name}</strong>
                  <span className="faint">
                    {card.faces[0].typeLine}
                    {card.manaValue !== undefined ? ` · MV ${card.manaValue}` : ''}
                  </span>
                </span>
              </button>
            ))}
            {cards.length === 0 && <div className="empty">No cards match.</div>}
          </div>
          <div className="row">
            <button className="ghost" onClick={onCancel}>
              Nothing cast
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
