"use client";

import { useEffect, useState } from "react";
import { PublicIntro } from "./app-intro";
import styles from "./installed-app-intro.module.css";

/** True in the desktop app, and when opened from an installed icon on a phone. */
function isInstalledApp(): boolean {
  const iosHomeScreen = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(window.studenvDesktop) || iosHomeScreen || window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * The opening intro on the sign-in page, for the installed apps only: they open
 * here when signed out. In a browser tab the page shows straight away.
 */
export function InstalledAppIntro() {
  // Unknown until the page runs in the browser.
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    setInstalled(isInstalledApp());
  }, []);

  if (installed === null) return <div className={styles.cover} aria-hidden="true" />;
  return installed ? <PublicIntro /> : null;
}
