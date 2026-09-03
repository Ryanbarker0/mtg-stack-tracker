import { useEffect, useState } from 'react'
import { extractAbilities } from '../lib/abilities'
import { fetchRulings } from '../lib/scryfall'
import type { Card } from '../lib/types'

interface Props {
  card: Card
  onClose: () => void
}

/** Full card view: image, every oracle paragraph with its classification, and Scryfall rulings. */
export function CardDetail({ card, onClose }: Props) {
  const [rulings, setRulings] = useState<string[] | null>(card.rulings ?? null)
  const [rulingsError, setRulingsError] = useState<string | null>(null)

  useEffect(() => {
    if (rulings !== null) return
    let cancelled = false
    fetchRulings(card.scryfallId)
      .then((result) => {
        if (!cancelled) setRulings(result)
      })
      .catch((error: unknown) => {
        if (!cancelled) setRulingsError(error instanceof Error ? error.message : 'Failed to load')
      })
    return () => {
      cancelled = true
    }
  }, [card.scryfallId, rulings])

  const abilities = extractAbilities(card)

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={card.name}
      >
        <div className="stackable">
          {card.faces.map((face, index) =>
            face.imageUrl ? (
              <img key={index} src={face.imageUrl} alt={face.name} loading="lazy" />
            ) : null,
          )}
        </div>
        <div className="stackable">
          <div className="row">
            <h1>{card.name}</h1>
            <span className="spacer" />
            <button className="icon ghost" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <p className="muted">{card.typeLine}</p>

          {card.faces.map((face, faceIndex) => (
            <div key={faceIndex} className="stackable">
              {card.faces.length > 1 && <h2>{face.name}</h2>}
              {abilities
                .filter((a) => a.faceIndex === faceIndex)
                .map((ability) => (
                  <div key={ability.id} className="ability" style={{ minHeight: 0 }}>
                    <span className={`bar bar-${ability.kind}`} />
                    <div>
                      <div className={`kind kind-${ability.kind}`}>{ability.kind}</div>
                      <div className="oracle">{ability.text}</div>
                    </div>
                  </div>
                ))}
            </div>
          ))}

          <h3>Rulings</h3>
          {rulingsError && <div className="notice error">{rulingsError}</div>}
          {rulings === null && !rulingsError && <p className="faint">Loading rulings…</p>}
          {rulings && rulings.length === 0 && <p className="faint">No rulings on Scryfall.</p>}
          {rulings && rulings.length > 0 && (
            <ul>
              {rulings.map((ruling, index) => (
                <li key={index}>{ruling}</li>
              ))}
            </ul>
          )}
          <a href={card.scryfallUri} target="_blank" rel="noreferrer">
            Open on Scryfall
          </a>
        </div>
      </div>
    </div>
  )
}
