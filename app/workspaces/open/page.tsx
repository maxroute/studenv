"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

function getWorkspacePreloadKey(workspaceId: string) {
  return `workspace-preload:${workspaceId}`;
}

function advanceProgress(
  setProgress: React.Dispatch<React.SetStateAction<number>>,
  nextValue: number,
) {
  setProgress((current) => Math.max(current, nextValue));
}

export default function OpenWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemId = searchParams.get("itemId");
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    if (error) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 90) {
          return current;
        }

        if (current < 35) {
          return current + 7;
        }

        if (current < 65) {
          return current + 4;
        }

        return current + 2;
      });
    }, 450);

    return () => window.clearInterval(timer);
  }, [error, retryNonce]);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;

    if (!itemId) {
      router.replace("/workspaces");
      return;
    }

    let active = true;

    const openWorkspace = async () => {
      try {
        setError(null);
        advanceProgress(setProgress, 16);
        const res = await fetch(`/api/items/${itemId}/workspace`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.workspaceId) {
          throw new Error(data.error || "Failed to open workspace");
        }

        if (!active) {
          return;
        }

        advanceProgress(setProgress, 68);

        const workspaceResponse = await fetch(`/api/workspace/${data.workspaceId}`);
        if (!workspaceResponse.ok) {
          throw new Error("Failed to preload workspace");
        }

        const workspaceData = await workspaceResponse.json();

        if (!active) {
          return;
        }

        try {
          window.sessionStorage.setItem(
            getWorkspacePreloadKey(data.workspaceId),
            JSON.stringify(workspaceData),
          );
        } catch (storageError) {
          console.warn("Failed to cache workspace preload", storageError);
        }

        advanceProgress(setProgress, 88);
        await import("@/components/workspace/canvas");

        if (!active) {
          return;
        }

        advanceProgress(setProgress, 100);

        const nextUrl = data.assetId
          ? `/workspaces/${data.workspaceId}?assetId=${data.assetId}`
          : `/workspaces/${data.workspaceId}`;

        router.replace(nextUrl);
      } catch (err) {
        if (!active) {
          return;
        }

        setError(err instanceof Error ? err.message : "Failed to open workspace");
        setProgress(0);
        startedRef.current = false;
      }
    };

    void openWorkspace();

    return () => {
      active = false;
    };
  }, [itemId, retryNonce, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0e0e0b] px-6 text-[#e4dfcf]">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#141410] p-8 shadow-2xl">
        <div className="mb-5 flex items-center gap-3 text-[#c97d0c]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium uppercase tracking-[0.16em]">
            Opening Workspace
          </span>
        </div>

        <h1 className="font-fraunces text-3xl font-semibold tracking-[-0.04em] text-[#e4dfcf]">
          Getting your studio ready.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#9c9788]">
          We are preparing the workspace and moving your item into view.
        </p>

        {error ? (
          <div className="mt-6 rounded-xl border border-[#e05a4b]/35 bg-[#e05a4b]/10 p-4">
            <div className="text-sm font-medium text-[#f2c5be]">{error}</div>
            <div className="mt-4 flex gap-3">
              <button
                className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-[#e4dfcf] transition hover:border-white/[0.16] hover:bg-white/[0.03]"
                type="button"
                onClick={() => {
                  startedRef.current = false;
                  setError(null);
                  setProgress(8);
                  setRetryNonce((value) => value + 1);
                }}
              >
                Try again
              </button>
              <button
                className="rounded-lg px-4 py-2 text-sm text-[#9c9788] transition hover:text-[#e4dfcf]"
                type="button"
                onClick={() => router.push("/shelf")}
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to shelf
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-[#9c9788]">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div
              aria-label="Workspace opening progress"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progress}
              className="h-2 overflow-hidden rounded-full bg-white/[0.06]"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-[#c97d0c] transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
