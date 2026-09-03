import { useEffect, useRef, useState } from 'react'
import { autocomplete, fetchNamed } from '../lib/scryfall'
import {
  itemForNote,
  itemForSpell,
  parseControllerPrefix,
  type NewStackItem,
} from '../lib/stackItems'
import type { Card } from '../lib/types'

interface Props {
  onPush: (item: NewStackItem) => void
  onShowCard: (card: Card) => void
}

/**
 * Adds anything that is not in the deck palette: an opponent's spell looked up on
 * Scryfall, a token or emblem, or a plain note. Prefix with a name and a colon to set
 * the controller, e.g. "Kyle: Counterspell".
 */
export function QuickAdd({ onPush }: Props) {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<{ query: string; names: string[] }>({
    query: '',
    names: [],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounce = useRef<number | undefined>(undefined)

  const { controller, text } = parseControllerPrefix(value)

  // Suggestions are only shown for the query they were fetched for, so a cleared input
  // never shows stale names.
  const visibleSuggestions = suggestions.query === text ? suggestions.names : []

  useEffect(() => {
    window.clearTimeout(debounce.current)
    if (text.length < 3) return
    debounce.current = window.setTimeout(() => {
      autocomplete(text)
        .then((names) => setSuggestions({ query: text, names }))
        .catch(() => setSuggestions({ query: text, names: [] }))
    }, 250)
    return () => window.clearTimeout(debounce.current)
  }, [text])

  const addCard = async (name: string) => {
    setBusy(true)
    setError(null)
    try {
      const card = await fetchNamed(name, 'fuzzy')
      if (!card) {
        setError(`Scryfall has no card called "${name}".`)
        return
      }
      onPush(itemForSpell(card, 0, controller))
      setValue('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Lookup failed')
    } finally {
      setBusy(false)
    }
  }

  const addNote = () => {
    if (text === '') return
    onPush(itemForNote(controller, text))
    setValue('')
  }

  return (
    <div className="stackable">
      <div className="quick-add">
        <div className="row">
          <input
            type="search"
            name="quickAdd"
            placeholder="Add anything: “Kyle: Counterspell” or “Eldrazi Spawn token”"
            value={value}
            autoCapitalize="words"
            autoCorrect="off"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text !== '') {
                if (visibleSuggestions.length > 0) void addCard(visibleSuggestions[0])
                else void addCard(text)
              }
            }}
            aria-label="Quick add"
          />
          <button onClick={addNote} disabled={text === '' || busy} title="Add as plain text">
            Note
          </button>
        </div>
        {visibleSuggestions.length > 0 && (
          <div className="suggestions">
            {visibleSuggestions.slice(0, 8).map((name) => (
              <button key={name} onClick={() => void addCard(name)} disabled={busy}>
                <span className="muted">{controller !== 'You' ? `${controller}: ` : ''}</span>
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}
