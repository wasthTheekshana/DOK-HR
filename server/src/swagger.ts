import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'DOK-HR API',
            version: '1.0.0',
            description:
                'Human Resources & Payroll Management System API — manages employees, sites, tasks, attendance, payroll OT calculations, invoices, and analytics.',
            contact: { name: 'DOK-HR Support' },
        },
        servers: [
            { url: '/api', description: 'API base path' },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Enter your JWT token. Obtain it from POST /auth/login',
                },
            },
            schemas: {
                // ── Auth ───────────────────────────────────────────────────
                LoginRequest: {
                    type: 'object',
                    required: ['epf_number', 'password'],
                    properties: {
                        epf_number: { type: 'string', example: 'EPF001' },
                        password:   { type: 'string', format: 'password', example: 'secret123' },
                    },
                },
                LoginResponse: {
                    type: 'object',
                    properties: {
                        token: { type: 'string', description: 'JWT bearer token' },
                        user: {
                            type: 'object',
                            properties: {
                                id:          { type: 'integer' },
                                name:        { type: 'string' },
                                role:        { type: 'string', enum: ['admin','supervisor','staff','system_admin'] },
                                epf_number:  { type: 'string' },
                                site_id:     { type: 'integer', nullable: true },
                            },
                        },
                    },
                },
                // ── User ──────────────────────────────────────────────────
                User: {
                    type: 'object',
                    properties: {
                        ID:                     { type: 'integer', example: 1 },
                        EPF_NUMBER:             { type: 'string',  example: 'EPF001' },
                        NAME:                   { type: 'string',  example: 'John Silva' },
                        ROLE:                   { type: 'string',  enum: ['admin','supervisor','staff','system_admin'] },
                        STATUS:                 { type: 'string',  enum: ['active','inactive'] },
                        SITE_ID:                { type: 'integer', nullable: true },
                        INACTIVATION_REQUESTED: { type: 'integer', enum: [0,1], description: '0=no, 1=supervisor has requested deactivation' },
                        BASIC_SALARY:           { type: 'number',  example: 30000 },
                        OT_PERCENTAGE:          { type: 'number',  example: 0, description: '0=standard, 90=fixed-rate Rs.150/hr, other=custom %' },
                        FIX_SALARY:             { type: 'number',  example: 5000 },
                        CREATED_AT:             { type: 'string',  format: 'date-time' },
                    },
                },
                CreateUserRequest: {
                    type: 'object',
                    required: ['epf_number','name','password','role'],
                    properties: {
                        epf_number:    { type: 'string',  example: 'EPF002' },
                        name:          { type: 'string',  example: 'Jane Perera' },
                        password:      { type: 'string',  format: 'password' },
                        role:          { type: 'string',  enum: ['admin','supervisor','staff','system_admin'] },
                        site_id:       { type: 'integer', nullable: true, example: 3 },
                        basic_salary:  { type: 'number',  example: 25000 },
                        ot_percentage: { type: 'number',  example: 0 },
                        fix_salary:    { type: 'number',  example: 0 },
                    },
                },
                UpdateUserRequest: {
                    type: 'object',
                    properties: {
                        name:                   { type: 'string' },
                        password:               { type: 'string', format: 'password' },
                        role:                   { type: 'string', enum: ['admin','supervisor','staff','system_admin'] },
                        status:                 { type: 'string', enum: ['active','inactive'] },
                        site_id:                { type: 'integer', nullable: true },
                        basic_salary:           { type: 'number' },
                        ot_percentage:          { type: 'number' },
                        fix_salary:             { type: 'number' },
                        inactivation_requested: { type: 'integer', enum: [0,1] },
                    },
                },
                // ── Site ──────────────────────────────────────────────────
                SiteTaskType: {
                    type: 'object',
                    properties: {
                        ID:            { type: 'integer' },
                        TASK_NAME:     { type: 'string', example: 'Scanning' },
                        INVOICE_PRICE: { type: 'number', example: 2.50 },
                    },
                },
                CostFactor: {
                    type: 'object',
                    properties: {
                        ID:           { type: 'integer' },
                        FACTOR_KEY:   { type: 'string', example: 'Transport' },
                        FACTOR_VALUE: { type: 'string', example: '5000' },
                    },
                },
                Site: {
                    type: 'object',
                    properties: {
                        ID:              { type: 'integer', example: 1 },
                        SITE_NO:         { type: 'string',  example: 'S001' },
                        NAME:            { type: 'string',  example: 'Kings Hospital' },
                        SUPERVISOR_ID:   { type: 'integer', nullable: true },
                        SUPERVISOR_NAME: { type: 'string',  nullable: true },
                        DAILY_TARGET:    { type: 'integer', example: 50, description: '0 = no target set (time-based site)' },
                        OT_TYPE:         { type: 'string',  enum: ['time_based','target_based','staff_outsource'] },
                        SERVICE_TYPE:    { type: 'string',  example: 'Scanning' },
                        SITE_TYPE:       { type: 'string',  example: 'Hospital' },
                        STAFF_COUNT:     { type: 'integer', example: 5 },
                        TASK_TYPES:      { type: 'array', items: { '$ref': '#/components/schemas/SiteTaskType' } },
                        COST_FACTORS:    { type: 'array', items: { '$ref': '#/components/schemas/CostFactor' } },
                    },
                },
                CreateSiteRequest: {
                    type: 'object',
                    required: ['site_no','name','ot_type'],
                    properties: {
                        site_no:       { type: 'string', example: 'S002' },
                        name:          { type: 'string', example: 'National Bank' },
                        supervisor_id: { type: 'integer', nullable: true },
                        daily_target:  { type: 'integer', example: 100 },
                        ot_type:       { type: 'string', enum: ['time_based','target_based','staff_outsource'] },
                        service_type:  { type: 'string', example: 'Physical' },
                        site_type:     { type: 'string', example: 'Bank' },
                        task_types: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    task_name:     { type: 'string', example: 'Archiving' },
                                    invoice_price: { type: 'number', example: 3.00 },
                                },
                            },
                        },
                        cost_factors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    factor_key:   { type: 'string', example: 'Transport' },
                                    factor_value: { type: 'string', example: '5000' },
                                },
                            },
                        },
                    },
                },
                // ── Task ──────────────────────────────────────────────────
                Task: {
                    type: 'object',
                    properties: {
                        ID:               { type: 'integer' },
                        SITE_ID:          { type: 'integer' },
                        STAFF_ID:         { type: 'integer' },
                        TASK_DESCRIPTION: { type: 'string', example: 'Scanning' },
                        INVOICE_PRICE:    { type: 'number', example: 2.50 },
                        OT_TYPE:          { type: 'string', enum: ['time_based','target_based'] },
                        TASK_DATE:        { type: 'string', format: 'date', example: '2026-02-15' },
                        COUNT:            { type: 'integer', nullable: true, example: 120, description: 'Units completed — target_based only' },
                        IN_TIME:          { type: 'string', nullable: true, example: '08:30', description: 'HH:MM — time_based only' },
                        OUT_TIME:         { type: 'string', nullable: true, example: '19:00', description: 'HH:MM — time_based only' },
                    },
                },
                CreateTaskRequest: {
                    type: 'object',
                    required: ['site_id','staff_id','task_date'],
                    properties: {
                        site_id:          { type: 'integer' },
                        staff_id:         { type: 'integer' },
                        task_description: { type: 'string', example: 'Scanning' },
                        invoice_price:    { type: 'number' },
                        ot_type:          { type: 'string', enum: ['time_based','target_based'] },
                        task_date:        { type: 'string', format: 'date' },
                        count:            { type: 'integer', nullable: true },
                        in_time:          { type: 'string', nullable: true, example: '08:30' },
                        out_time:         { type: 'string', nullable: true, example: '19:00' },
                        target:           { type: 'number', nullable: true },
                        pay_unit_price:   { type: 'number', nullable: true },
                    },
                },
                BulkSaveTasksRequest: {
                    type: 'object',
                    required: ['site_id','task_date','tasks'],
                    properties: {
                        site_id:   { type: 'integer' },
                        task_date: { type: 'string', format: 'date' },
                        tasks: {
                            type: 'array',
                            items: { '$ref': '#/components/schemas/CreateTaskRequest' },
                        },
                    },
                },
                // ── Attendance ────────────────────────────────────────────
                Attendance: {
                    type: 'object',
                    properties: {
                        ID:              { type: 'integer' },
                        SITE_ID:         { type: 'integer' },
                        STAFF_ID:        { type: 'integer' },
                        ATTENDANCE_DATE: { type: 'string', format: 'date' },
                        IN_TIME:         { type: 'string', nullable: true, example: '08:00' },
                        OUT_TIME:        { type: 'string', nullable: true, example: '17:30' },
                    },
                },
                // ── Payroll ───────────────────────────────────────────────
                TimeBasedPayrollRow: {
                    type: 'object',
                    properties: {
                        STAFF_ID:         { type: 'integer' },
                        EPF_NUMBER:       { type: 'string' },
                        NAME:             { type: 'string' },
                        SITE_NO:          { type: 'string' },
                        SITE_NAME:        { type: 'string' },
                        BASIC_SALARY:     { type: 'number' },
                        default_out_time: { type: 'string', example: '17:00' },
                        extra_hours:      { type: 'number', description: 'Extra hours worked beyond 17:00' },
                        ot_rate:          { type: 'number', description: 'Rs. per extra hour' },
                        extra_payment:    { type: 'number', description: 'Total OT payment' },
                    },
                },
                TimeBasedSummaryRow: {
                    type: 'object',
                    properties: {
                        STAFF_ID:          { type: 'integer' },
                        EPF_NUMBER:        { type: 'string' },
                        NAME:              { type: 'string' },
                        SITE_NO:           { type: 'string' },
                        SITE_NAME:         { type: 'string' },
                        BASIC_SALARY:      { type: 'number' },
                        total_extra_hours: { type: 'number' },
                        total_payment:     { type: 'number' },
                        ot_rate:           { type: 'number' },
                    },
                },
                TargetBasedPayrollRow: {
                    type: 'object',
                    properties: {
                        STAFF_ID:      { type: 'integer' },
                        EPF_NUMBER:    { type: 'string' },
                        NAME:          { type: 'string' },
                        SITE_NO:       { type: 'string' },
                        SITE_NAME:     { type: 'string' },
                        SUM_COUNT:     { type: 'number', description: 'Total units completed in period' },
                        DAILY_TARGET:  { type: 'number' },
                        target_count:  { type: 'number', description: 'daily_target × DAYS_IN_PERIOD' },
                        extra_units:   { type: 'number', description: 'MAX(0, sum_count - target_count). Always 0 when daily_target = 0' },
                        extra_payment: { type: 'number', description: 'extra_units × EXTRA_UNIT_RATE' },
                    },
                },
                CustomOTRow: {
                    type: 'object',
                    properties: {
                        staff_id:                  { type: 'integer' },
                        epf_number:                { type: 'string' },
                        staff_name:                { type: 'string' },
                        site_no:                   { type: 'string' },
                        site_name:                 { type: 'string' },
                        basic_salary:              { type: 'number' },
                        original_ot_percentage:    { type: 'number' },
                        calculation_type:          { type: 'string', enum: ['90% Fixed','Custom %'] },
                        custom_percentage:         { type: 'number', nullable: true },
                        total_extra_hours:         { type: 'number' },
                        total_adjusted_extra_hours:{ type: 'number' },
                        total_payment:             { type: 'number' },
                        ot_rate:                   { type: 'number' },
                    },
                },
                SaveCustomOTRequest: {
                    type: 'object',
                    required: ['date_from','date_to','records'],
                    properties: {
                        date_from: { type: 'string', format: 'date', example: '2026-02-01' },
                        date_to:   { type: 'string', format: 'date', example: '2026-02-28' },
                        site_no:   { type: 'string', nullable: true, example: 'S001' },
                        records:   { type: 'array', items: { '$ref': '#/components/schemas/CustomOTRow' } },
                    },
                },
                SaveTargetPayrollRequest: {
                    type: 'object',
                    required: ['date_from','date_to','site_no','records'],
                    properties: {
                        date_from: { type: 'string', format: 'date' },
                        date_to:   { type: 'string', format: 'date' },
                        site_no:   { type: 'string', example: 'S001' },
                        records:   { type: 'array', items: { '$ref': '#/components/schemas/TargetBasedPayrollRow' } },
                    },
                },
                SavedPayrollHistoryRow: {
                    type: 'object',
                    properties: {
                        ID:              { type: 'integer' },
                        BATCH_ID:        { type: 'string' },
                        SITE_NO:         { type: 'string' },
                        SITE_NAME:       { type: 'string' },
                        STAFF_NAME:      { type: 'string' },
                        EPF_NUMBER:      { type: 'string' },
                        DATE_FROM:       { type: 'string', format: 'date' },
                        DATE_TO:         { type: 'string', format: 'date' },
                        SUM_COUNT:       { type: 'number' },
                        TARGET_COUNT:    { type: 'number' },
                        EXTRA_UNITS:     { type: 'number' },
                        EXTRA_PAYMENT:   { type: 'number' },
                        EXTRA_UNIT_RATE: { type: 'number' },
                        SAVED_AT:        { type: 'string', format: 'date-time' },
                    },
                },
                // ── Invoice ───────────────────────────────────────────────
                Invoice: {
                    type: 'object',
                    properties: {
                        ID:                   { type: 'integer' },
                        SITE_ID:              { type: 'integer' },
                        SITE_NO:              { type: 'string' },
                        SITE_NAME:            { type: 'string' },
                        DATE_FROM:            { type: 'string', format: 'date' },
                        DATE_TO:              { type: 'string', format: 'date' },
                        COST_VARIANT_AMOUNT:  { type: 'number', description: 'Sum of numeric cost factors' },
                        SALARY_OT_AMOUNT:     { type: 'number', description: 'Staff salaries + OT payments' },
                        EXPENSE_COST:         { type: 'number', description: 'Additional manual expenses' },
                        INVOICE_PRICE:        { type: 'number', description: 'Revenue: task count × unit prices' },
                        CREATED_AT:           { type: 'string', format: 'date-time' },
                    },
                },
                InvoicePreviewResponse: {
                    type: 'object',
                    properties: {
                        site: { '$ref': '#/components/schemas/Site' },
                        dateRange: {
                            type: 'object',
                            properties: {
                                from: { type: 'string', format: 'date' },
                                to:   { type: 'string', format: 'date' },
                            },
                        },
                        costVariants: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    factor_key:  { type: 'string' },
                                    factor_value:{ type: 'string' },
                                    is_numeric:  { type: 'boolean' },
                                },
                            },
                        },
                        costVariantAmount: { type: 'number' },
                        staffSalaries: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name:         { type: 'string' },
                                    epf_number:   { type: 'string' },
                                    basic_salary: { type: 'number' },
                                    fix_salary:   { type: 'number' },
                                    total:        { type: 'number' },
                                },
                            },
                        },
                        salaryTotal:     { type: 'number' },
                        timeOtTotal:     { type: 'number' },
                        targetOtTotal:   { type: 'number' },
                        salaryOtAmount:  { type: 'number', description: 'salaryTotal + timeOtTotal + targetOtTotal' },
                        taskLines: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    task_description:{ type: 'string' },
                                    count:           { type: 'integer' },
                                    invoice_price:   { type: 'number' },
                                    line_total:      { type: 'number' },
                                },
                            },
                        },
                        invoicePrice: { type: 'number' },
                    },
                },
                SaveInvoiceRequest: {
                    type: 'object',
                    required: ['site_id','date_from','date_to','invoice_price'],
                    properties: {
                        site_id:              { type: 'integer' },
                        site_no:              { type: 'string' },
                        site_name:            { type: 'string' },
                        date_from:            { type: 'string', format: 'date' },
                        date_to:              { type: 'string', format: 'date' },
                        cost_variant_amount:  { type: 'number' },
                        salary_ot_amount:     { type: 'number' },
                        expense_cost:         { type: 'number' },
                        invoice_price:        { type: 'number' },
                    },
                },
                // ── Common ────────────────────────────────────────────────
                MessageResponse: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', example: 'Operation successful' },
                    },
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', example: 'Error description' },
                    },
                },
                BatchSaveResponse: {
                    type: 'object',
                    properties: {
                        message:  { type: 'string' },
                        batch_id: { type: 'string', example: '2026-02-01_2026-02-28_S001_1740825600000' },
                        count:    { type: 'integer' },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],

        // ════════════════════════════════════════════════════════════════════
        // PATHS
        // ════════════════════════════════════════════════════════════════════
        paths: {

            // ── /auth ──────────────────────────────────────────────────────
            '/auth/login': {
                post: {
                    tags: ['Authentication'],
                    summary: 'Login with EPF number and password',
                    description: 'Returns a JWT bearer token valid for 10 minutes of inactivity.',
                    security: [],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/LoginRequest' } } },
                    },
                    responses: {
                        200: { description: 'Login successful', content: { 'application/json': { schema: { '$ref': '#/components/schemas/LoginResponse' } } } },
                        401: { description: 'Invalid credentials', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' } } } },
                        400: { description: 'Missing epf_number or password' },
                    },
                },
            },
            '/auth/register': {
                post: {
                    tags: ['Authentication'],
                    summary: 'Register a new user (admin only)',
                    description: 'Same as POST /users — creates a user account. Requires admin JWT.',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/CreateUserRequest' } } },
                    },
                    responses: {
                        201: { description: 'User registered', content: { 'application/json': { schema: { '$ref': '#/components/schemas/MessageResponse' } } } },
                        403: { description: 'Forbidden — admin role required' },
                    },
                },
            },

            // ── /users ─────────────────────────────────────────────────────
            '/users': {
                get: {
                    tags: ['Users'],
                    summary: 'Get all users',
                    description: '**Supervisors** see only users in their own site. **Admin/system_admin** see all users.',
                    parameters: [
                        { name: 'site', in: 'query', schema: { type: 'integer' }, description: 'Filter by site_id' },
                        { name: 'role', in: 'query', schema: { type: 'string' }, description: 'Filter by role (comma-separated allowed, e.g. staff,supervisor)' },
                        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active','inactive'] } },
                        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Partial match on name or EPF number' },
                    ],
                    responses: {
                        200: { description: 'Array of users', content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/User' } } } } },
                        401: { description: 'Unauthorized' },
                    },
                },
                post: {
                    tags: ['Users'],
                    summary: 'Create a new user (admin only)',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/CreateUserRequest' } } },
                    },
                    responses: {
                        201: { description: 'User created', content: { 'application/json': { schema: { '$ref': '#/components/schemas/MessageResponse' } } } },
                        400: { description: 'EPF number already exists or validation failed' },
                        403: { description: 'Forbidden — admin role required' },
                    },
                },
            },
            '/users/{id}': {
                get: {
                    tags: ['Users'],
                    summary: 'Get user by ID',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'User object', content: { 'application/json': { schema: { '$ref': '#/components/schemas/User' } } } },
                        404: { description: 'User not found' },
                    },
                },
                patch: {
                    tags: ['Users'],
                    summary: 'Update user (admin or supervisor)',
                    description: '**Admin** can update all fields. **Supervisor** can only set `inactivation_requested = 1` — all other fields return 403.',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/UpdateUserRequest' } } },
                    },
                    responses: {
                        200: { description: 'User updated', content: { 'application/json': { schema: { '$ref': '#/components/schemas/MessageResponse' } } } },
                        403: { description: 'Supervisor tried to update a field they cannot change' },
                        404: { description: 'User not found' },
                    },
                },
                delete: {
                    tags: ['Users'],
                    summary: 'Delete user (admin only)',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'User deleted', content: { 'application/json': { schema: { '$ref': '#/components/schemas/MessageResponse' } } } },
                        403: { description: 'Forbidden' },
                        404: { description: 'User not found' },
                    },
                },
            },

            // ── /sites ─────────────────────────────────────────────────────
            '/sites': {
                get: {
                    tags: ['Sites'],
                    summary: 'Get all sites',
                    description: 'Each site includes supervisor name, staff count, task types, and cost factors. Supervisors see only their assigned site(s).',
                    responses: {
                        200: { description: 'Array of sites', content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/Site' } } } } },
                    },
                },
                post: {
                    tags: ['Sites'],
                    summary: 'Create a site (admin only)',
                    description: 'Creates site with associated task types and cost factors. Automatically updates the supervisor\'s `site_id`.',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/CreateSiteRequest' } } },
                    },
                    responses: {
                        201: { description: 'Site created', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, id: { type: 'integer' } } } } } },
                        400: { description: 'site_no already exists' },
                        403: { description: 'Admin role required' },
                    },
                },
            },
            '/sites/{id}': {
                get: {
                    tags: ['Sites'],
                    summary: 'Get site by ID',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'Site object', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Site' } } } },
                        404: { description: 'Site not found' },
                    },
                },
                put: {
                    tags: ['Sites'],
                    summary: 'Update site (admin only)',
                    description: 'Replaces all task types and cost factors. Supervisor\'s site_id is auto-synced if supervisor changed.',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/CreateSiteRequest' } } },
                    },
                    responses: {
                        200: { description: 'Site updated' },
                        404: { description: 'Site not found' },
                    },
                },
                delete: {
                    tags: ['Sites'],
                    summary: 'Delete site (admin only)',
                    description: 'Cascades: deletes task types, cost factors, tasks, attendance, and invoices for this site.',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'Site deleted' },
                        404: { description: 'Site not found' },
                    },
                },
            },

            // ── /tasks ─────────────────────────────────────────────────────
            '/tasks': {
                get: {
                    tags: ['Tasks'],
                    summary: 'Get task records',
                    parameters: [
                        { name: 'site_id', in: 'query', schema: { type: 'integer' }, description: 'Filter by site' },
                        { name: 'date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filter by specific date' },
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'staff_id', in: 'query', schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Array of task rows', content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/Task' } } } } },
                    },
                },
                post: {
                    tags: ['Tasks'],
                    summary: 'Create a single task entry (admin, supervisor)',
                    description: 'For staff_outsource sites, ot_type is stored as time_based.',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/CreateTaskRequest' } } },
                    },
                    responses: {
                        201: { description: 'Task created' },
                    },
                },
            },
            '/tasks/{id}': {
                patch: {
                    tags: ['Tasks'],
                    summary: 'Update a task entry (admin, supervisor)',
                    description: 'Updates task_description, count, in_time, out_time, task_date, invoice_price. Does NOT change ot_type.',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        task_description: { type: 'string' },
                                        count:            { type: 'integer' },
                                        pay_unit_price:   { type: 'number' },
                                        invoice_price:    { type: 'number' },
                                        in_time:          { type: 'string' },
                                        out_time:         { type: 'string' },
                                        task_date:        { type: 'string', format: 'date' },
                                        target:           { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                    responses: { 200: { description: 'Task updated' } },
                },
            },
            '/tasks/bulk-save': {
                patch: {
                    tags: ['Tasks'],
                    summary: 'Bulk save multiple task entries (admin, supervisor)',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/BulkSaveTasksRequest' } } },
                    },
                    responses: { 200: { description: 'Tasks saved' } },
                },
            },
            '/tasks/summary': {
                get: {
                    tags: ['Tasks'],
                    summary: 'Daily count report (admin, supervisor)',
                    description: 'Returns per-staff task counts for a site on a specific date.',
                    parameters: [
                        { name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                        { name: 'site_id', in: 'query', schema: { type: 'integer' } },
                    ],
                    responses: { 200: { description: 'Daily count summary' } },
                },
            },
            '/tasks/target-base-report': {
                get: {
                    tags: ['Tasks'],
                    summary: 'Target-based performance report (admin)',
                    parameters: [
                        { name: 'date_from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                        { name: 'site_id', in: 'query', schema: { type: 'integer' } },
                    ],
                    responses: { 200: { description: 'Per-staff count vs target aggregated over date range' } },
                },
            },
            '/tasks/ot-analysis-report': {
                get: {
                    tags: ['Tasks'],
                    summary: 'OT analysis report (admin)',
                    description: 'Per-staff extra hours analysis for time-based sites.',
                    parameters: [
                        { name: 'date_from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                        { name: 'site_id', in: 'query', schema: { type: 'integer' } },
                    ],
                    responses: { 200: { description: 'OT analysis rows' } },
                },
            },
            '/tasks/daily-summary': {
                get: {
                    tags: ['Tasks'],
                    summary: 'Daily task count summary across all sites (admin)',
                    parameters: [
                        { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: { 200: { description: 'Summary per site per date' } },
                },
            },

            // ── /attendance ────────────────────────────────────────────────
            '/attendance': {
                get: {
                    tags: ['Attendance'],
                    summary: 'Get attendance records',
                    parameters: [
                        { name: 'site_id', in: 'query', schema: { type: 'integer' } },
                        { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'staff_id', in: 'query', schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Attendance records', content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/Attendance' } } } } },
                    },
                },
                post: {
                    tags: ['Attendance'],
                    summary: 'Create attendance record (admin, supervisor)',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['site_id','staff_id','attendance_date'],
                                    properties: {
                                        site_id:         { type: 'integer' },
                                        staff_id:        { type: 'integer' },
                                        attendance_date: { type: 'string', format: 'date' },
                                        in_time:         { type: 'string', example: '08:00' },
                                        out_time:        { type: 'string', example: '17:30' },
                                    },
                                },
                            },
                        },
                    },
                    responses: { 201: { description: 'Attendance created' } },
                },
            },
            '/attendance/report': {
                get: {
                    tags: ['Attendance'],
                    summary: 'Attendance report',
                    parameters: [
                        { name: 'site_id', in: 'query', schema: { type: 'integer' } },
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: { 200: { description: 'Attendance report data' } },
                },
            },

            // ── /payroll ───────────────────────────────────────────────────
            '/payroll': {
                get: {
                    tags: ['Payroll'],
                    summary: 'Get payroll data (admin, supervisor, system_admin)',
                    description: `Calculates OT payments on the fly.

**Time-based (ot_type=time_based):**
- Extra hours = out_time − 17:00 (rounded to nearest integer)
- Payment = extra_hours × (basic_salary / 240 × 1.5)
- view_mode=detailed → per-day rows; summary → aggregated per staff

**Target-based (ot_type=target_based):**
- total_target = daily_target × DAYS_IN_PERIOD (22)
- extra_units = MAX(0, sum_count − total_target)
- extra_payment = extra_units × EXTRA_UNIT_RATE (0.5)
- **If daily_target = 0 → extra_units = 0 (no target configured)**`,
                    parameters: [
                        { name: 'date_from', in: 'query', required: true, schema: { type: 'string', format: 'date' }, example: '2026-02-01' },
                        { name: 'date_to', in: 'query', required: true, schema: { type: 'string', format: 'date' }, example: '2026-02-28' },
                        { name: 'ot_type', in: 'query', required: true, schema: { type: 'string', enum: ['time_based','target_based'] } },
                        { name: 'site_no', in: 'query', schema: { type: 'string' }, description: 'Filter by site code' },
                        { name: 'view_mode', in: 'query', schema: { type: 'string', enum: ['summary','detailed'] }, description: 'Time-based only' },
                    ],
                    responses: {
                        200: {
                            description: 'Payroll rows',
                            content: {
                                'application/json': {
                                    schema: {
                                        oneOf: [
                                            { type: 'array', items: { '$ref': '#/components/schemas/TimeBasedPayrollRow' } },
                                            { type: 'array', items: { '$ref': '#/components/schemas/TimeBasedSummaryRow' } },
                                            { type: 'array', items: { '$ref': '#/components/schemas/TargetBasedPayrollRow' } },
                                        ],
                                    },
                                },
                            },
                        },
                        400: { description: 'Missing required params or invalid ot_type' },
                    },
                },
            },
            '/payroll/calculate': {
                post: {
                    tags: ['Payroll'],
                    summary: 'Trigger payroll recalculation (admin)',
                    description: 'Alias to GET /payroll — accepts same query params in body or query string.',
                    responses: { 200: { description: 'Payroll rows (same as GET /payroll)' } },
                },
            },
            '/payroll/custom-ot-report': {
                get: {
                    tags: ['Payroll'],
                    summary: 'Get Custom OT % report (admin, system_admin)',
                    description: `Fetches ALL staff from the selected site (no ot_percentage filter) and calculates overtime.

**Calculation rules:**
- ot_percentage = 90 → "90% Fixed": payment = extra_hours × Rs.150 (fixed)
- Any other ot_percentage → "Custom %": adjusted_hours = extra_hours × (custom_percentage / 100), then standard formula
- If custom_percentage not supplied → adjusted_hours = extra_hours (no adjustment, preview mode)

All site types included (time_based, target_based, staff_outsource).`,
                    parameters: [
                        { name: 'date_from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                        { name: 'site_id', in: 'query', schema: { type: 'integer' }, description: 'Filter by site ID (optional — all sites if omitted)' },
                        { name: 'custom_percentage', in: 'query', schema: { type: 'number', minimum: 0, maximum: 100 }, description: 'Percentage to apply (optional)' },
                    ],
                    responses: {
                        200: { description: 'Custom OT report rows', content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/CustomOTRow' } } } } },
                        400: { description: 'Invalid custom_percentage' },
                    },
                },
            },
            '/payroll/custom-ot-save': {
                post: {
                    tags: ['Payroll'],
                    summary: 'Save custom OT records (admin, system_admin)',
                    description: 'Saves calculated custom OT records to `custom_ot_records` table with a batch_id.',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/SaveCustomOTRequest' } } },
                    },
                    responses: {
                        200: { description: 'Saved successfully', content: { 'application/json': { schema: { '$ref': '#/components/schemas/BatchSaveResponse' } } } },
                        400: { description: 'Missing required fields or empty records' },
                    },
                },
            },
            '/payroll/custom-ot-history': {
                get: {
                    tags: ['Payroll'],
                    summary: 'Get saved custom OT history (admin, system_admin)',
                    parameters: [
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'site_no', in: 'query', schema: { type: 'string' } },
                    ],
                    responses: { 200: { description: 'Custom OT history rows from custom_ot_records table' } },
                },
            },
            '/payroll/save-target': {
                post: {
                    tags: ['Payroll'],
                    summary: 'Save target-based payroll (admin, system_admin)',
                    description: 'Saves target-based payroll results to `payroll_saved_records` table.',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/SaveTargetPayrollRequest' } } },
                    },
                    responses: {
                        200: { description: 'Saved successfully', content: { 'application/json': { schema: { '$ref': '#/components/schemas/BatchSaveResponse' } } } },
                        400: { description: 'Missing required fields' },
                    },
                },
            },
            '/payroll/saved-history': {
                get: {
                    tags: ['Payroll'],
                    summary: 'Get target-based payroll history (admin, system_admin)',
                    parameters: [
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'site_no', in: 'query', schema: { type: 'string' } },
                    ],
                    responses: {
                        200: { description: 'History rows', content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/SavedPayrollHistoryRow' } } } } },
                    },
                },
            },

            // ── /analytics ─────────────────────────────────────────────────
            '/analytics/workforce': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Workforce analytics (admin, system_admin)',
                    description: 'Role distribution, active/inactive counts, site-wise staff distribution.',
                    parameters: [
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: { 200: { description: 'Workforce analytics object' } },
                },
            },
            '/analytics/tasks': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Task productivity analytics (admin, system_admin)',
                    parameters: [
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: { 200: { description: 'Daily counts, site productivity, top performers' } },
                },
            },
            '/analytics/attendance': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Attendance analytics (admin, system_admin)',
                    parameters: [
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: { 200: { description: 'Monthly trends, avg hours, late-stay analysis' } },
                },
            },
            '/analytics/payroll': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Payroll analytics (admin, system_admin)',
                    parameters: [
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: { 200: { description: 'OT summary and payment totals by site' } },
                },
            },
            '/analytics/performance': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Performance analytics (admin, system_admin)',
                    parameters: [
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: { 200: { description: 'Top performers, productivity metrics' } },
                },
            },
            '/analytics/sites': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Site-wise statistics (admin, system_admin)',
                    responses: { 200: { description: 'Staff count, task count, OT type per site' } },
                },
            },
            '/analytics/site-count-trend': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Historical site count trend (admin, system_admin)',
                    responses: { 200: { description: 'Site count over time' } },
                },
            },
            '/analytics/profitability': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Profitability analysis (admin, system_admin)',
                    description: `Groups profit_amount records by service_type, site_type, and ot_type.

**Formula:**
- net_profit = SUM(invoice_price) − SUM(cost_variant_amount + salary_ot_amount + expense_cost)
- margin_pct = ROUND(net_profit / SUM(invoice_price) × 100, 1)`,
                    parameters: [
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: {
                        200: {
                            description: 'Profitability grouped by service_type, site_type, ot_type',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            byServiceType: { type: 'array' },
                                            bySiteType:    { type: 'array' },
                                            byOtType:      { type: 'array' },
                                            totals: {
                                                type: 'object',
                                                properties: {
                                                    totalRevenue: { type: 'number' },
                                                    totalCost:    { type: 'number' },
                                                    netProfit:    { type: 'number' },
                                                    marginPct:    { type: 'number' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/analytics/invoice-analysis': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Invoice analysis — trends and rankings (admin, system_admin)',
                    parameters: [
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                    ],
                    responses: {
                        200: {
                            description: 'Monthly trend, top revenue sites, top margin sites, loss sites',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            monthlyTrend:   { type: 'array', description: 'revenue, cost, net_profit per month' },
                                            topRevenueSites:{ type: 'array', description: 'Top 5 by SUM(invoice_price)' },
                                            topMarginSites: { type: 'array', description: 'Top 5 by net_profit/revenue %' },
                                            lossSites:      { type: 'array', description: 'Sites where net_profit < 0' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/analytics/site-performance': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Site performance vs target (admin, system_admin)',
                    description: `Target-based site analysis.

**Calculations:**
- total_target = daily_target × COUNT(DISTINCT task_date) ← actual days worked
- extra_units = MAX(0, sum_count − total_target) — **0 if daily_target = 0**
- achievement_pct = ROUND(sum_count / total_target × 100, 1)`,
                    parameters: [
                        { name: 'site_id', in: 'query', required: true, schema: { type: 'integer' } },
                        { name: 'date_from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
                    ],
                    responses: {
                        200: {
                            description: 'Site performance data',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            siteInfo:       { '$ref': '#/components/schemas/Site' },
                                            summary: {
                                                type: 'object',
                                                properties: {
                                                    totalActual:     { type: 'number' },
                                                    totalTarget:     { type: 'number' },
                                                    totalExtra:      { type: 'number' },
                                                    avgAchievement:  { type: 'number' },
                                                    staffCount:      { type: 'integer' },
                                                },
                                            },
                                            dailyTrend:     { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, actual: { type: 'number' }, target: { type: 'number' } } } },
                                            staffBreakdown: { type: 'array' },
                                            overperformers: { type: 'array' },
                                            underperformers:{ type: 'array' },
                                        },
                                    },
                                },
                            },
                        },
                        400: { description: 'site_id is required' },
                    },
                },
            },
            '/analytics/site-snapshot/{site_id}': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Full site deep-dive snapshot (admin, system_admin)',
                    description: `Runs 8 parallel queries to return complete site analysis:
1. Site info + supervisor
2. Staff list (active & inactive)
3. Task type breakdown (uses COUNT for time_based, SUM(count) for target_based)
4. Monthly task activity (last 12 months)
5. Invoice history
6. Monthly invoice trend (last 12 months)
7. Target-based OT paid (from payroll_saved_records)
8. Time-based OT paid (from custom_ot_records)

**isTimeBased flag:** true when ot_type = 'time_based' OR daily_target = 0.
When true, total_units represents staff-days; when false, it represents work units.`,
                    parameters: [
                        { name: 'site_id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: {
                            description: 'Site snapshot',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            site:       { type: 'object' },
                                            workforce:  { type: 'object', properties: { staff: { type: 'array' }, active: { type: 'integer' }, inactive: { type: 'integer' } } },
                                            taskActivity: {
                                                type: 'object',
                                                properties: {
                                                    taskTypes:        { type: 'array' },
                                                    monthlyTasks:     { type: 'array' },
                                                    totalTaskRecords: { type: 'integer' },
                                                    totalUnits:       { type: 'integer' },
                                                    isTimeBased:      { type: 'boolean', description: 'true → label as Staff Days; false → label as Total Units' },
                                                },
                                            },
                                            invoices:        { type: 'array' },
                                            monthlyInvoices: { type: 'array' },
                                            financials: {
                                                type: 'object',
                                                properties: {
                                                    totalRevenue:     { type: 'number' },
                                                    totalCost:        { type: 'number' },
                                                    netProfit:        { type: 'number' },
                                                    totalSalaryOt:    { type: 'number' },
                                                    totalCostVariant: { type: 'number' },
                                                    totalExpense:     { type: 'number' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        500: { description: 'Database error' },
                    },
                },
            },

            // ── /invoices ──────────────────────────────────────────────────
            '/invoices': {
                get: {
                    tags: ['Invoices'],
                    summary: 'Get saved invoices (admin, system_admin)',
                    parameters: [
                        { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
                        { name: 'site_id', in: 'query', schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Invoice records', content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/Invoice' } } } } },
                    },
                },
                post: {
                    tags: ['Invoices'],
                    summary: 'Save invoice to database (admin, system_admin)',
                    description: 'Persists calculated amounts to `profit_amount` table.',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/SaveInvoiceRequest' } } },
                    },
                    responses: {
                        201: { description: 'Invoice saved', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, id: { type: 'integer' } } } } } },
                    },
                },
            },
            '/invoices/preview': {
                post: {
                    tags: ['Invoices'],
                    summary: 'Preview invoice breakdown without saving (admin, system_admin)',
                    description: `Calculates a full invoice breakdown for a site and period — **does not save to DB**.

**Steps:**
1. Sum numeric cost factors → cost_variant_amount
2. Sum active staff salaries (basic_salary + fix_salary) → salary_total
3. Sum custom OT payments from custom_ot_records for period → time_ot_total
4. Sum target OT payments from payroll_saved_records for period → target_ot_total
5. salary_ot_amount = salary_total + time_ot_total + target_ot_total
6. Sum (task count × invoice_price) per task type → invoice_price

OT records matched by: date_from >= period_start AND date_to <= period_end`,
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['site_id','date_from','date_to'],
                                    properties: {
                                        site_id:   { type: 'integer' },
                                        date_from: { type: 'string', format: 'date', example: '2026-02-01' },
                                        date_to:   { type: 'string', format: 'date', example: '2026-02-28' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Invoice preview breakdown', content: { 'application/json': { schema: { '$ref': '#/components/schemas/InvoicePreviewResponse' } } } },
                        400: { description: 'Missing site_id, date_from, or date_to' },
                        404: { description: 'Site not found' },
                    },
                },
            },
            '/invoices/{id}': {
                put: {
                    tags: ['Invoices'],
                    summary: 'Update invoice amounts (admin, system_admin)',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { '$ref': '#/components/schemas/SaveInvoiceRequest' } } },
                    },
                    responses: {
                        200: { description: 'Invoice updated' },
                        404: { description: 'Invoice not found' },
                    },
                },
                delete: {
                    tags: ['Invoices'],
                    summary: 'Delete invoice (admin, system_admin)',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'Invoice deleted' },
                        404: { description: 'Invoice not found' },
                    },
                },
            },
        },

        tags: [
            { name: 'Authentication', description: 'Login and user registration' },
            { name: 'Users', description: 'Employee management — CRUD + role-based update rules' },
            { name: 'Sites', description: 'Work site management — task types, cost factors, supervisor assignment' },
            { name: 'Tasks', description: 'Daily task entry (time-based in/out or target-based count)' },
            { name: 'Attendance', description: 'Separate attendance tracking per site and staff' },
            { name: 'Payroll', description: 'OT calculation (time-based, target-based, custom %), save & history' },
            { name: 'Analytics', description: 'Workforce, productivity, profitability, invoice, and site analytics — admin/system_admin only' },
            { name: 'Invoices', description: 'Invoice preview, save, and management — admin/system_admin only' },
        ],
    },
    apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
