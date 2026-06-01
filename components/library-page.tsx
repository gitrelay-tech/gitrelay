"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";

type PromptEntry = {
  id: number;
  owner: string;
  repo: string;
  prompt: string;
  cached_at: string;
  views?: number;
  title?: string | null;
  relevance_score?: number;
};

type SortOption = "trending" | "newest" | "oldest";

const SORT_OPTIONS: SortOption[] = ["newest", "trending", "oldest"];

const SORT_LABELS: Record<SortOption, string> = {
  trending: "Trending",
  newest: "Newest",
  oldest: "Oldest",
};

const PAGE_SIZE = 24;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

type LibraryPageProps = {
  initialData: PromptEntry[];
  initialTotal: number;
};

export function LibraryPage({ initialData, initialTotal }: LibraryPageProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [entries, setEntries] = useState<PromptEntry[]>(initialData);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialFetchDone, setInitialFetchDone] = useState(initialData.length > 0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const fetchPage = useCallback(
    async (
      searchVal: string,
      sortVal: SortOption,
      pageVal: number,
      append: boolean
    ) => {
      const params = new URLSearchParams({
        search: searchVal,
        sort: sortVal,
        page: String(pageVal),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/library?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        data: PromptEntry[];
        total: number;
      };
      if (append) {
        setEntries((prev) => [...prev, ...json.data]);
      } else {
        setEntries(json.data);
      }
      setTotal(json.total);
      setPage(pageVal);
    },
    []
  );

  // Debounce search + sort changes (skip very first render — SSR data is fresh)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      startTransition(() => {
        void fetchPage(search, sort, 0, false);
      });
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search, sort, fetchPage]);

  // Re-sync after mount so view counts (and other fields) are not stale from
  // RSC/router cache when returning from a repo page.
  useEffect(() => {
    startTransition(() => {
      void fetchPage("", "newest", 0, false).then(() => {
        setInitialFetchDone(true);
      });
    });
  }, [fetchPage]);

  async function handleLoadMore() {
    setLoadingMore(true);
    await fetchPage(search, sort, page + 1, true);
    setLoadingMore(false);
  }

  const hasMore = entries.length < total;

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <Navbar />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="group relative inline-block">
            <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg bg-zinc-900" />
            <div className="relative z-10 rounded-lg border-[3px] border-zinc-900 bg-[#d31611] px-4 py-1">
              <span className="text-sm font-bold text-white">
                {total.toLocaleString()}+ prompts
              </span>
            </div>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tighter sm:text-6xl">
            Prompt Library
          </h1>
          <p className="max-w-lg text-lg text-zinc-600">
            Reverse-engineered prompts from real GitHub repositories.
          </p>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Search */}
          <div className="relative flex-1">
            <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-900" />
            <div className="relative z-10 flex items-center rounded-lg border-[3px] border-zinc-900 bg-white">
              <svg
                className="ml-4 h-4 w-4 shrink-0 text-zinc-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z"
                />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompts…"
                className="w-full bg-transparent px-3 py-3 text-base text-zinc-900 placeholder-zinc-500 focus:outline-none"
              />
              {isPending && (
                <svg
                  className="mr-3 h-4 w-4 shrink-0 animate-spin text-zinc-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
            </div>
          </div>

          {/* Sort — only when browsing, not searching */}
          {!search.trim() ? (
            <div className="relative shrink-0">
              <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-900" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="relative z-10 w-full cursor-pointer appearance-none rounded-lg border-[3px] border-zinc-900 bg-[#fff4da] px-4 py-3 pr-10 text-sm font-semibold text-zinc-900 focus:outline-none sm:w-auto"
              >
                {SORT_OPTIONS.map((val) => (
                  <option key={val} value={val}>
                    {SORT_LABELS[val]}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 z-20 h-4 w-4 -translate-y-1/2 text-zinc-700"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </div>
          ) : (
            <div className="relative shrink-0">
              <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-900" />
              <div className="relative z-10 rounded-lg border-[3px] border-zinc-900 bg-[#fff4da] px-4 py-3 text-sm font-semibold text-zinc-900 sm:w-auto">
                Sorted by relevance
              </div>
            </div>
          )}
        </div>

        {/* Count line */}
        {search ? (
          <p className="text-sm text-zinc-500">
            <span className="font-semibold text-zinc-900">
              {total.toLocaleString()}
            </span>{" "}
            result{total !== 1 ? "s" : ""}
          </p>
        ) : null}

        {/* Card grid */}
        {entries.length === 0 ? (
          !initialFetchDone ? (
            <SkeletonGrid />
          ) : (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <span className="text-4xl">∅</span>
              <p className="text-lg font-semibold text-zinc-700">No prompts found</p>
              <p className="text-zinc-500">Try a different search term.</p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <PromptCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 rounded-lg border-[3px] border-zinc-900 bg-[#fff4da] px-8 py-3 font-semibold text-zinc-900 hover:bg-[#ffc480] transition-colors disabled:pointer-events-none disabled:opacity-60"
            >
              {loadingMore ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Loading…
                </>
              ) : (
                <>Load {Math.min(PAGE_SIZE, total - entries.length)} more ↓</>
              )}
            </button>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500">
        <div className="mx-auto flex max-w-4xl justify-center px-4 sm:px-6">
          <a
            href="https://x.com/GitRelay"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-2 transition-colors hover:text-zinc-900"
          >
            X
          </a>
        </div>
      </footer>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="relative block">
          <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl bg-zinc-900/20" />
          <div className="relative z-10 flex animate-pulse flex-col gap-3 rounded-xl border-[3px] border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-4/5 rounded bg-zinc-200" />
                <div className="h-4 w-3/5 rounded bg-zinc-100" />
              </div>
              <div className="h-6 w-6 shrink-0 rounded bg-zinc-100" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-zinc-100" />
              <div className="h-3 w-full rounded bg-zinc-100" />
              <div className="h-3 w-2/3 rounded bg-zinc-100" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-5 w-14 rounded bg-zinc-100" />
              <div className="h-5 w-20 rounded bg-zinc-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PromptCard({ entry }: { entry: PromptEntry }) {
  const href = `/${encodeURIComponent(entry.owner)}/${encodeURIComponent(entry.repo)}`;
  const displayTitle = entry.title?.trim() || entry.repo;
  const truncated =
    entry.prompt.length > 160
      ? entry.prompt.slice(0, 160).trimEnd() + "…"
      : entry.prompt;

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block cursor-pointer"
      aria-label={displayTitle}
    >
      <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl bg-zinc-900 transition-transform group-hover:translate-x-2 group-hover:translate-y-2" />
      <div className="relative z-10 flex h-full flex-col gap-3 rounded-xl border-[3px] border-zinc-900 bg-white p-4 transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5">
        {/* Header */}
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-zinc-900">
          {displayTitle}
        </h3>

        {/* Prompt preview */}
        <p className="flex-1 text-sm leading-relaxed text-zinc-600">{truncated}</p>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2">
          <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-500">
            {relativeTime(entry.cached_at)}
          </span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-500">
              <svg
                className="h-3.5 w-3.5 shrink-0 text-zinc-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {(entry.views ?? 0).toLocaleString()}{" "}
              {(entry.views ?? 0) === 1 ? "view" : "views"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
