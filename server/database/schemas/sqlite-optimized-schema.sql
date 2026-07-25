-- SQLite-Optimized Database Schema for Slimbooks
-- Production-ready with proper field types, constraints, and indexes for SQLite

-- =====================================================
-- USERS TABLE - Authentication and user management
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(name) >= 2 AND length(name) <= 100),
    email TEXT NOT NULL UNIQUE CHECK (email LIKE '%_@_%.__%' AND length(email) <= 255),
    username TEXT NOT NULL UNIQUE CHECK (length(username) >= 3 AND length(username) <= 50),
    password_hash TEXT CHECK (password_hash IS NULL OR length(password_hash) = 60),
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
    google_id TEXT UNIQUE CHECK (google_id IS NULL OR length(google_id) <= 50),
    last_login TEXT,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
    account_locked_until TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================
-- CLIENTS TABLE - Customer information
-- =====================================================
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) >= 2 AND length(name) <= 100),
    first_name TEXT CHECK (first_name IS NULL OR (length(trim(first_name)) >= 1 AND length(first_name) <= 50)),
    last_name TEXT CHECK (last_name IS NULL OR (length(trim(last_name)) >= 1 AND length(last_name) <= 50)),
    email TEXT NOT NULL CHECK (email LIKE '%_@_%.__%' AND length(email) <= 255),
    phone TEXT CHECK (phone IS NULL OR length(phone) <= 20),
    company TEXT CHECK (company IS NULL OR length(company) <= 100),
    address TEXT CHECK (address IS NULL OR length(address) <= 255),
    city TEXT CHECK (city IS NULL OR length(city) <= 50),
    state TEXT CHECK (state IS NULL OR length(state) <= 50),
    zipCode TEXT CHECK (zipCode IS NULL OR (length(trim(zipCode)) >= 3 AND length(zipCode) <= 10)),
    country TEXT DEFAULT 'US' CHECK (length(country) = 2),
    stripe_customer_id TEXT CHECK (stripe_customer_id IS NULL OR length(stripe_customer_id) <= 50),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================
-- INVOICES TABLE - Invoice management
-- =====================================================
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE CHECK (length(trim(invoice_number)) >= 3 AND length(invoice_number) <= 50),
    client_id INTEGER NOT NULL,
    design_template_id INTEGER,
    recurring_template_id INTEGER,
    amount REAL NOT NULL CHECK (amount >= 0),
    tax_amount REAL NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount REAL NOT NULL CHECK (total_amount >= 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded')),
    due_date TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    description TEXT,
    items TEXT,
    notes TEXT,
    payment_terms TEXT CHECK (payment_terms IS NULL OR length(payment_terms) <= 100),
    stripe_invoice_id TEXT CHECK (stripe_invoice_id IS NULL OR length(stripe_invoice_id) <= 50),
    stripe_payment_intent_id TEXT CHECK (stripe_payment_intent_id IS NULL OR length(stripe_payment_intent_id) <= 50),
    type TEXT NOT NULL DEFAULT 'one-time' CHECK (type IN ('one-time', 'recurring', 'subscription')),
    client_name TEXT CHECK (client_name IS NULL OR length(client_name) <= 100),
    client_email TEXT CHECK (client_email IS NULL OR length(client_email) <= 255),
    client_phone TEXT CHECK (client_phone IS NULL OR length(client_phone) <= 20),
    client_address TEXT CHECK (client_address IS NULL OR length(client_address) <= 255),
    line_items TEXT,
    tax_rate_id TEXT CHECK (tax_rate_id IS NULL OR length(tax_rate_id) <= 50),
    shipping_amount REAL NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
    shipping_rate_id TEXT CHECK (shipping_rate_id IS NULL OR length(shipping_rate_id) <= 50),
    email_status TEXT NOT NULL DEFAULT 'not_sent' CHECK (email_status IN ('not_sent', 'sent', 'failed', 'bounced')),
    email_sent_at TEXT,
    email_error TEXT CHECK (email_error IS NULL OR length(email_error) <= 500),
    last_email_attempt TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE RESTRICT,
    FOREIGN KEY (design_template_id) REFERENCES invoice_design_templates (id) ON DELETE SET NULL,
    FOREIGN KEY (recurring_template_id) REFERENCES recurring_invoice_templates (id) ON DELETE SET NULL
);

