import { execute } from '../db/dbUtils';

// A supervisor's reach isn't just sites.supervisor_id — it also includes any site they've
// been given a temporary/permanent assignment to (temporary_assignments). Every query that
// scopes a supervisor to "their" sites should use this instead of a raw supervisor_id check.
export async function getSupervisorAccessibleSiteIds(supervisorId: number): Promise<number[]> {
    const [sitesResult, assignResult] = await Promise.all([
        execute<any>(`SELECT id FROM sites WHERE supervisor_id = :id`, { id: supervisorId }),
        execute<any>(
            `SELECT site_id FROM temporary_assignments
             WHERE staff_id = :id AND CURRENT_DATE >= start_date AND (end_date IS NULL OR CURRENT_DATE <= end_date)`,
            { id: supervisorId }
        ),
    ]);
    return Array.from(new Set([
        ...(sitesResult.rows?.map((r: any) => r.ID) || []),
        ...(assignResult.rows?.map((r: any) => r.SITE_ID) || []),
    ]));
}
