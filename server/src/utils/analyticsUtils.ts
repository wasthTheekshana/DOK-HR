// Local-date helpers. toISOString() is UTC — on UTC+5:30 servers it shifts
// local dates back a day (e.g. June 1 00:00 local → "May 31"), so date
// defaults must be built from local date parts.
export function toLocalDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function localToday(): string {
    return toLocalDateStr(new Date());
}

export function firstOfCurrentMonth(): string {
    const now = new Date();
    return toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function firstOfMonthsAgo(monthsAgo: number): string {
    const now = new Date();
    return toLocalDateStr(new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1));
}

export function computeWorkingDays(from: string, to: string): number {
    const msPerDay = 86_400_000;
    const daysInRange = Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay) + 1;
    return Math.max(1, Math.round(daysInRange * 22 / 30));
}
