// The session card's one rule: whose card is up. No Herdr import: tests/ runs it under node.

// Hover is only reported when it changes, and an exit can go unreported. Where the pointer is now
// overrules a remembered hover; a pointer or a rectangle that isn't known overrules nothing.
const on = (rect, p) => !rect || !p || (p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height);

/**
 * facts, read when the decision is made: `row` is the hovered agent row's address and `rowRect`
 * where that row is, `hot` the overlay id of the card the pointer is on, `open` the card that is up
 * ({ id, address, rect }), `pointer` where the pointer is (window px, as the rects), `active`
 * whether the window is the active one.
 * Returns the address whose card should be up, or null for none.
 */
export function wantedCard({ row = null, rowRect = null, hot = null, open = null, pointer = null, active = true }) {
  if (!active) return null;
  if (row && on(rowRect, pointer)) return row;
  return open && hot === open.id && on(open.rect, pointer) ? open.address : null;
}
