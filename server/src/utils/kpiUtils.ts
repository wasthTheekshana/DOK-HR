export function daysInMonth(period: string): number {
    const [year, month] = period.split('-').map(Number);
    return new Date(year, month, 0).getDate();
}

export function computeAutoScore(params: {
    attendanceDays: number;
    daysInPeriod: number;
    taskCount: number;
    taskTarget: number;
}): number {
    const { attendanceDays, daysInPeriod, taskCount, taskTarget } = params;
    const attendancePct = daysInPeriod > 0 ? Math.min(100, (attendanceDays / daysInPeriod) * 100) : 0;

    if (taskTarget > 0) {
        const taskPct = Math.min(100, (taskCount / taskTarget) * 100);
        return Math.round((attendancePct * 0.5 + taskPct * 0.5) * 100) / 100;
    }

    return Math.round(attendancePct * 100) / 100;
}

export type DeadlineRisk = 'red' | 'amber' | null;

export function computeDeadlineRisk(dueDate: string | Date | null, isDone: boolean, today: Date = new Date()): DeadlineRisk {
    if (!dueDate || isDone) return null;

    // pg returns DATE columns as JS Date objects, not 'YYYY-MM-DD' strings.
    let dueMidnight: Date;
    if (dueDate instanceof Date) {
        // pg parses DATE as UTC midnight regardless of server timezone; read back with UTC getters.
        dueMidnight = new Date(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
    } else {
        const [dueYear, dueMonth, dueDay] = dueDate.split('-').map(Number);
        dueMidnight = new Date(dueYear, dueMonth - 1, dueDay);
    }
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.round((dueMidnight.getTime() - todayMidnight.getTime()) / 86400000);

    if (diffDays < 0) return 'red';
    if (diffDays <= 7) return 'amber';
    return null;
}

export function worstRisk(risks: DeadlineRisk[]): DeadlineRisk {
    if (risks.includes('red')) return 'red';
    if (risks.includes('amber')) return 'amber';
    return null;
}
