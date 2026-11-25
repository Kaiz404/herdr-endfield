// Window px into the px a mod writes, and back. No Herdr import: tests/ runs it under node.

const scale = (zoom) => (zoom > 0 ? zoom : 1);

/**
 * n: a length in window px (an on_size_change size, an event's position or bounds). zoom: settings().zoom.
 * Returns it in the px a mod writes, which Herdr draws times the zoom. A zoom Herdr has not
 * reported (missing, 0, NaN) counts as 1.
 */
export const toModPx = (n, zoom) => n / scale(zoom);

/** n: a length in the px a mod writes. Returns it in window px, which openOverlay's `at` takes (#72). */
export const toWindowPx = (n, zoom) => n * scale(zoom);

/**
 * openOverlay's `at` for an overlay `size` ({width, height}, mod px) whose bottom-right corner sits
 * `inset` ({x, y}, mod px) inside a window `view` ({width, height}, window px) at `zoom`.
 */
export const cornerAt = (view, size, inset, zoom) => ({
  x: Math.round(view.width - toWindowPx(size.width + inset.x, zoom)),
  y: Math.round(view.height - toWindowPx(size.height + inset.y, zoom)),
});
