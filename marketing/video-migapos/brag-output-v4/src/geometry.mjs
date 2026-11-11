export const viewport = {x: 0, y: 0, width: 390, height: 844};
const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

export function detailWindow({focus, area}) {
  const [fx, fy, fw, fh] = focus;
  const [ax, ay, aw, ah] = area;
  const containsFocus = ax <= fx + 1 && ay <= fy + 1 && ax + aw >= fx + fw - 1 && ay + ah >= fy + fh - 1;
  const usefulArea = containsFocus && ax >= 0 && ay >= 0 && ax + aw <= 390 && ay + ah <= 844 && ah <= 480;
  const [x, y, w, h] = usefulArea ? area : focus;
  const width = clamp(w, 1, 390);
  const height = clamp(h, 1, 844);
  return {
    x: clamp(x + w / 2 - width / 2, 0, 390 - width),
    y: clamp(y + h / 2 - height / 2, 0, 844 - height),
    width,
    height,
  };
}

export function frameWindow(crop, amount) {
  const mix = (from, to) => from + (to - from) * amount;
  const visible = {
    x: mix(viewport.x, crop.x),
    y: mix(viewport.y, crop.y),
    width: mix(viewport.width, crop.width),
    height: mix(viewport.height, crop.height),
  };
  const scale = Math.min(mix(524, 824) / visible.width, mix(1134, 1020) / visible.height, 2.95);
  const width = visible.width * scale;
  const height = visible.height * scale;
  return {...visible, scale, screen: {left: 495 - width / 2, top: mix(823, 839) - height / 2, width, height}};
}
