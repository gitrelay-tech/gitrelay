import type { Metadata } from "next";
import { HistoryPage } from "@/components/history-page";

export const metadata: Metadata = {
  title: "History",
  description: "Repositories you recently viewed on GitRelay.",
  robots: { index: false, follow: false },
};

export default function HistoryRoute() {
  return <HistoryPage />;
}
