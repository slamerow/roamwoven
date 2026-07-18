export type DraftObject = Record<string, unknown>;

export function asDraftObject(value: unknown): DraftObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DraftObject)
    : {};
}

export function getObject(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const child = (value as DraftObject)[key];
  return child && typeof child === "object" && !Array.isArray(child)
    ? (child as DraftObject)
    : null;
}

export function getArray(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const child = (value as DraftObject)[key];
  return Array.isArray(child) ? child : [];
}

export function getString(value: DraftObject | null, key: string) {
  const child = value?.[key];
  return typeof child === "string" && child.trim() ? child.trim() : null;
}

export function getStringFromKeys(value: DraftObject | null, keys: string[]) {
  for (const key of keys) {
    const child = getString(value, key);

    if (child) {
      return child;
    }
  }

  return null;
}
