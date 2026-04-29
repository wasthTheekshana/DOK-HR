export interface User {
    ID: number;
    EPF_NUMBER: string;
    NAME: string;
    ROLE: 'admin' | 'supervisor' | 'staff' | 'system_admin';
    STATUS: 'active' | 'inactive';
    SITE_ID: number | null;
    INACTIVATION_REQUESTED?: number; // 0 or 1
    IS_TEMP?: number; // 1 = temporarily assigned to this site, not permanent
    BASIC_SALARY?: number;
    OT_PERCENTAGE?: number;
    FIX_SALARY?: number;
    CREATED_AT: string;
}

export interface CostFactor {
    FACTOR_KEY: string;
    FACTOR_VALUE: string;
}

export interface Site {
    ID: number;
    SITE_NO: string;
    NAME: string;
    SUPERVISOR_ID: number | null;
    SUPERVISOR_NAME?: string;
    STAFF_COUNT?: number;
    TASK_INVOICE_PRICE?: number;
    DAILY_TARGET?: number;
    OT_TYPE?: 'time_based' | 'target_based' | 'staff_outsource';
    SERVICE_TYPE?: string;
    SITE_TYPE?: string;
    TASK_TYPES?: SiteTaskType[];
    COST_FACTORS?: CostFactor[];
}

export interface SiteTaskType {
    SITE_ID: number;
    TASK_NAME: string;
    INVOICE_PRICE: number;
}

export interface Task {
    ID: number;
    SITE_ID: number;
    STAFF_ID: number;
    TASK_DESCRIPTION: string;
    INVOICE_PRICE: number;
    OT_TYPE: 'time_based' | 'target_based';
    TARGET: number;
    PAY_UNIT_PRICE: number;
    TASK_DATE: string;
    COUNT: number;
    IN_TIME: string | null;
    OUT_TIME: string | null;
    STAFF_NAME?: string;
    SITE_NAME?: string;
    SITE_NO?: string;
}

export interface Attendance {
    ID: number;
    SITE_ID: number;
    STAFF_ID: number;
    ATTENDANCE_DATE: string;
    IN_TIME: string | null;
    OUT_TIME: string | null;
    STAFF_NAME?: string;
    SITE_NAME?: string;
    SITE_NO?: string;
    OT_TYPE?: string;
}

export interface LoginResponse {
    token: string;
    user: {
        ID: number;
        EPF_NUMBER: string;
        NAME: string;
        ROLE: string;
        SITE_ID: number | null;
    };
}

export interface InvoiceRecord {
    ID: number;
    SITE_ID: number;
    SITE_NO: string;
    SITE_NAME: string;
    DATE_FROM: string;
    DATE_TO: string;
    COST_VARIANT_AMOUNT: number;
    SALARY_OT_AMOUNT: number;
    EXPENSE_COST: number;
    INVOICE_PRICE: number;
    CREATED_AT: string;
    CREATED_BY_NAME?: string;
}

export interface InvoiceCostFactor {
    key: string;
    value: string;
    numeric: boolean;
    amount: number;
}

export interface InvoiceStaffSalary {
    ID: number;
    NAME: string;
    BASIC_SALARY: number;
    FIX_SALARY: number;
    TOTAL_SALARY: number;
}

export interface InvoiceTaskLine {
    TASK_NAME: string;
    TOTAL_COUNT: number;
    UNIT_PRICE: number;
    LINE_TOTAL: number;
}

export interface InvoiceOutsourceStaffLine {
    ID: number;
    NAME: string;
    ATTEND_COUNT: number;
}

export interface InvoicePreview {
    site: { ID: number; SITE_NO: string; NAME: string; OT_TYPE: string };
    date_from: string;
    date_to: string;
    cost_factors: InvoiceCostFactor[];
    cost_variant_total: number;
    staff_salaries: InvoiceStaffSalary[];
    total_salary: number;
    ot_time_based: number;
    ot_target_based: number;
    total_ot: number;
    salary_ot_amount: number;
    task_lines: InvoiceTaskLine[];
    total_invoice_price: number;
    outsource_staff_lines?: InvoiceOutsourceStaffLine[];
}
