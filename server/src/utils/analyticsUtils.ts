export function computeWorkingDays(from: string, to: string): number {
    const msPerDay = 86_400_000;
    const daysInRange = Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay) + 1;
    return Math.max(1, Math.round(daysInRange * 22 / 30));
}
