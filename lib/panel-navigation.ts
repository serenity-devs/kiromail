export const panelSectionPaths = {
  dashboard: "/",
  contacts: "/suscriptores",
  audiences: "/audiencias",
  templates: "/plantillas",
  transactional: "/transaccionales",
  campaigns: "/campanas",
  reports: "/informes",
  deliverability: "/entregabilidad",
  operations: "/operaciones",
  settings: "/ajustes",
} as const;

export type PanelSection = keyof typeof panelSectionPaths;

const sectionBySlug = new Map(
  Object.entries(panelSectionPaths)
    .filter(([, path]) => path !== "/")
    .map(([section, path]) => [path.slice(1), section as PanelSection]),
);

export function panelPath(section: PanelSection) {
  return panelSectionPaths[section];
}

export function panelSectionFromSlug(slug: string) {
  return sectionBySlug.get(slug) ?? null;
}

export function panelSectionFromPathname(pathname: string) {
  const normalized = `/${pathname.split("?")[0].split("#")[0]}`
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "") || "/";
  if (normalized === "/") return "dashboard" as const;
  const parts = normalized.slice(1).split("/");
  return parts.length === 1 ? panelSectionFromSlug(parts[0]) : null;
}