-- =====================================================
-- INVOICE DESIGN TEMPLATES TABLE - Invoice layout/design templates
-- =====================================================
CREATE TABLE IF NOT EXISTS invoice_design_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) >= 2 AND length(name) <= 100),
    content TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    variables TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================
-- RECURRING INVOICE TEMPLATES TABLE - Recurring invoice business templates
-- =====================================================
CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) >= 2 AND length(name) <= 100),
    client_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK (amount >= 0),
    description TEXT,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
    payment_terms TEXT NOT NULL CHECK (length(payment_terms) <= 100),
    next_invoice_date TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    line_items TEXT,
    tax_amount REAL NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    tax_rate_id TEXT CHECK (tax_rate_id IS NULL OR length(tax_rate_id) <= 50),
    shipping_amount REAL NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
    shipping_rate_id TEXT CHECK (shipping_rate_id IS NULL OR length(shipping_rate_id) <= 50),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
);

-- =====================================================
-- EXPENSES TABLE - Expense tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    currency TEXT DEFAULT 'USD',
    category TEXT,
    date TEXT NOT NULL,
    vendor TEXT,
    notes TEXT,
    receipt_url TEXT CHECK (receipt_url IS NULL OR (receipt_url LIKE 'http%' AND length(receipt_url) <= 500)),
    is_billable INTEGER DEFAULT 0 CHECK (is_billable IN (0, 1)),
    client_id INTEGER,
    project TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
);

-- =====================================================
-- PAYMENTS TABLE - Payment tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    client_name TEXT NOT NULL CHECK (length(trim(client_name)) >= 1 AND length(client_name) <= 100),
    invoice_id INTEGER,
    amount REAL NOT NULL CHECK (amount > 0),
    method TEXT NOT NULL DEFAULT 'Cash' CHECK (method IN ('cash', 'check', 'bank_transfer', 'credit_card', 'paypal', 'other')),
    reference TEXT CHECK (reference IS NULL OR length(reference) <= 100),
    description TEXT CHECK (description IS NULL OR length(description) <= 500),
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'pending', 'failed', 'refunded')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL
);

-- =====================================================
-- REPORTS TABLE - Report storage
-- =====================================================
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) >= 2 AND length(name) <= 100),
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'profit_loss', 'tax', 'custom')),
    date_range_start TEXT NOT NULL,
    date_range_end TEXT NOT NULL,
    data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================
-- COUNTERS TABLE - Auto-increment counters
-- =====================================================
CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY CHECK (length(trim(name)) >= 2 AND length(name) <= 50),
    value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0)
);

-- =====================================================
-- SETTINGS TABLE - Application settings
-- =====================================================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY CHECK (length(trim(key)) >= 2 AND length(key) <= 100),
    value TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general' CHECK (length(trim(category)) >= 2 AND length(category) <= 50)
);

-- =====================================================
-- PROJECT_SETTINGS TABLE - Environment overrides
-- =====================================================
CREATE TABLE IF NOT EXISTS project_settings (
    key TEXT PRIMARY KEY CHECK (length(trim(key)) >= 2 AND length(key) <= 100),
    value TEXT NOT NULL,
    enabled INTEGER DEFAULT NULL CHECK (enabled IS NULL OR enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================================================
-- PERFORMANCE INDEXES
-- =====================================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);

-- Clients table indexes
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_first_last ON clients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company);
CREATE INDEX IF NOT EXISTS idx_clients_stripe_id ON clients(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);

