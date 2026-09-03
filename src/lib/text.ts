/**
 * Normalises text for matching card names typed on a touch keyboard.
 *
 * iOS smart punctuation turns ' into ’ and " into “ ”, and people type names without
 * accents ("Lim-Dul" for "Lim-Dûl"). Card names from Scryfall use straight quotes and
 * accented characters, so both sides of every comparison go through this.
 */
export function normaliseText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .toLowerCase()
    .trim()
}

/** Straightens quotes and dashes without lowercasing, for text sent to Scryfall. */
export function straightenPunctuation(text: string): string {
  return text
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
}
