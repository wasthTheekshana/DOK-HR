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

export type MilestoneRisk = 'red' | 'amber' | null;

export function computeMilestoneRisk(dueDate: string | null, status: string, today: Date = new Date()): MilestoneRisk {
    if (!dueDate || status === 'done') return null;

    const due = new Date(dueDate);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffDays = Math.round((dueMidnight.getTime() - todayMidnight.getTime()) / 86400000);

    if (diffDays < 0) return 'red';
    if (diffDays <= 7) return 'amber';
    return null;
}

export function worstRisk(risks: MilestoneRisk[]): MilestoneRisk {
    if (risks.includes('red')) return 'red';
    if (risks.includes('amber')) return 'amber';
    return null;
}
