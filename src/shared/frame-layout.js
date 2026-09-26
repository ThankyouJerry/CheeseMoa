// Keep the embedded site's desktop layout, scaling its entire UI into the tile.
export function fitFrame(width, height) {
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(1, width / 1280, height / 720);
  return { width: width / scale, height: height / scale, scale };
}
