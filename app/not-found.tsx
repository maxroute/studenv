import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found — Studenv",
  robots: { index: false },
};

/** Shown for any URL without a page, and wherever a page calls notFound(). */
export default function NotFound() {
  return (
    <main className="simple-auth-page">
      <div className="simple-auth-card">
        <div className="auth-title">
          Page not <em>found</em>
        </div>
        <p className="auth-sub">
          This page doesn&apos;t exist or has moved. Check the address, or head back to somewhere familiar.
        </p>
        <Link
          className="btn-primary"
          href="/dashboard"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}
        >
          Go to your dashboard
        </Link>
        <Link href="/">Back to the home page</Link>
      </div>
    </main>
  );
}
