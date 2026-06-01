import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { connection } from "next/server";
import { ReversePromptHome } from "@/components/reverse-prompt-home";
import { JsonLd } from "@/components/json-ld";
import { isValidGitHubRepoPath, normalizeRepoSegment } from "@/lib/parse-github-repo";
import { getSupabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{ owner: string; repo: string }>;
};

const getCachedEntry = cache(async (owner: string, repoNorm: string) => {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data } = await supabase
      .from("prompt_cache")
      .select("prompt, title")
      .eq("owner", owner)
      .eq("repo", repoNorm)
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

  const data = await getCachedEntry(owner, repoNorm);
  const pageTitle = (data?.title as string | null | undefined)?.trim() || `${owner}/${repoNorm}`;
  const pageDesc = data?.prompt
    ? (data.prompt as string).slice(0, 160).trimEnd() + "…"
    : `Reverse-engineered coding agent prompt for the ${owner}/${repoNorm} GitHub repository.`;
  const url = `https://gitrelay.xyz/${owner}/${repoNorm}`;

  return {
    title: pageTitle,
    description: pageDesc,
    alternates: { canonical: url },
    openGraph: {
      title: pageTitle,
      description: pageDesc,
      url,
      type: "article",
    },
    twitter: {
      title: pageTitle,
      description: pageDesc,
    },
  };
}

export default async function RepoPage({ params }: PageProps) {
  await connection();
  const { owner: ownerRaw, repo: repoRaw } = await params;
  const owner = decodeURIComponent(ownerRaw);
  const repo = decodeURIComponent(repoRaw);

  if (!isValidGitHubRepoPath(owner, repo)) {
    notFound();
  }

  const repoNorm = normalizeRepoSegment(repo);
  const initialRepoInput = `${owner}/${repoNorm}`;

  const data = await getCachedEntry(owner, repoNorm);
  const cachedPrompt = data?.prompt ? (data.prompt as string) : undefined;
  const pageTitle = (data?.title as string | null | undefined)?.trim() || `${owner}/${repoNorm}`;
  const pageDesc = cachedPrompt
    ? cachedPrompt.slice(0, 160).trimEnd() + "…"
    : `Reverse-engineered coding agent prompt for the ${owner}/${repoNorm} GitHub repository.`;
  const url = `https://gitrelay.xyz/${owner}/${repoNorm}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: pageTitle,
    description: pageDesc,
    url,
    publisher: {
      "@type": "Organization",
      name: "GitRelay",
      url: "https://gitrelay.xyz",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
  };

  return (
    <>
      <JsonLd data={articleJsonLd} />
      <ReversePromptHome
        initialRepoInput={initialRepoInput}
        autoSubmit={!cachedPrompt}
        initialPrompt={cachedPrompt}
        owner={owner}
        repo={repoNorm}
        initialGenerationKind={cachedPrompt ? "quick" : undefined}
      />
    </>
  );
}
