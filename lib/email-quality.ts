const commonDomains = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
] as const;

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function suggestEmailCorrection(value: string) {
  const email = value.trim().toLowerCase();
  const separator = email.lastIndexOf("@");
  if (separator < 1 || separator === email.length - 1) return null;
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  if (commonDomains.includes(domain as (typeof commonDomains)[number])) return null;

  const sameSuffix = commonDomains.filter((candidate) => candidate.split(".").at(-1) === domain.split(".").at(-1));
  const candidates = sameSuffix.length ? sameSuffix : [...commonDomains];
  const ranked = candidates
    .map((candidate) => ({ candidate, distance: editDistance(domain, candidate) }))
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate));
  const best = ranked[0];
  if (!best || best.distance > 2) return null;
  return `${local}@${best.candidate}`;
}
