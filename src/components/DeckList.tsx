import type { Deck } from '../lib/types'

interface Props {
  decks: Deck[]
  activeDeckId: string | null
  onPlay: (deck: Deck) => void
  onDelete: (deck: Deck) => void
  onImport: () => void
}

export function DeckList({ decks, activeDeckId, onPlay, onDelete, onImport }: Props) {
  return (
    <div className="screen narrow stackable">
      <div className="row">
        <h1>Decks</h1>
        <span className="spacer" />
        <button className="primary" onClick={onImport}>
          + Import deck
        </button>
      </div>

      {decks.length === 0 && (
        <div className="empty">
          No decks yet. Import one from Archidekt or Moxfield to get started.
        </div>
      )}

      {decks.map((deck) => {
        const included = deck.entries.filter((e) => e.included).length
        return (
          <div key={deck.id} className={`deck-card ${deck.id === activeDeckId ? 'active' : ''}`}>
            <div className="info">
              <div className="name">{deck.name}</div>
              <div className="muted">
                {deck.entries.length} cards, {included} in the palette
              </div>
            </div>
            <button
              className="danger"
              onClick={() => {
                if (window.confirm(`Delete "${deck.name}"? This cannot be undone.`)) onDelete(deck)
              }}
            >
              Delete
            </button>
            <button className="primary" onClick={() => onPlay(deck)}>
              Play
            </button>
          </div>
        )
      })}

      <p className="faint">
        Decks and card data are stored on this device. Card text and rulings come from Scryfall and
        are cached so games work offline.
      </p>
    </div>
  )
}
