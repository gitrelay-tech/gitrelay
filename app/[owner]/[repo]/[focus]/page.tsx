import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { connection } from "next/server";
import { ReversePromptHome } from "@/components/reverse-prompt-home";
import { focusFingerprint } from "@/lib/focus-fingerprint";
import { isValidGitHubRepoPath, normalizeRepoSegment } from "@/lib/parse-github-repo";
import { getSupabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{ owner: string; repo: string; focus: string }>;
};

function decodeFocus(raw: string): string | null {
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return null;
  }
}

const getFocusCachedPrompt = cache(async (owner: string, repoNorm: string, fp: string) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data } = await supabase
      .from("custom_prompt_cache")
      .select("prompt")
      .eq("owner", owner)
      .eq("repo", repoNorm)
      .eq("focus_fingerprint", fp)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { owner: ownerRaw, repo: repoRaw, focus: focusRaw } = await params;
  const owner = decodeURIComponent(ownerRaw);
  const repoNorm = normalizeRepoSegment(decodeURIComponent(repoRaw));
  const trimmedFocus = decodeFocus(focusRaw);

  const pageTitle = trimmedFocus
    ? `${trimmedFocus} — ${owner}/${repoNorm}`
    : `${owner}/${repoNorm}`;
  const fp = focusFingerprint(trimmedFocus ?? "");
  const data = trimmedFocus ? await getFocusCachedPrompt(owner, repoNorm, fp) : null;
  const pageDesc = data?.prompt
    ? (data.prompt as string).slice(0, 160).trimEnd() + "…"
    : trimmedFocus
      ? `Focused reverse-engineered prompt for "${trimmedFocus}" in ${owner}/${repoNorm}.`
      : `Reverse-engineered coding agent prompt for ${owner}/${repoNorm}.`;
  const url = `https://gitrelay.xyz/${owner}/${repoNorm}/${encodeURIComponent(trimmedFocus ?? "")}`;

  return {
    title: pageTitle,
    description: pageDesc,
    alternates: { canonical: url },
    openGraph: { title: pageTitle, description: pageDesc, url, type: "article" },
    twitter: { title: pageTitle, description: pageDesc },
  };
}

export default async function RepoFocusPage({ params }: PageProps) {
  await connection();
  const { owner: ownerRaw, repo: repoRaw, focus: focusRaw } = await params;
  const owner = decodeURIComponent(ownerRaw);
  const repo = decodeURIComponent(repoRaw);
  const trimmedFocus = decodeFocus(focusRaw);

  if (!trimmedFocus || !isValidGitHubRepoPath(owner, repo)) {
    notFound();
  }

  const repoNorm = normalizeRepoSegment(repo);
  const initialRepoInput = `${owner}/${repoNorm}`;
  const fp = focusFingerprint(trimmedFocus);

  const data = await getFocusCachedPrompt(owner, repoNorm, fp);
  const cachedPrompt = data?.prompt ? (data.prompt as string) : undefined;

  return (
    <ReversePromptHome
      initialRepoInput={initialRepoInput}
      autoSubmit={false}
      autoSubmitFocus={cachedPrompt ? undefined : trimmedFocus}
      initialPrompt={cachedPrompt}
      owner={owner}
      repo={repoNorm}
      preserveUrl
      initialGenerationKind={cachedPrompt ? "manual" : undefined}
      initialManualFocus={cachedPrompt ? trimmedFocus : undefined}
    />
  );
}
