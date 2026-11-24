// Window px into the px a mod writes. No Herdr import: tests/units.test.mjs runs it under node.

/**
 * n: a length in window px (an on_size_change size, an event's position or bounds). zoom: settings().zoom.
 * Returns it in the px a mod writes, which Herdr draws times the zoom. A zoom Herdr has not
 * reported (missing, 0, NaN) counts as 1.
 */
export const toModPx = (n, zoom) => n / (zoom > 0 ? zoom : 1);
