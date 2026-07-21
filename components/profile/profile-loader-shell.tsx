"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SecondBrainLoader } from "@/components/ui/second-brain-loader";

type ProfileLoaderShellProps = {
  children: ReactNode;
};

export function ProfileLoaderShell({ children }: ProfileLoaderShellProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsReady(true);
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <>
      <div className={`route-loader-content ${isReady ? "ready" : "loading"}`}>
        {children}
      </div>

      {!isReady ? (
        <div className="route-loader-overlay profile-logo">
          <SecondBrainLoader variant="logo" />
        </div>
      ) : null}
    </>
  );
}
