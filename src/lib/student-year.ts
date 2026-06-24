export function parseStudentYear(raw: unknown): { value: number | undefined; error: string | null } {
  if (raw === undefined || raw === null || raw === "") {
    return { value: undefined, error: null };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (n !== 1 && n !== 2) {
    return { value: undefined, error: "Year must be 1 or 2" };
  }
  return { value: n, error: null };
}
