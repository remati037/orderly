// Chart colors.
//
// Site colors are user-picked brand colors (settings → sites) and follow the
// site through every chart. Some are too light to read as a mark on the white
// surface (e.g. #fed300), so charts use chartColor(): same hue and chroma,
// lightness clamped into the readable band (OKLCH L 0.43–0.77). The stored
// color is untouched.

const L_MIN = 0.43;
const L_MAX = 0.77;

type Vec3 = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex: string): Vec3 | null {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Vec3;
}

function rgbToOklab([r, g, b]: Vec3): Vec3 {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toGamma) as Vec3;
}

const inGamut = (rgb: Vec3) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);
const toHex = (rgb: Vec3) =>
  "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");

export function chartColor(hex: string | null | undefined, fallback = "#71717A"): string {
  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) return fallback;
  const [L, a, b] = rgbToOklab(rgb);
  if (L >= L_MIN && L <= L_MAX) return toHex(rgb);

  const target = Math.min(L_MAX, Math.max(L_MIN, L));
  // Hold the hue; shrink chroma only as far as needed to stay in sRGB.
  for (let k = 1; k >= 0; k -= 0.02) {
    const out = oklabToRgb([target, a * k, b * k]);
    if (inGamut(out)) return toHex(out);
  }
  return toHex(oklabToRgb([target, 0, 0]));
}

// Reference categorical slots / sequential ramp (dataviz palette, light mode).
export const SERIES = { blue: "#2a78d6", orange: "#eb6834" } as const;
export const BLUE_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#2a78d6", "#1c5cab", "#104281"] as const;

// ── series order ─────────────────────────────────────────────────────────────
// In stacks and multi-line charts adjacent series must stay distinguishable
// under colour-vision deficiency. Site colours are user-picked, so instead of
// fixing the palette we pick the ORDER: the permutation whose worst adjacent
// pair (min of protan/deutan, OKLab ΔE×100, Machado 2009 severity 1.0 — the
// same model as the dataviz validator) is largest. Brute force for ≤ 7 series.

const MACHADO: Record<"protan" | "deutan", number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};

function oklabFromLinear([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function cvdDeltaE(h1: string, h2: string): number {
  const lin = (h: string) => (hexToRgb(h) ?? [0, 0, 0]).map(toLinear) as Vec3;
  const sim = (c: Vec3, M: number[][]) =>
    M.map((row) => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))) as Vec3;
  let worst = Infinity;
  for (const M of Object.values(MACHADO)) {
    const a = oklabFromLinear(sim(lin(h1), M));
    const b = oklabFromLinear(sim(lin(h2), M));
    worst = Math.min(worst, 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  return worst;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

// Returns the items reordered for the best adjacent CVD separation of their
// (chart-safe) colours; ties keep the incoming order.
export function orderForSeparation<T>(items: T[], colorOf: (item: T) => string): T[] {
  if (items.length < 3 || items.length > 7) return items;
  let best = items;
  let bestScore = -1;
  for (const perm of permutations(items)) {
    let score = Infinity;
    for (let i = 1; i < perm.length; i++) score = Math.min(score, cvdDeltaE(colorOf(perm[i - 1]), colorOf(perm[i])));
    if (score > bestScore + 1e-9) { best = perm; bestScore = score; }
  }
  return best;
}
