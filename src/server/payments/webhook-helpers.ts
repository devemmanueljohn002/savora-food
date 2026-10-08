export function extractDisputeReference(payload: Record<string, unknown>): string | null {
  function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  }
  function firstString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
  }

  const data = asRecord(payload.data);
  if (!data) return null;
  const transaction = asRecord(data.transaction);

  return (
    firstString(data.transaction_reference) ??
    firstString(data.reference) ??
    firstString(transaction?.reference) ??
    null
  );
}