/**
 * Pull a city-ish label out of a Google-formatted address string.
 *
 * Google's `formatted_address` is typically comma-separated with the city
 * sitting as the second-to-last component — e.g. `"Rua Augusta 100, 1100-053
 * Lisboa, Portugal"` → `"Lisboa"`. We strip a leading postal code if present.
 *
 * Intentionally heuristic: "good enough" for a vanity share card without a
 * Places Details round-trip. Returns null for addresses we can't parse,
 * which the caller should render as "Unknown" or hide entirely.
 */
export function extractCity(address: string | undefined | null): string | null {
  if (!address) return null;
  const parts = address
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const candidate = parts.length >= 2 ? parts[parts.length - 2] : parts[parts.length - 1];
  // Strip a leading postal code: "1100-053 Lisboa" → "Lisboa", "94103 San Francisco" → "San Francisco".
  const stripped = candidate.replace(/^[A-Z]?\d{3,}[-\s]?\d*\s+/, '').trim();
  return stripped || candidate || null;
}
