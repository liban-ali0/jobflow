// Builds the app's brand colours from the two colours chosen in Settings.
// Every text colour is picked or adjusted so it stays readable (WCAG AA,
// 4.5:1) whatever colours are chosen.

export type Mode = "system" | "light" | "dark";
export type Appearance = { mode: Mode; primary: string; secondary: string };

export const DEFAULT_APPEARANCE: Appearance = { mode: "system", primary: "#12203a", secondary: "#ffc20e" };

export const PRESETS: { name: string; primary: string; secondary: string }[] = [
  { name: "Signage", primary: "#12203a", secondary: "#ffc20e" },
  { name: "Gulf", primary: "#0f4c5c", secondary: "#e9c46a" },
  { name: "Bosphorus", primary: "#1d3557", secondary: "#e63946" },
  { name: "Desert", primary: "#3d2c2e", secondary: "#f4a259" },
  { name: "Mint", primary: "#1b4332", secondary: "#74c69d" },
];

type RGB = [number, number, number];
type HSL = [number, number, number];

const DARK_TEXT = "#0b1220";
const LIGHT_TEXT = "#ffffff";
const BOARD_TEXT = "#e9eef7";
const DARK_PAGE = "#0b1220";

export const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (rgb: RGB) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function toHsl(hex: string): HSL {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function fromHsl([h, s, l]: HSL) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

// Moves a colour's lightness towards light (or dark) until it reaches the
// contrast `target` against `against`.
function adjustUntil(hex: string, against: string, target: number, direction: "lighter" | "darker") {
  const [h, s, l] = toHsl(hex);
  for (let step = 0; step <= 100; step += 2) {
    const candidate = fromHsl([h, s, direction === "lighter" ? Math.min(100, l + step) : Math.max(0, l - step)]);
    if (contrast(candidate, against) >= target) return candidate;
  }
  return direction === "lighter" ? LIGHT_TEXT : DARK_TEXT;
}

// Dark or light text, whichever reads better on `background`. Pure black is
// the last resort for mid-tone colours where navy falls just short.
export function textOn(background: string) {
  return [LIGHT_TEXT, DARK_TEXT, "#000000"].reduce((best, candidate) =>
    contrast(candidate, background) > contrast(best, background) ? candidate : best,
  );
}

// A surface that carries text: if no text colour reaches 4.5:1 on it, the
// surface itself is darkened just enough for white text.
function readableSurface(hex: string) {
  return contrast(textOn(hex), hex) >= 4.5 ? hex : adjustUntil(hex, LIGHT_TEXT, 4.5, "darker");
}

// Colour `hex` as text on `background`: unchanged when readable, otherwise
// adjusted away from the background's lightness.
function readableOn(hex: string, background: string) {
  if (contrast(hex, background) >= 4.5) return hex;
  return adjustUntil(hex, background, 4.5, luminance(background) < 0.2 ? "lighter" : "darker");
}

// Dark surfaces tinted with the primary colour's hue: the workflow strip in
// both modes, and the job tables in dark mode.
function darkColors(primary: string) {
  const [h, s] = toHsl(primary);
  const sat = Math.min(s, 45);
  const base = fromHsl([h, sat, 9]);
  return {
    base,
    row: fromHsl([h, sat, 13]),
    line: fromHsl([h, sat, 21]),
    control: adjustUntil(fromHsl([h, Math.min(sat, 25), 40]), base, 3, "lighter"),
    text: BOARD_TEXT,
    dim: adjustUntil(fromHsl([h, Math.min(sat, 20), 62]), base, 4.5, "lighter"),
  };
}

// The job tables follow the mode: light like the cards in light mode, dark
// and tinted in dark mode.
const LIGHT_BOARD = { base: "#ffffff", row: "#f2f5f9", line: "#d7dde6", control: "#7d8aa0", text: "#12203a", dim: "#5a6a80" };

function boardColors(primary: string, dark: boolean) {
  const colors = dark ? darkColors(primary) : LIGHT_BOARD;
  return {
    board: colors.base,
    "board-row": colors.row,
    "board-line": colors.line,
    "board-control": colors.control,
    "board-text": colors.text,
    "board-dim": colors.dim,
    // Split-flap destination tiles: a light grey tile in light mode.
    "flap-top": dark ? colors.line : "#e8edf3",
    "flap-bottom": dark ? colors.base : "#dbe2eb",
  };
}

// The workflow strip under the top bar stays dark in both modes.
function chromeColors(primary: string, secondary: string) {
  const colors = darkColors(primary);
  return {
    chrome: colors.base,
    "chrome-line": colors.line,
    "chrome-text": colors.text,
    "chrome-dim": colors.dim,
    "chrome-signal": readableOn(secondary, colors.base),
  };
}

function brand(primary: string, chosenSecondary: string, page: string) {
  const dark = luminance(page) < 0.2;
  const boards = boardColors(primary, dark);
  // On a dark page a dark primary would disappear, so it is lifted until the
  // buttons stand out (3:1 for controls).
  const lifted = dark && contrast(primary, page) < 3 ? adjustUntil(primary, page, 3, "lighter") : primary;
  const surface = readableSurface(lifted);
  const secondary = readableSurface(chosenSecondary);
  const onPrimary = textOn(surface);
  return {
    primary: surface,
    "on-primary": onPrimary,
    // Secondary as text on the primary colour (active tab, urgent badge).
    "primary-accent": contrast(secondary, surface) >= 4.5 ? secondary : onPrimary,
    secondary,
    "on-secondary": textOn(secondary),
    // Secondary as text on the job tables (adjusted to stay readable there).
    signal: readableOn(secondary, boards.board),
    // Destination letters must read on both halves of the flap tile.
    "flap-text": readableOn(readableOn(secondary, boards["flap-top"]), boards["flap-bottom"]),
    ...boards,
    ...chromeColors(primary, secondary),
  };
}

function block(vars: Record<string, string>) {
  return Object.entries(vars)
    .map(([key, value]) => `--${key}:${value};`)
    .join("");
}

// CSS for the brand colours in both modes. Neutral light and dark colours
// live in globals.css; this only adds what depends on the chosen colours.
export function themeCss(appearance: Appearance) {
  const primary = isHex(appearance.primary) ? appearance.primary : DEFAULT_APPEARANCE.primary;
  const secondary = isHex(appearance.secondary) ? appearance.secondary : DEFAULT_APPEARANCE.secondary;
  const light = block(brand(primary, secondary, "#eef1f5"));
  const dark = block(brand(primary, secondary, DARK_PAGE));
  return `:root{${light}}html[data-theme="dark"]{${dark}}@media (prefers-color-scheme: dark){html[data-theme="system"]{${dark}}}`;
}
