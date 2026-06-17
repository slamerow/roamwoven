export const THEME_DIRECTIONS = [
  {
    key: "modern_futuristic",
    name: "Modern / Futuristic",
    description: "Crisp, precise, and high-contrast.",
    surface: "#f5f7f4",
    text: "#15191d",
  },
  {
    key: "rustic_adventure",
    name: "Rustic / Adventure",
    description: "Grounded, outdoorsy, and close to the current reference app.",
    surface: "#faf8f2",
    text: "#20211f",
  },
  {
    key: "whimsical_fantasy",
    name: "Whimsical / Fantasy",
    description: "Storybook, soft, and playful without getting childish.",
    surface: "#fbf3df",
    text: "#292432",
  },
] as const;

export type ThemeDirectionKey = (typeof THEME_DIRECTIONS)[number]["key"];

export type TripStyleSettings = {
  appName: string;
  primaryColor: string;
  themeDirection: ThemeDirectionKey;
  updatedAt: string | null;
};

export const DEFAULT_PRIMARY_COLOR = "#526247";
export const DEFAULT_THEME_DIRECTION: ThemeDirectionKey = "rustic_adventure";

export function isThemeDirectionKey(value: string): value is ThemeDirectionKey {
  return THEME_DIRECTIONS.some((theme) => theme.key === value);
}

export function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) =>
      Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")
    )
    .join("")}`;
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue =
    max === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;

  return { h: hue * 60, s: saturation, l: lightness };
}

function hslToHex(h: number, s: number, l: number) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const match = l - chroma / 2;
  const [red, green, blue] =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return rgbToHex(
    Math.round((red + match) * 255),
    Math.round((green + match) * 255),
    Math.round((blue + match) * 255)
  );
}

export function derivePalette(primary: string) {
  const { h, s } = rgbToHsl(hexToRgb(primary));
  const secondaryHue = (h + 35) % 360;
  const accentHue = (h + 180) % 360;

  return {
    primary,
    secondary: hslToHex(secondaryHue, Math.min(0.42, s * 0.72 + 0.08), 0.42),
    accent: hslToHex(accentHue, Math.min(0.5, s * 0.8 + 0.12), 0.56),
    soft: hslToHex(h, Math.min(0.22, s * 0.35), 0.94),
  };
}

export function getThemeDirection(key: ThemeDirectionKey) {
  return (
    THEME_DIRECTIONS.find((theme) => theme.key === key) ??
    THEME_DIRECTIONS.find((theme) => theme.key === DEFAULT_THEME_DIRECTION) ??
    THEME_DIRECTIONS[0]
  );
}
