import type { Metadata } from "next";
import { PremiumPage } from "@/components/premium-page";

export const metadata: Metadata = {
  title: "Premium",
  description:
    "Unlimited deep reverse, unlimited manual control, and no monthly limits for $9/mo.",
  alternates: { canonical: "https://gitrelay.xyz/premium" },
  openGraph: {
    title: "Premium",
    description:
      "Unlimited deep reverse, unlimited manual control, and no monthly limits for $9/mo.",
    url: "https://gitrelay.xyz/premium",
    type: "website",
  },
  twitter: {
    title: "Premium",
    description:
      "Unlimited deep reverse, unlimited manual control, and no monthly limits for $9/mo.",
  },
};

export default function PremiumRoute() {
  return <PremiumPage />;
}
