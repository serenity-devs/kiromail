export const uiThemeIds = [
  "kiro",
  "ocean",
  "lavender",
  "terracotta",
  "graphite",
] as const;

export type UiThemeId = (typeof uiThemeIds)[number];

export const defaultUiTheme: UiThemeId = "kiro";

export const uiThemes: ReadonlyArray<{
  id: UiThemeId;
  name: string;
  description: string;
  headingFont: string;
  bodyFont: string;
  colors: readonly [string, string, string, string];
}> = [
  {
    id: "kiro",
    name: "Kiro",
    description: "Verde bosque, arcilla y un aire editorial sereno.",
    headingFont: "Iowan Old Style",
    bodyFont: "Inter",
    colors: ["#315c5b", "#9d452d", "#f4f1eb", "#fffdf8"],
  },
  {
    id: "ocean",
    name: "Océano",
    description: "Azules profundos y turquesa con una lectura contemporánea.",
    headingFont: "Avenir Next",
    bodyFont: "Segoe UI",
    colors: ["#176b78", "#d06e43", "#edf3f5", "#fbfdfe"],
  },
  {
    id: "lavender",
    name: "Lavanda",
    description: "Violetas suaves, ciruela y una tipografía más elegante.",
    headingFont: "Baskerville",
    bodyFont: "Optima",
    colors: ["#665383", "#ad5975", "#f5f1f7", "#fffafd"],
  },
  {
    id: "terracotta",
    name: "Terracota",
    description: "Tonos cálidos, oliva y una personalidad artesanal.",
    headingFont: "Charter",
    bodyFont: "Gill Sans",
    colors: ["#5e6a4a", "#b65335", "#f6f0e8", "#fffaf4"],
  },
  {
    id: "graphite",
    name: "Grafito",
    description: "Grises nítidos y azul acero para una interfaz más técnica.",
    headingFont: "SF Pro Display",
    bodyFont: "Helvetica Neue",
    colors: ["#345d75", "#ba5752", "#f0f2f3", "#fcfdfd"],
  },
];

export function isUiThemeId(value: unknown): value is UiThemeId {
  return uiThemeIds.includes(value as UiThemeId);
}

export function normalizeUiTheme(value: unknown): UiThemeId {
  return isUiThemeId(value) ? value : defaultUiTheme;
}
