import { useCallback, useEffect, useState } from 'react'
import { loadGame, saveGame } from '../lib/storage'
import type { GameState } from '../lib/types'
import { emptyGame, gameReducer, type GameAction } from './game'

const UNDO_LIMIT = 100

interface Timeline {
  past: GameState[]
  present: GameState
  future: GameState[]
}

/**
 * Game state with undo/redo and persistence. Undo history lives in memory only; the
 * current state is written to IndexedDB after every change so a reload mid-game is safe.
 */
export function useGame() {
  const [timeline, setTimeline] = useState<Timeline>({
    past: [],
    present: emptyGame(),
    future: [],
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadGame().then((stored) => {
      if (cancelled) return
      if (stored) setTimeline({ past: [], present: stored, future: [] })
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    saveGame(timeline.present).catch((error: unknown) =>
      console.error('Failed to save game', error),
    )
  }, [timeline.present, loaded])

  const dispatch = useCallback((action: GameAction) => {
    setTimeline((t) => {
      const next = gameReducer(t.present, action)
      if (next === t.present) return t
      return { past: [...t.past.slice(-(UNDO_LIMIT - 1)), t.present], present: next, future: [] }
    })
  }, [])

  const undo = useCallback(() => {
    setTimeline((t) => {
      if (t.past.length === 0) return t
      const previous = t.past[t.past.length - 1]
      return { past: t.past.slice(0, -1), present: previous, future: [t.present, ...t.future] }
    })
  }, [])

  const redo = useCallback(() => {
    setTimeline((t) => {
      if (t.future.length === 0) return t
      const [next, ...rest] = t.future
      return { past: [...t.past, t.present], present: next, future: rest }
    })
  }, [])

  return {
    game: timeline.present,
    loaded,
    dispatch,
    undo,
    redo,
    canUndo: timeline.past.length > 0,
    canRedo: timeline.future.length > 0,
  }
}
