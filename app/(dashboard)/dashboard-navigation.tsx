"use client";

import React from "react";
import { usePathname } from "next/navigation";

type DashboardNavigationContextValue = {
  pendingHref: string | null;
  beginNavigation: (href: string) => void;
};

const DashboardNavigationContext =
  React.createContext<DashboardNavigationContextValue | null>(null);

export function DashboardNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const beginNavigation = React.useCallback(
    (href: string) => {
      if (href !== pathname) {
        setPendingHref(href);
      }
    },
    [pathname],
  );

  return (
    <DashboardNavigationContext.Provider value={{ pendingHref, beginNavigation }}>
      {children}
    </DashboardNavigationContext.Provider>
  );
}

export function useDashboardNavigation() {
  const value = React.useContext(DashboardNavigationContext);

  if (!value) {
    return {
      pendingHref: null,
      beginNavigation: () => undefined,
    };
  }

  return value;
}
