"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page fails while rendering, instead of a blank "Application error" screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="simple-auth-page">
      <div className="simple-auth-card" role="alert">
        <div className="auth-title">
          Something went <em>wrong</em>
        </div>
        <p className="auth-sub">
          This page couldn&apos;t load. Try again, and if it keeps happening, reload the page.
        </p>
        <button className="btn-primary" type="button" onClick={reset}>
          Try again
        </button>
        <Link href="/dashboard">Go to your dashboard</Link>
      </div>
    </main>
  );
}
