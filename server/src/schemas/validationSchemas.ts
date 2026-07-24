import { z } from 'zod';

const timeStr = z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');

export const loginSchema = z.object({
    epf_number: z.string().min(1, 'EPF number is required'),
    password:   z.string().min(1, 'Password is required'),
});

export const createUserSchema = z.object({
    epf_number:    z.string().min(1).max(20),
    name:          z.string().min(1).max(100),
    password:      z.string().min(6),
    role:          z.enum(['admin', 'supervisor', 'staff', 'system_admin', 'project_manager']),
    site_id:       z.number().int().positive().optional().nullable(),
    basic_salary:  z.number().min(0).optional(),
    ot_percentage: z.number().min(0).max(100).optional(),
    fix_salary:    z.number().min(0).optional(),
});

export const updateUserSchema = z.object({
    epf_number:             z.string().min(1).max(20).optional(),
    name:                   z.string().min(1).max(100).optional(),
    password:               z.string().min(6).optional(),
    role:                   z.enum(['admin', 'supervisor', 'staff', 'system_admin', 'project_manager']).optional(),
    status:                 z.enum(['active', 'inactive']).optional(),
    site_id:                z.number().int().positive().optional().nullable(),
    basic_salary:           z.number().min(0).optional(),
    ot_percentage:          z.number().min(0).max(100).optional(),
    fix_salary:             z.number().min(0).optional(),
    inactivation_requested: z.number().int().min(0).max(1).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' });

const taskTypeSchema = z.object({
    task_name:     z.string().min(1).max(200),
    invoice_price: z.number().min(0),
});

const costFactorSchema = z.object({
    key:   z.string().min(1).max(100),
    value: z.string().max(200).optional(),
});

export const createSiteSchema = z.object({
    site_no:                z.string().min(1).max(50),
    name:                   z.string().min(1).max(100),
    supervisor_id:          z.number().int().positive().optional().nullable(),
    responsible_person_id:  z.number().int().positive().optional().nullable(),
    task_invoice_price:     z.number().min(0).optional(),
    daily_target:           z.number().min(0).optional(),
    ot_type:                z.enum(['time_based', 'target_based', 'staff_outsource']).optional(),
    status:                 z.enum(['active', 'inactive']).optional(),
    service_type:           z.string().max(100).optional().nullable(),
    site_type:              z.string().max(100).optional().nullable(),
    task_types:             z.array(taskTypeSchema).optional(),
    cost_factors:           z.array(costFactorSchema).optional(),
});

export const updateSiteSchema = createSiteSchema.partial().refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one field required' }
);

export const createAttendanceSchema = z.object({
    site_id:         z.number().int().positive(),
    staff_id:        z.number().int().positive(),
    attendance_date: dateStr,
    in_time:         timeStr,
    out_time:        timeStr,
});

export const updateSitePlanSchema = z.object({
    planned_start_date: dateStr.optional().nullable(),
    planned_end_date:   dateStr.optional().nullable(),
    planned_headcount:  z.number().int().min(0).optional().nullable(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' });

export const createMilestoneSchema = z.object({
    name:        z.string().min(1).max(200),
    description: z.string().max(1000).optional().nullable(),
    due_date:    dateStr.optional().nullable(),
    status:      z.enum(['not_started', 'in_progress', 'done']).optional(),
    sort_order:  z.number().int().optional(),
});

export const updateMilestoneSchema = createMilestoneSchema.partial().refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one field required' }
);

export const assignMilestoneSchema = z.object({
    milestone_id: z.number().int().positive().nullable(),
});
