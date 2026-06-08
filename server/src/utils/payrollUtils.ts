export type DayType = 'weekday' | 'saturday' | 'sunday_poya';

const SAT_OT_START = '13:30';

const toMinutes = (t: string): number => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};

/**
 * Determines the day type for OT calculation:
 * - sunday_poya: Sunday OR any date in poyaDates (full-day OT)
 * - saturday:    Saturday (OT after 13:30 + early arrival before default in)
 * - weekday:     Mon–Fri (OT before default in + after default out)
 */
const toLocalDateStr = (d: Date): string => {
    // Use LOCAL date parts (getFullYear/Month/Date) so timezone offsets
    // don't shift the date — toISOString() is always UTC and causes off-by-one
    // on servers running in UTC+5:30 (Sri Lanka) or any positive offset.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const getDayType = (taskDate: Date | string, poyaDates: Set<string>): DayType => {
    // Always construct via local parts so UTC-parsed 'YYYY-MM-DD' strings don't shift
    // the weekday (new Date('YYYY-MM-DD') is UTC midnight, wrong on UTC+5:30 servers).
    let dayOfWeek: number;
    let dateStr: string;
    if (typeof taskDate === 'string') {
        const [y, m, d] = taskDate.split('-').map(Number);
        const local = new Date(y, m - 1, d); // local midnight — getDay() is correct
        dayOfWeek = local.getDay();
        dateStr = taskDate; // already 'YYYY-MM-DD'
    } else {
        dayOfWeek = taskDate.getDay();
        dateStr = toLocalDateStr(taskDate);
    }

    if (dayOfWeek === 0) return 'sunday_poya';
    if (poyaDates.has(dateStr)) return 'sunday_poya';
    if (dayOfWeek === 6) return 'saturday';
    return 'weekday';
};

/**
 * Calculates extra (OT) hours based on day type:
 *
 * sunday_poya → full working hours (out - in) = all OT
 * saturday    → early arrival (before default_in) + after 13:30
 * weekday     → early arrival (before default_in) + late departure (after default_out)
 *
 * Returns exact decimal hours for display (e.g. 2.5, 3.9).
 * Payment uses Math.floor of this value — see calculateTimeBasedPayment.
 */
export const calculateTimeBasedExtra = (
    outTimeStr: string,
    defaultOutTimeStr: string,
    inTimeStr?: string,
    defaultInTimeStr?: string,
    dayType: DayType = 'weekday'
): number => {
    if (!outTimeStr) return 0;

    const actualOut = toMinutes(outTimeStr);
    const actualIn  = inTimeStr ? toMinutes(inTimeStr) : toMinutes(defaultInTimeStr || '08:30');

    if (dayType === 'sunday_poya') {
        const total = actualOut - actualIn;
        return total > 0 ? Math.round(total / 60 * 100) / 100 : 0;
    }

    if (dayType === 'saturday') {
        const defaultIn  = toMinutes(defaultInTimeStr || '08:30');
        const satCutoff  = toMinutes(SAT_OT_START); // 13:30
        let extra = 0;
        if (inTimeStr && actualIn < defaultIn) extra += defaultIn - actualIn;
        if (actualOut > satCutoff) extra += actualOut - satCutoff;
        return extra > 0 ? Math.round(extra / 60 * 100) / 100 : 0;
    }

    // Weekday
    let extra = 0;
    if (outTimeStr && defaultOutTimeStr) {
        const diff = actualOut - toMinutes(defaultOutTimeStr);
        if (diff > 0) extra += diff;
    }
    if (inTimeStr && defaultInTimeStr) {
        const diff = toMinutes(defaultInTimeStr) - actualIn;
        if (diff > 0) extra += diff;
    }
    return extra > 0 ? Math.round(extra / 60 * 100) / 100 : 0;
};

export const calculateTimeBasedPayment = (extraHours: number, basicSalary: number): { payment: number, rate: number } => {
    if (!basicSalary || basicSalary <= 0) return { payment: 0, rate: 0 };
    const hourlyRate = (basicSalary / 240) * 1.5;
    // Floor hours so fractional minutes are never paid (e.g. 2.9h pays for 2h)
    return {
        payment: Math.floor(extraHours) * hourlyRate,
        rate: hourlyRate
    };
};

export const calculateTargetBasedExtra = (sumCount: number, totalTarget: number): number => {
    return Math.max(0, sumCount - totalTarget);
};

export const calculateTargetBasedPayment = (extraUnits: number, rate: number): number => {
    return extraUnits * rate;
};