-- Invoices table indexes
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_id ON invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_status ON invoices(client_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_date_range ON invoices(issue_date, due_date);

-- Templates table indexes
CREATE INDEX IF NOT EXISTS idx_templates_client_id ON templates(client_id);
CREATE INDEX IF NOT EXISTS idx_templates_active ON templates(is_active);
CREATE INDEX IF NOT EXISTS idx_templates_next_date ON templates(next_invoice_date);
CREATE INDEX IF NOT EXISTS idx_templates_frequency ON templates(frequency);

-- Expenses table indexes
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_vendor ON expenses(vendor);
CREATE INDEX IF NOT EXISTS idx_expenses_client_id ON expenses(client_id);
CREATE INDEX IF NOT EXISTS idx_expenses_is_billable ON expenses(is_billable);
CREATE INDEX IF NOT EXISTS idx_expenses_amount ON expenses(amount);
CREATE INDEX IF NOT EXISTS idx_expenses_date_category ON expenses(date, category);

-- Payments table indexes
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date);
CREATE INDEX IF NOT EXISTS idx_payments_client_name ON payments(client_name);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);
CREATE INDEX IF NOT EXISTS idx_payments_amount ON payments(amount);
CREATE INDEX IF NOT EXISTS idx_payments_date_status ON payments(date, status);
CREATE INDEX IF NOT EXISTS idx_payments_client_date ON payments(client_name, date);

-- Reports table indexes
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_date_range ON reports(date_range_start, date_range_end);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Users table trigger
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
    AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
        UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS delete_users_timestamp 
    AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
        UPDATE users SET deleted_at = datetime('now') WHERE id = NEW.id;
    END;

-- Clients table trigger
CREATE TRIGGER IF NOT EXISTS update_clients_timestamp 
    AFTER UPDATE ON clients
    FOR EACH ROW
    BEGIN
        UPDATE clients SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS delete_clients_timestamp 
    AFTER UPDATE ON clients
    FOR EACH ROW
    BEGIN
        UPDATE clients SET deleted_at = datetime('now') WHERE id = NEW.id;
    END;

-- Invoices table trigger
CREATE TRIGGER IF NOT EXISTS update_invoices_timestamp 
    AFTER UPDATE ON invoices
    FOR EACH ROW
    BEGIN
        UPDATE invoices SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS delete_invoices_timestamp 
    AFTER UPDATE ON invoices
    FOR EACH ROW
    BEGIN
        UPDATE invoices SET deleted_at = datetime('now') WHERE id = NEW.id;
    END; 

-- Templates table trigger
CREATE TRIGGER IF NOT EXISTS update_templates_timestamp 
    AFTER UPDATE ON templates
    FOR EACH ROW
    BEGIN
        UPDATE templates SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS delete_templates_timestamp 
    AFTER UPDATE ON templates
    FOR EACH ROW
    BEGIN
        UPDATE templates SET deleted_at = datetime('now') WHERE id = NEW.id;
    END;

-- Expenses table trigger
CREATE TRIGGER IF NOT EXISTS update_expenses_timestamp 
    AFTER UPDATE ON expenses
    FOR EACH ROW
    BEGIN
        UPDATE expenses SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS delete_expenses_timestamp 
    AFTER UPDATE ON expenses
    FOR EACH ROW
    BEGIN
        UPDATE expenses SET deleted_at = datetime('now') WHERE id = NEW.id;
    END;

-- Payments table trigger
CREATE TRIGGER IF NOT EXISTS update_payments_timestamp 
    AFTER UPDATE ON payments
    FOR EACH ROW
    BEGIN
        UPDATE payments SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS delete_payments_timestamp 
    AFTER UPDATE ON payments
    FOR EACH ROW
    BEGIN
        UPDATE payments SET deleted_at = datetime('now') WHERE id = NEW.id;
    END;

-- Project settings table trigger
CREATE TRIGGER IF NOT EXISTS update_project_settings_timestamp 
    AFTER UPDATE ON project_settings
    FOR EACH ROW
    BEGIN
        UPDATE project_settings SET updated_at = datetime('now') WHERE id = NEW.id;
    END;