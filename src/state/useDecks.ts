import { useCallback, useEffect, useState } from 'react'
import { loadActiveDeckId, loadDecks, saveActiveDeckId, saveDecks } from '../lib/storage'
import type { Deck } from '../lib/types'

export function useDecks() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [activeDeckId, setActiveDeckIdState] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([loadDecks(), loadActiveDeckId()]).then(([storedDecks, storedActive]) => {
      if (cancelled) return
      setDecks(storedDecks)
      setActiveDeckIdState(storedActive)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const persist = useCallback((next: Deck[]) => {
    setDecks(next)
    saveDecks(next).catch((error: unknown) => console.error('Failed to save decks', error))
  }, [])

  const setActiveDeckId = useCallback((id: string | null) => {
    setActiveDeckIdState(id)
    saveActiveDeckId(id).catch((error: unknown) => console.error('Failed to save deck id', error))
  }, [])

  const addDeck = useCallback(
    (deck: Deck) => {
      persist([...decks, deck])
      setActiveDeckId(deck.id)
    },
    [decks, persist, setActiveDeckId],
  )

  const updateDeck = useCallback(
    (deck: Deck) => {
      persist(
        decks.map((d) => (d.id === deck.id ? { ...deck, updatedAt: new Date().toISOString() } : d)),
      )
    },
    [decks, persist],
  )

  const deleteDeck = useCallback(
    (id: string) => {
      persist(decks.filter((d) => d.id !== id))
      if (activeDeckId === id) setActiveDeckId(null)
    },
    [activeDeckId, decks, persist, setActiveDeckId],
  )

  const activeDeck = decks.find((d) => d.id === activeDeckId) ?? null

  return {
    decks,
    activeDeck,
    activeDeckId,
    loaded,
    setActiveDeckId,
    addDeck,
    updateDeck,
    deleteDeck,
  }
}
