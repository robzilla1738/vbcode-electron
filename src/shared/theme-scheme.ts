import type { Palette } from "./themes";

function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 0;
  const channels = match[1]!.match(/.{2}/g)!.map((part) => {
    const value = Number.parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function paletteColorScheme(palette: Palette): "light" | "dark" {
  return relativeLuminance(palette.background) > 0.45 ? "light" : "dark";
}
