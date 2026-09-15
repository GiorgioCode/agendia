export function todayIn(
  timezone = "America/Argentina/Buenos_Aires",
  now = new Date(),
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function localNow(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
export function isFuture(date: string, time: string, timezone: string) {
  return `${date}T${time}` > localNow(timezone);
}
export function displayDate(date: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
export function shiftMonth(month: string, delta: number) {
  const d = new Date(month + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + delta, 1);
  return d.toISOString().slice(0, 10);
}
export function monthCells(month: string): (string | null)[] {
  const d = new Date(month + "T12:00:00Z");
  const y = d.getUTCFullYear(),
    m = d.getUTCMonth();
  const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  return [
    ...Array(offset).fill(null),
    ...Array.from(
      { length: count },
      (_, i) => `${month.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];
}
export const timeLabel = (time: string) => time.slice(0, 5);
