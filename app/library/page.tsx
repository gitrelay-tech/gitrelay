import type { Metadata } from "next";
import { connection } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { LibraryPage } from "@/components/library-page";
import { JsonLd } from "@/components/json-ld";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prompt Library",
  description:
    "Browse 1,000+ reverse-engineered prompts from real GitHub repositories. Find coding agent prompts for any open-source project.",
  alternates: { canonical: "https://gitrelay.xyz/library" },
  openGraph: {
    title: "Prompt Library",
    description:
      "Browse 1,000+ reverse-engineered prompts from real GitHub repositories. Find coding agent prompts for any open-source project.",
    url: "https://gitrelay.xyz/library",
    type: "website",
  },
  twitter: {
    title: "Prompt Library",
    description:
      "Browse 1,000+ reverse-engineered prompts from real GitHub repositories. Find coding agent prompts for any open-source project.",
  },
};

const INITIAL_LIMIT = 24;

export default async function LibraryRoute() {
  await connection();
  const supabase = getSupabase();

  let initialData: {
    id: number;
    owner: string;
    repo: string;
    prompt: string;
    cached_at: string;
    views?: number;
    title?: string | null;
  }[] = [];
  let initialTotal = 0;

  if (supabase) {
    const { data, count } = await supabase
      .from("prompt_cache")
      .select("id, owner, repo, prompt, cached_at, views, title", { count: "exact" })
      .order("cached_at", { ascending: false })
      .range(0, INITIAL_LIMIT - 1);

    initialData = (data ?? []) as typeof initialData;
    initialTotal = count ?? 0;
  }

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Prompt Library — GitRelay",
    description:
      "Browse reverse-engineered coding agent prompts from real GitHub repositories.",
    url: "https://gitrelay.xyz/library",
    numberOfItems: initialTotal,
    hasPart: initialData.slice(0, 10).map((entry) => ({
      "@type": "TechArticle",
      name: entry.title?.trim() || `${entry.owner}/${entry.repo}`,
      url: `https://gitrelay.xyz/${encodeURIComponent(entry.owner)}/${encodeURIComponent(entry.repo)}`,
    })),
  };

  return (
    <>
      <JsonLd data={collectionJsonLd} />
      <LibraryPage initialData={initialData} initialTotal={initialTotal} />
    </>
  );
}
