export type BuildInfo = {
  version: string;
  commit: string;
  built_at: string;
};

export const buildInfo: BuildInfo = {
  version: process.env.NEXT_PUBLIC_KIROMAIL_VERSION?.trim() || "desarrollo",
  commit: process.env.NEXT_PUBLIC_KIROMAIL_COMMIT?.trim() || "local",
  built_at: process.env.NEXT_PUBLIC_KIROMAIL_BUILD_DATE?.trim() || "",
};

export function shortBuildCommit(commit: string) {
  return /^[0-9a-f]{7,40}$/i.test(commit) ? commit.slice(0, 7) : commit;
}

export function formatBuildDate(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "compilación local";
  return `${new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date)} UTC`;
}
