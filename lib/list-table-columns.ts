export const subscriberTableColumnIds = [
  "phone",
  "language",
  "timezone",
  "city",
  "country",
] as const;

export type SubscriberTableColumn = (typeof subscriberTableColumnIds)[number];

export const defaultSubscriberTableColumns: SubscriberTableColumn[] = [
  ...subscriberTableColumnIds,
];

export function normalizeSubscriberTableColumns(
  value: unknown,
): SubscriberTableColumn[] {
  if (!Array.isArray(value)) return [...defaultSubscriberTableColumns];
  const allowed = new Set<string>(subscriberTableColumnIds);
  return [
    ...new Set(
      value.filter(
        (column): column is SubscriberTableColumn =>
          typeof column === "string" && allowed.has(column),
      ),
    ),
  ];
}
