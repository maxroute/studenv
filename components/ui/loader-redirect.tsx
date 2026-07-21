"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SecondBrainLoader } from "@/components/ui/second-brain-loader";

type LoaderRedirectProps = {
  delayMs?: number;
  href: string;
};

export function LoaderRedirect({ delayMs = 4200, href }: LoaderRedirectProps) {
  const router = useRouter();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      router.replace(href);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, href, router]);

  return <SecondBrainLoader />;
}
