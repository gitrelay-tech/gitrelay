export const GITREVERSE_HISTORY_KEY = "gitrelay_history";
export const GITREVERSE_HISTORY_MAX = 20;
export const HISTORY_PROMPT_PREVIEW_LEN = 160;

export type HistoryGenerationType = "quick" | "deep" | "manual";

export type HistoryEntry = {
  owner: string;
  repo: string;
  visitedAt: string;
  /** `quick`, `deep`, or `m:${focus}`; omitted in older rows (= quick). */
  historySlot?: string;
  promptPreview?: string;
  lastGenerationType?: HistoryGenerationType;
  lastManualFocus?: string;
};

export function historySlotOf(e: { historySlot?: string }): string {
  return e.historySlot ?? "quick";
}

export function historyPromptPreview(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= HISTORY_PROMPT_PREVIEW_LEN) return t;
  return `${t.slice(0, HISTORY_PROMPT_PREVIEW_LEN).trimEnd()}…`;
}

export function isHistoryEntry(x: unknown): x is HistoryEntry {
  if (
    typeof x !== "object" ||
    x === null ||
    typeof (x as HistoryEntry).owner !== "string" ||
    typeof (x as HistoryEntry).repo !== "string" ||
    typeof (x as HistoryEntry).visitedAt !== "string"
  ) {
    return false;
  }
  const pv = (x as HistoryEntry).promptPreview;
  if (pv !== undefined && typeof pv !== "string") return false;
  const gt = (x as HistoryEntry).lastGenerationType;
  if (
    gt !== undefined &&
    gt !== "quick" &&
    gt !== "deep" &&
    gt !== "manual"
  ) {
    return false;
  }
  const mf = (x as HistoryEntry).lastManualFocus;
  if (mf !== undefined && typeof mf !== "string") return false;
  const hs = (x as HistoryEntry).historySlot;
  return hs === undefined || typeof hs === "string";
}

export function readLocalHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GITREVERSE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry);
  } catch {
    return [];
  }
}

export function writeLocalHistory(entries: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      GITREVERSE_HISTORY_KEY,
      JSON.stringify(entries.slice(0, GITREVERSE_HISTORY_MAX))
    );
  } catch {
    /* storage unavailable */
  }
}

export function sortHistoryEntries(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort(
    (a, b) =>
      new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime()
  );
}

export async function fetchUserHistory(
  accessToken: string
): Promise<HistoryEntry[]> {
  const res = await fetch("/api/user-history", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { entries?: unknown };
  if (!Array.isArray(data.entries)) return [];
  return data.entries.filter(isHistoryEntry);
}

export async function syncHistoryEntry(
  accessToken: string,
  entry: HistoryEntry
): Promise<void> {
  await fetch("/api/user-history", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry),
  });
}

export async function migrateLocalHistoryToServer(
  accessToken: string
): Promise<void> {
  const local = readLocalHistory();
  if (local.length === 0) return;
  await Promise.all(
    local.map((entry) => syncHistoryEntry(accessToken, entry).catch(() => {}))
  );
}
