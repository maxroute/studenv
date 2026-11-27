/** The browser tab's name while a focus session is on, so the time shows from other tabs. */
export function sessionTitle(label: string, clock: string, paused: boolean): string {
  // The time comes first: tabs cut long names off from the end.
  return paused ? `Paused ${clock} · ${label}` : `${clock} · ${label}`;
}
