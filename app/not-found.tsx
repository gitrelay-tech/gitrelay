import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#fffdf8] px-4">
      <div className="relative">
        <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
        <div className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fff4da] px-10 py-8 text-center">
          <p className="text-6xl font-black tracking-tighter text-zinc-900">404</p>
          <p className="mt-2 text-lg font-semibold text-zinc-700">Page not found</p>
          <p className="mt-1 text-sm text-zinc-500">
            This page doesn&apos;t exist or the URL is wrong.
          </p>
        </div>
      </div>
      <Link
        href="/"
        className="text-sm font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-900"
      >
        Back to GitRelay
      </Link>
    </main>
  );
}
