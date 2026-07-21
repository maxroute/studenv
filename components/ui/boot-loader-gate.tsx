"use client";

import { type ReactNode } from "react";

type BootLoaderGateProps = {
  children: ReactNode;
};

export function BootLoaderGate({ children }: BootLoaderGateProps) {
  return <>{children}</>;
}
