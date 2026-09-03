import { useEffect, useState } from 'react'
import { castTriggerTypes, includedByDefault, inclusionReason } from '../lib/abilities'
import { Caveats } from './Caveats'
import { parseDecklist } from '../lib/decklist'
import { lookupDecklist } from '../lib/scryfall'
import type { Card, Deck, DeckEntry, DecklistLine } from '../lib/types'
import { newId } from '../state/game'

interface Props {
  onSave: (deck: Deck) => void
  onCancel: () => void
  onShowCard: (card: Card) => void
}

interface Preset {
  id: string
  name: string
  file: string
  note?: string
}

/** Decklists shipped with the app, listed in public/decks/index.json. */
async function loadPresets(): Promise<Preset[]> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}decks/index.json`)
    if (!response.ok) return []
    return (await response.json()) as Preset[]
  } catch {
    return []
  }
}

type Step =
  | { name: 'paste' }
  | { name: 'loading'; done: number; total: number }
  | { name: 'review'; entries: DeckEntry[]; notFound: DecklistLine[]; watchedTypes: string[] }

const PLACEHOLDER = `Paste a decklist. Archidekt: Export → Text. Moxfield: Export → Copy.

1x Ulalek, Fused Atrocity (m3c) 4 [Commander{top}]
1x Kozilek, Butcher of Truth (m3c) 191
1x Eldrazi Temple (m3c) 297
...`

/**
 * Three steps: paste a list, look every card up on Scryfall, then review which cards
 * appear in the game palette. See includedByDefault for the default tick rule; the user
 * can override any card.
 */
export function DeckImport({ onSave, onCancel, onShowCard }: Props) {
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [step, setStep] = useState<Step>({ name: 'paste' })
  const [error, setError] = useState<string | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])

  useEffect(() => {
    let cancelled = false
    loadPresets().then((list) => {
      if (!cancelled) setPresets(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const applyPreset = async (preset: Preset) => {
    setError(null)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}decks/${preset.file}`)
      if (!response.ok) throw new Error(`Could not load ${preset.name}`)
      setText(await response.text())
      if (!name) setName(preset.name)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the preset')
    }
  }

  const start = async () => {
    setError(null)
    const lines = parseDecklist(text)
    if (lines.length === 0) {
      setError('No cards found in the pasted text.')
      return
    }
    setStep({ name: 'loading', done: 0, total: lines.length })
    try {
      const result = await lookupDecklist(lines, (done, total) =>
        setStep({ name: 'loading', done, total }),
      )
      const commanders = result.found.filter((f) => f.line.isCommander).map((f) => f.card)
      const watchedTypes = castTriggerTypes(commanders)
      const entries = mergeEntries(result.found, watchedTypes)
      if (!name && commanders.length > 0) setName(commanders[0].name)
      setStep({ name: 'review', entries, notFound: result.notFound, watchedTypes })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Scryfall lookup failed')
      setStep({ name: 'paste' })
    }
  }

  const toggle = (scryfallId: string) => {
    if (step.name !== 'review') return
    setStep({
      ...step,
      entries: step.entries.map((e) =>
        e.card.scryfallId === scryfallId ? { ...e, included: !e.included } : e,
      ),
    })
  }

  const save = () => {
    if (step.name !== 'review') return
    const now = new Date().toISOString()
    onSave({
      id: newId(),
      name: name.trim() || 'Untitled deck',
      entries: step.entries,
      createdAt: now,
      updatedAt: now,
    })
  }

  return (
    <div className="screen narrow stackable">
      <div className="row">
        <h1>Import a deck</h1>
        <span className="spacer" />
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {step.name === 'paste' && (
        <>
          <Caveats open />
          {presets.length > 0 && (
            <div className="row wrap">
              <span className="muted">Built-in lists:</span>
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => void applyPreset(preset)}
                  title={preset.note}
                >
                  Load {preset.name}
                </button>
              ))}
            </div>
          )}
          <textarea
            rows={16}
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Decklist"
          />
          {error && <div className="notice error">{error}</div>}
          <div className="row">
            <span className="muted">
              Every card is looked up on Scryfall. Nothing about a card is assumed.
            </span>
            <span className="spacer" />
            <button className="primary" onClick={() => void start()} disabled={text.trim() === ''}>
              Look up on Scryfall
            </button>
          </div>
        </>
      )}

      {step.name === 'loading' && (
        <div className="stackable">
          <p>
            Looking up {step.done} of {step.total} cards…
          </p>
          <div className="progress">
            <div style={{ width: `${(step.done / Math.max(1, step.total)) * 100}%` }} />
          </div>
        </div>
      )}

      {step.name === 'review' && (
        <>
          <label className="stackable" style={{ gap: 6 }}>
            <span className="muted">Deck name</span>
            <input
              type="text"
              name="deckName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Deck name"
            />
          </label>

          {step.notFound.length > 0 && (
            <div className="notice error">
              <strong>Not found on Scryfall ({step.notFound.length}):</strong>{' '}
              {step.notFound.map((l) => l.raw).join(', ')}
              <br />
              <span className="muted">
                Fix the names and import again, or continue without them.
              </span>
            </div>
          )}

          <p className="muted">
            Ticked cards appear in the game palette. Instants, sorceries and cards with a triggered
            or activated ability are ticked for you; tap to change. Anything else can be added
            mid-game with quick add.
          </p>
          {step.watchedTypes.length > 0 && (
            <div className="notice">
              Your commander triggers when you cast{' '}
              <strong>{step.watchedTypes.join(' or ')}</strong> spells, so every card of that type
              is ticked too.
            </div>
          )}
          <ReviewSummary entries={step.entries} />

          <div>
            {step.entries.map((entry) => (
              <ReviewRow
                key={entry.card.scryfallId}
                entry={entry}
                watchedTypes={step.watchedTypes}
                onToggle={() => toggle(entry.card.scryfallId)}
                onShowCard={() => onShowCard(entry.card)}
              />
            ))}
          </div>

          <div className="row">
            <button className="ghost" onClick={() => setStep({ name: 'paste' })}>
              Back
            </button>
            <span className="spacer" />
            <button className="primary" onClick={save}>
              Save deck
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function mergeEntries(
  found: Array<{ line: DecklistLine; card: Card }>,
  watchedTypes: string[],
): DeckEntry[] {
  const byId = new Map<string, DeckEntry>()
  for (const { line, card } of found) {
    const existing = byId.get(card.scryfallId)
    if (existing) {
      existing.quantity += line.quantity
      existing.isCommander ||= line.isCommander
    } else {
      byId.set(card.scryfallId, {
        card,
        quantity: line.quantity,
        included: includedByDefault(card, watchedTypes),
        isCommander: line.isCommander,
      })
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.isCommander !== b.isCommander) return a.isCommander ? -1 : 1
    if (a.included !== b.included) return a.included ? -1 : 1
    return a.card.name.localeCompare(b.card.name)
  })
}

function ReviewSummary({ entries }: { entries: DeckEntry[] }) {
  const included = entries.filter((e) => e.included).length
  return (
    <p className="faint">
      {entries.length} distinct cards found, {included} in the palette.
    </p>
  )
}

function ReviewRow({
  entry,
  watchedTypes,
  onToggle,
  onShowCard,
}: {
  entry: DeckEntry
  watchedTypes: string[]
  onToggle: () => void
  onShowCard: () => void
}) {
  return (
    <div className="review-row">
      <button
        className={`check ${entry.included ? 'on' : ''}`}
        onClick={onToggle}
        aria-pressed={entry.included}
        aria-label={`Include ${entry.card.name}`}
      >
        {entry.included ? '✓' : ''}
      </button>
      <div onClick={onShowCard} style={{ cursor: 'pointer', minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <strong>{entry.card.name}</strong>
          {entry.quantity > 1 && <span className="tag">×{entry.quantity}</span>}
          {entry.isCommander && <span className="tag commander">Commander</span>}
        </div>
        <div className="summary">
          {entry.card.typeLine} · {inclusionReason(entry.card, watchedTypes)}
        </div>
      </div>
      {entry.card.faces[0].imageUrl && (
        <img
          src={entry.card.faces[0].imageUrl}
          alt=""
          loading="lazy"
          style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 3 }}
          onClick={onShowCard}
        />
      )}
    </div>
  )
}
