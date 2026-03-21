export const calculateTimeBasedExtra = (
    outTimeStr: string,
    defaultOutTimeStr: string,
    inTimeStr?: string,
    defaultInTimeStr?: string
): number => {
    const toMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    let extraMinutes = 0;

    // Late departure OT: actual_out - default_out (e.g. 18:00 - 17:00 = 60 min)
    if (outTimeStr && defaultOutTimeStr) {
        const diff = toMinutes(outTimeStr) - toMinutes(defaultOutTimeStr);
        if (diff > 0) extraMinutes += diff;
    }

    // Early arrival OT: default_in - actual_in (e.g. 08:30 - 07:30 = 60 min)
    if (inTimeStr && defaultInTimeStr) {
        const diff = toMinutes(defaultInTimeStr) - toMinutes(inTimeStr);
        if (diff > 0) extraMinutes += diff;
    }

    if (extraMinutes <= 0) return 0;

    // Round half-up to nearest integer hour
    return Math.round(extraMinutes / 60);
};

export const calculateTimeBasedPayment = (extraHours: number, basicSalary: number): { payment: number, rate: number } => {
    if (!basicSalary || basicSalary <= 0) return { payment: 0, rate: 0 };
    const hourlyRate = (basicSalary / 240) * 1.5;
    return {
        payment: extraHours * hourlyRate,
        rate: hourlyRate
    };
};

export const calculateTargetBasedExtra = (sumCount: number, totalTarget: number): number => {
    return Math.max(0, sumCount - totalTarget);
};

export const calculateTargetBasedPayment = (extraUnits: number, rate: number): number => {
    return extraUnits * rate;
};
