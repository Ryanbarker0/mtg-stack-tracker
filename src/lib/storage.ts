import { createStore, del, get, set } from 'idb-keyval'
import type { Deck, GameState } from './types'

/**
 * Local persistence in IndexedDB. The app is single-user and fully static, so the
 * device is the source of truth. Decks hold cached Scryfall data so a game can run
 * with no network.
 */

const store = createStore('mtg-stack-tracker', 'state')

const KEYS = {
  decks: 'decks',
  activeDeckId: 'activeDeckId',
  game: 'game',
} as const

export async function loadDecks(): Promise<Deck[]> {
  return (await get<Deck[]>(KEYS.decks, store)) ?? []
}

export async function saveDecks(decks: Deck[]): Promise<void> {
  await set(KEYS.decks, decks, store)
}

export async function loadActiveDeckId(): Promise<string | null> {
  return (await get<string>(KEYS.activeDeckId, store)) ?? null
}

export async function saveActiveDeckId(id: string | null): Promise<void> {
  if (id === null) await del(KEYS.activeDeckId, store)
  else await set(KEYS.activeDeckId, id, store)
}

export async function loadGame(): Promise<GameState | null> {
  return (await get<GameState>(KEYS.game, store)) ?? null
}

export async function saveGame(game: GameState): Promise<void> {
  await set(KEYS.game, game, store)
}
