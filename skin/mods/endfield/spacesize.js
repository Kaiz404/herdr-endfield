// The spaces block's size in the sidebar: folded to its header, fitted to a compact list, or the
// share it had. No Herdr import: tests/spacesize.test.mjs runs it under node.

// The Spaces header's height. layouts/endfield.json keeps the block's min at or below it, or
// Herdr would hold a folded block taller than its header.
export const HEAD = 38;

/**
 * folded: the person folded Spaces (endfield.spacesFolded). rail: the sidebar is the narrow rail,
 * which has no chevron, so it shows the list whatever the fold says. fitted: the compact list's
 * height in px, or null when the fleet is not compact. open: the size it had before it folded.
 */
export function spacesSize({ folded, rail, fitted, open }) {
  if (folded && !rail) return { px: HEAD };
  if (fitted) return { px: fitted };
  return open ?? { weight: 1 };
}

/** What to restore on unfold: the block's share, never a px a fold or the compact fit set. */
export const openSize = (size) => (size?.weight ? { weight: size.weight } : null);
