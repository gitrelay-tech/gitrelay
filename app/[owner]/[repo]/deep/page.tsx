import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { connection } from "next/server";
import { ReversePromptHome } from "@/components/reverse-prompt-home";
import { DEEP_REVERSE_FOCUS, focusFingerprint } from "@/lib/focus-fingerprint";
import { isValidGitHubRepoPath, normalizeRepoSegment } from "@/lib/parse-github-repo";
import { getSupabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{ owner: string; repo: string }>;
};

const getDeepCachedPrompt = cache(async (owner: string, repoNorm: string) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const fp = focusFingerprint(DEEP_REVERSE_FOCUS);
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
  const { owner: ownerRaw, repo: repoRaw } = await params;
  const owner = decodeURIComponent(ownerRaw);
  const repoNorm = normalizeRepoSegment(decodeURIComponent(repoRaw));

  const data = await getDeepCachedPrompt(owner, repoNorm);
  const pageTitle = `Deep reverse — ${owner}/${repoNorm}`;
  const pageDesc = data?.prompt
    ? (data.prompt as string).slice(0, 160).trimEnd() + "…"
    : `Deep reverse-engineered coding agent prompt for ${owner}/${repoNorm}.`;
  const url = `https://gitrelay.xyz/${owner}/${repoNorm}/deep`;

  return {
    title: pageTitle,
    description: pageDesc,
    alternates: { canonical: url },
    openGraph: { title: pageTitle, description: pageDesc, url, type: "article" },
    twitter: { title: pageTitle, description: pageDesc },
  };
}

export default async function RepoDeepPage({ params }: PageProps) {
  await connection();
  const { owner: ownerRaw, repo: repoRaw } = await params;
  const owner = decodeURIComponent(ownerRaw);
  const repo = decodeURIComponent(repoRaw);

  if (!isValidGitHubRepoPath(owner, repo)) {
    notFound();
  }

  const repoNorm = normalizeRepoSegment(repo);
  const initialRepoInput = `${owner}/${repoNorm}`;

  const data = await getDeepCachedPrompt(owner, repoNorm);
  const cachedPrompt = data?.prompt ? (data.prompt as string) : undefined;

  return (
    <ReversePromptHome
      initialRepoInput={initialRepoInput}
      autoSubmit={false}
      autoSubmitDeep={!cachedPrompt}
      initialPrompt={cachedPrompt}
      owner={owner}
      repo={repoNorm}
      preserveUrl
      initialGenerationKind={cachedPrompt ? "deep" : undefined}
    />
  );
}
