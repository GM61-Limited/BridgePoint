-- =========================================================
-- db/init.sql
-- BridgePoint Database Initialisation (Cleaned + Deduped)
-- NOTE: Preserves ALL original seed data; removes only duplicates.
-- =========================================================

-- =========================================================
-- Extensions
-- =========================================================
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- =========================================================
-- Environment (companies / tenants)
-- =========================================================
CREATE TABLE IF NOT EXISTS environment (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT environment_name_uniq UNIQUE (name),
    CONSTRAINT environment_domain_uniq UNIQUE (domain)
);

-- =========================================================
-- Environment Modules (per tenant / environment)
-- =========================================================
CREATE TABLE IF NOT EXISTS environment_modules (
    environment_id INT NOT NULL REFERENCES environment(id) ON DELETE CASCADE,
    module_key VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT environment_modules_pk PRIMARY KEY (environment_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_environment_modules_env
    ON environment_modules (environment_id);

-- =========================================================
-- Users (tenant-scoped)
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    environment_id INT REFERENCES environment(id) ON DELETE SET NULL,
    email CITEXT,
    role VARCHAR(50) DEFAULT 'Viewer',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_logged_in TIMESTAMP,
    CONSTRAINT users_env_username_uniq UNIQUE (environment_id, username),
    CONSTRAINT users_env_email_uniq UNIQUE (environment_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_environment_id
    ON users (environment_id);

CREATE INDEX IF NOT EXISTS idx_users_env_username
    ON users (environment_id, username);

-- =========================================================
-- SQL Connections (per tenant)
-- =========================================================
CREATE TABLE IF NOT EXISTS sql_connections (
    id SERIAL PRIMARY KEY,
    environment_id INT REFERENCES environment(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    name VARCHAR(255),
    host VARCHAR(255),
    database_name VARCHAR(255),
    port INT,
    table_name VARCHAR(255),
    username VARCHAR(255),
    password VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_sql_connections_environment_id
    ON sql_connections (environment_id);

-- =========================================================
-- System Logs (audit)
-- =========================================================
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    environment_id INT REFERENCES environment(id) ON DELETE SET NULL,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255),
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_environment_id
    ON system_logs (environment_id);

-- =========================================================
-- API Connections (per tenant)
-- =========================================================
CREATE TABLE IF NOT EXISTS api_connections (
    id SERIAL PRIMARY KEY,
    environment_id INT REFERENCES environment(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    base_url VARCHAR(255),
    api_key VARCHAR(255),
    api_secret VARCHAR(255),
    token VARCHAR(500),
    refresh_token VARCHAR(500),
    expires_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_connections_environment_id
    ON api_connections (environment_id);

-- =========================================================
-- Machine Types (allowed categories)
-- =========================================================
CREATE TABLE IF NOT EXISTS machine_types (
    key VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- =========================================================
-- Integration Profiles (supported integrations/parsers)
-- =========================================================
CREATE TABLE IF NOT EXISTS integration_profiles (
    key VARCHAR(100) PRIMARY KEY,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- =========================================================
-- Machines (per tenant/environment)
-- =========================================================
CREATE TABLE IF NOT EXISTS machines (
    id SERIAL PRIMARY KEY,

    environment_id INT NOT NULL REFERENCES environment(id) ON DELETE CASCADE,

    -- Identity / display
    machine_name VARCHAR(255) NOT NULL,
    machine_code VARCHAR(100) NOT NULL,

    -- Classification
    machine_type VARCHAR(50) NOT NULL,        -- FK to machine_types(key)
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    serial_number VARCHAR(255),

    -- Networking / integration endpoint
    ip_address INET,
    port INT,
    hostname VARCHAR(255),
    protocol VARCHAR(50),                     -- http/https/smb/sftp/ftp/manual
    base_path VARCHAR(255),

    -- Ops metadata
    location VARCHAR(255),
    timezone VARCHAR(64),
    notes TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Nullable until assigned
    integration_key VARCHAR(100),

    CONSTRAINT machines_env_code_uniq UNIQUE (environment_id, machine_code),
    CONSTRAINT machines_port_range_chk CHECK (port IS NULL OR (port >= 1 AND port <= 65535))
);

CREATE INDEX IF NOT EXISTS idx_machines_environment_id
    ON machines (environment_id);

CREATE INDEX IF NOT EXISTS idx_machines_env_type
    ON machines (environment_id, machine_type);

CREATE INDEX IF NOT EXISTS idx_machines_env_active
    ON machines (environment_id, is_active);

CREATE INDEX IF NOT EXISTS idx_machines_integration_key
    ON machines (environment_id, integration_key);

-- Allow composite FK checks (machine belongs to environment)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'machines_id_environment_uniq'
    ) THEN
        ALTER TABLE machines
        ADD CONSTRAINT machines_id_environment_uniq UNIQUE (id, environment_id);
    END IF;
END $$;

-- =========================================================
-- Enforce controlled vocabularies (FKs) safely (idempotent)
-- =========================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'machines_machine_type_fk') THEN
        ALTER TABLE machines
        ADD CONSTRAINT machines_machine_type_fk
        FOREIGN KEY (machine_type) REFERENCES machine_types(key);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'machines_integration_key_fk') THEN
        ALTER TABLE machines
        ADD CONSTRAINT machines_integration_key_fk
        FOREIGN KEY (integration_key) REFERENCES integration_profiles(key);
    END IF;
END $$;

-- =========================================================
-- Maintenance Logs (audit trail)
-- =========================================================
CREATE TABLE IF NOT EXISTS maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant scope
    environment_id INT NOT NULL REFERENCES environment(id) ON DELETE CASCADE,

    -- Machine
    machine_id INT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,

    -- Core fields
    reason TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NULL,
    notes TEXT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT NULL REFERENCES users(id) ON DELETE SET NULL,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT maintenance_logs_end_after_start_chk
        CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_env_started
    ON maintenance_logs (environment_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_machine_started
    ON maintenance_logs (machine_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_started
    ON maintenance_logs (started_at DESC);

-- Enforce that maintenance_logs.environment_id matches machines.environment_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_logs_machine_env_fk'
    ) THEN
        ALTER TABLE maintenance_logs
        ADD CONSTRAINT maintenance_logs_machine_env_fk
        FOREIGN KEY (machine_id, environment_id)
        REFERENCES machines (id, environment_id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- =========================================================
-- Washer XML Uploads
-- =========================================================
CREATE TABLE IF NOT EXISTS washer_xml_uploads (
    id SERIAL PRIMARY KEY,
    environment_code TEXT NOT NULL,
    machine_id INTEGER NOT NULL,
    cycle_number TEXT NULL,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    parse_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS ix_washer_xml_uploads_machine_id
    ON washer_xml_uploads(machine_id);

CREATE INDEX IF NOT EXISTS ix_washer_xml_uploads_uploaded_at
    ON washer_xml_uploads(uploaded_at DESC);

ALTER TABLE washer_xml_uploads
    ADD COLUMN IF NOT EXISTS parsed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE washer_xml_uploads
    ADD COLUMN IF NOT EXISTS parsed_at TIMESTAMPTZ;

ALTER TABLE washer_xml_uploads
    ADD COLUMN IF NOT EXISTS parse_error TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'washer_xml_uploads_machine_fk') THEN
        ALTER TABLE washer_xml_uploads
        ADD CONSTRAINT washer_xml_uploads_machine_fk
        FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE;
    END IF;
END $$;

-- =========================================================
-- Sensor Types (extensible telemetry dimensions)
-- =========================================================
CREATE TABLE IF NOT EXISTS sensor_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    unit VARCHAR(50),
    description TEXT
);

-- =========================================================
-- Washer Cycles (one row per cycle)
-- =========================================================
CREATE TABLE IF NOT EXISTS washer_cycles (
    id SERIAL PRIMARY KEY,

    environment_id INT NOT NULL REFERENCES environment(id) ON DELETE CASCADE,
    machine_id     INT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    upload_id      INT NOT NULL REFERENCES washer_xml_uploads(id) ON DELETE CASCADE,

    cycle_number   BIGINT,
    program_name   VARCHAR(255),
    program_number INT,

    started_at     TIMESTAMPTZ,
    ended_at       TIMESTAMPTZ,
    duration_sec   INT,

    result         BOOLEAN,
    disinfection   BOOLEAN,

    a0_present     BOOLEAN,
    a0_recorded    INT,
    a0_required    INT,

    extra          JSONB,

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT washer_cycles_machine_cycle_uniq
        UNIQUE (machine_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS idx_washer_cycles_env
    ON washer_cycles (environment_id);

CREATE INDEX IF NOT EXISTS idx_washer_cycles_machine
    ON washer_cycles (machine_id);

CREATE INDEX IF NOT EXISTS idx_washer_cycles_started_at
    ON washer_cycles (started_at DESC);

-- =========================================================
-- Washer Cycle Stages (execution timeline)
-- =========================================================
CREATE TABLE IF NOT EXISTS washer_cycle_stages (
    id SERIAL PRIMARY KEY,
    cycle_id INT NOT NULL REFERENCES washer_cycles(id) ON DELETE CASCADE,

    stage_index INT NOT NULL,
    stage_name  VARCHAR(255),

    started_at  TIMESTAMPTZ,
    ended_at    TIMESTAMPTZ,
    duration_sec INT,

    set_temperature DOUBLE PRECISION,
    set_duration_sec INT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT washer_cycle_stages_uniq
        UNIQUE (cycle_id, stage_index)
);

CREATE INDEX IF NOT EXISTS idx_washer_cycle_stages_cycle
    ON washer_cycle_stages (cycle_id);

-- =========================================================
-- Washer Cycle Points (time-series telemetry)
-- =========================================================
CREATE TABLE IF NOT EXISTS washer_cycle_points (
    id BIGSERIAL PRIMARY KEY,

    cycle_id INT NOT NULL REFERENCES washer_cycles(id) ON DELETE CASCADE,
    sensor_type_id INT NOT NULL REFERENCES sensor_types(id),

    t_sec INT NOT NULL,
    value DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_washer_points_cycle_time
    ON washer_cycle_points (cycle_id, t_sec);

CREATE INDEX IF NOT EXISTS idx_washer_points_cycle_sensor
    ON washer_cycle_points (cycle_id, sensor_type_id);

-- =========================================================
-- Washer Cycle Attributes (vendor-specific extras)
-- =========================================================
CREATE TABLE IF NOT EXISTS washer_cycle_attributes (
    id SERIAL PRIMARY KEY,
    cycle_id INT NOT NULL REFERENCES washer_cycles(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT
);

CREATE INDEX IF NOT EXISTS idx_washer_cycle_attributes_cycle
    ON washer_cycle_attributes (cycle_id);

-- =========================================================
-- SEED DATA (order matters because of FKs)
-- =========================================================

-- 1) Seed environments
INSERT INTO environment (name, domain) VALUES
('Test Company', 'testcompany.com'),
('GM61 Limited', 'gm61.co.uk'),
('IHSS Limited', 'ihss.co.uk')
ON CONFLICT (name) DO NOTHING;

-- 2) Seed machine types
INSERT INTO machine_types (key, display_name, description, is_active) VALUES
('washer',     'Washer',     'Washer / washer-disinfector devices', TRUE)
ON CONFLICT (key) DO NOTHING;

-- 3) Seed integration profiles
INSERT INTO integration_profiles (key, display_name, description, is_active) VALUES
('mmm-so', 'MMM (internal: SO)', 'Internal integration profile name (rename later when official format confirmed)', TRUE)
ON CONFLICT (key) DO NOTHING;

-- 4) Seed initial users (bcrypt hashes are placeholders)
INSERT INTO users (username, password_hash, first_name, last_name, environment_id, email, role, is_active)
VALUES
('testuser',  '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'Test',    'User',      1, 'testuser@testcompany.com',     'Admin',  TRUE),
('GM61',      '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'GM61',    'User',      2, 'gm61@gm61.co.uk',              'Admin',  TRUE),
('IHSS',      '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'IHSS',    'User',      3, 'ihss@ihss.co.uk',              'Admin',  TRUE),
('nlemasonry','$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'Nick',    'LeMasonry', 2, 'Nick.LeMasonry@GM61.co.uk',    'Admin',  TRUE),
('mlm',       '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'Matthew', 'LeMasonry', 2, 'Matthew.LeMasonry@GM61.co.uk', 'Viewer', TRUE),
('Nick',      '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'Nick',    'LeMasonry', 2, 'Nick@GM61.co.uk',              'Admin',  TRUE),
('GM61test',  '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'GM61',    'Test',      2, 'gm61test@GM61.co.uk',          'Admin',  TRUE),
('Admin',     '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'Admin',   'Admin',     2, 'Admin@GM61.co.uk',             'Admin',  TRUE),
('Dev',       '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'Dev',     'Dev',       2, 'Dev@GM61.co.uk',               'Admin',  TRUE),
('Jacob',     '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'Jacob',   'Jones',     2, 'Jacob.Jones@GM61.co.uk',       'Admin',  TRUE),
('Gill',      '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'Gill',    'LeMasonry', 2, 'Gill.LeMasonry@GM61.co.uk',    'Admin',  TRUE)
ON CONFLICT (environment_id, username) DO NOTHING;

-- 5) Seed demo PostgreSQL connection for environment_id = 2
INSERT INTO sql_connections (
    environment_id,
    created_at,
    name,
    host,
    database_name,
    port,
    table_name,
    username,
    password
)
SELECT
    2,
    NOW(),
    'Assure Test',
    '4.250.37.33',
    'postgres',
    5432,
    NULL,
    'GM61',
    'Expert0.'
WHERE NOT EXISTS (
    SELECT 1
    FROM sql_connections sc
    WHERE sc.environment_id = 2
      AND sc.name = 'Assure Test'
      AND sc.host = '4.250.37.33'
      AND sc.port = 5432
      AND sc.database_name = 'postgres'
);

-- 6) Seed default module enablement per environment
INSERT INTO environment_modules (environment_id, module_key, enabled)
SELECT e.id, m.module_key, m.enabled
FROM environment e
CROSS JOIN (
    VALUES
      ('machine-monitoring', TRUE),
      ('integration-hub',    FALSE),
      ('finance',            FALSE),
      ('tray-archive',       FALSE),
      ('analytics',          FALSE)
) AS m(module_key, enabled)
ON CONFLICT (environment_id, module_key) DO NOTHING;

-- 7) Seed example machines (optional)

-- GM61 (env 2)
INSERT INTO machines (environment_id, machine_name, machine_code, machine_type, manufacturer, model, ip_address, port, protocol, location, timezone)
SELECT 2, 'Washer 1', 'SO-MMM-1', 'washer', 'MMM', 'Uniclean PLII 15-2 FD', '192.168.20.10'::inet, 80, 'http', 'IHSS Southampton', 'Europe/London'
WHERE NOT EXISTS (SELECT 1 FROM machines WHERE environment_id = 2 AND machine_code = 'SO-MMM-1');

INSERT INTO machines (environment_id, machine_name, machine_code, machine_type, manufacturer, model, ip_address, port, protocol, location, timezone)
SELECT 2, 'Washer 2', 'SO-MMM-2', 'washer', 'MMM', 'Uniclean PLII 15-2 FD', '192.168.20.11'::inet, 80, 'http', 'IHSS Southampton', 'Europe/London'
WHERE NOT EXISTS (SELECT 1 FROM machines WHERE environment_id = 2 AND machine_code = 'SO-MMM-2');

INSERT INTO machines (environment_id, machine_name, machine_code, machine_type, manufacturer, model, ip_address, port, protocol, location, timezone)
SELECT 2, 'Washer 3', 'SO-MMM-3', 'washer', 'MMM', 'Uniclean PLII 15-2 FD', '192.168.20.12'::inet, 80, 'http', 'IHSS Southampton', 'Europe/London'
WHERE NOT EXISTS (SELECT 1 FROM machines WHERE environment_id = 2 AND machine_code = 'SO-MMM-3');

INSERT INTO machines (environment_id, machine_name, machine_code, machine_type, manufacturer, model, ip_address, port, protocol, location, timezone)
SELECT 2, 'Washer 4', 'SO-MMM-4', 'washer', 'MMM', 'Uniclean PLII 15-2 FD', '192.168.20.13'::inet, 80, 'http', 'IHSS Southampton', 'Europe/London'
WHERE NOT EXISTS (SELECT 1 FROM machines WHERE environment_id = 2 AND machine_code = 'SO-MMM-4');

INSERT INTO machines (environment_id, machine_name, machine_code, machine_type, manufacturer, model, ip_address, port, protocol, location, timezone)
SELECT 2, 'Washer 5', 'SO-MMM-5', 'washer', 'MMM', 'Uniclean PLII 15-2 FD', '192.168.20.14'::inet, 80, 'http', 'IHSS Southampton', 'Europe/London'
WHERE NOT EXISTS (SELECT 1 FROM machines WHERE environment_id = 2 AND machine_code = 'SO-MMM-5');

INSERT INTO machines (environment_id, machine_name, machine_code, machine_type, manufacturer, model, ip_address, port, protocol, location, timezone)
SELECT 2, 'Washer 6', 'SO-MMM-6', 'washer', 'MMM', 'Uniclean PLII 15-2 FD', '192.168.20.15'::inet, 80, 'http', 'IHSS Southampton', 'Europe/London'
WHERE NOT EXISTS (SELECT 1 FROM machines WHERE environment_id = 2 AND machine_code = 'SO-MMM-6');

INSERT INTO machines (environment_id, machine_name, machine_code, machine_type, manufacturer, model, ip_address, port, protocol, location, timezone)
SELECT 2, 'Washer 7', 'SO-MMM-7', 'washer', 'MMM', 'Uniclean PLII 15-2 FD', '192.168.20.16'::inet, 80, 'http', 'IHSS Southampton', 'Europe/London'
WHERE NOT EXISTS (SELECT 1 FROM machines WHERE environment_id = 2 AND machine_code = 'SO-MMM-7');

-- 8) Seed sensor types
INSERT INTO sensor_types (code, unit, description) VALUES
    ('temperature',    '°C',    'Water temperature (logical / merged)'),
    ('temperature_1',  '°C',    'Water temperature probe 1'),
    ('temperature_2',  '°C',    'Water temperature probe 2'),
    ('pressure',       'bar',   'Water pressure'),
    ('conductivity',   'µS/cm', 'Water conductivity'),
    ('a0',             'A0',    'A0 disinfection value')
ON CONFLICT (code) DO NOTHING;