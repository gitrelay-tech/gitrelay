import type { Metadata } from "next";
import { ReversePromptHome } from "@/components/reverse-prompt-home";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  title: "GitRelay",
  description:
    "Steal any code and make it your own. Paste a GitHub URL and get a plain-language coding agent prompt you can build from.",
  alternates: { canonical: "https://gitrelay.xyz" },
  openGraph: {
    title: "GitRelay",
    description:
      "Steal any code and make it your own. Paste a GitHub URL and get a plain-language coding agent prompt you can build from.",
    url: "https://gitrelay.xyz",
  },
  twitter: {
    title: "GitRelay",
    description:
      "Steal any code and make it your own. Paste a GitHub URL and get a plain-language coding agent prompt you can build from.",
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "GitRelay",
  url: "https://gitrelay.xyz",
  description:
    "Reverse engineer any GitHub repository into a plain-language coding agent prompt you can build from.",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://gitrelay.xyz/{owner}/{repo}",
    },
    "query-input": "required name=owner",
  },
};

export default function Home() {
  return (
    <>
      <JsonLd data={websiteJsonLd} />
      <ReversePromptHome isHome />
    </>
  );
}
