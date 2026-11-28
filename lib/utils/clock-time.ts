/** A stored "HH:mm" time as a 12-hour clock: "19:05" is "7:05 PM". Anything else is returned as it was. */
export function to12Hour(time: string): string {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return time;
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}
