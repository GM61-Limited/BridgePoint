
-- db/init.sql

-- Optional extension for case-insensitive email comparison
CREATE EXTENSION IF NOT EXISTS citext;

-- =========================================
-- Environment (companies / tenants)
-- =========================================
CREATE TABLE IF NOT EXISTS environment (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================================
-- Users (tenant-scoped)
-- =========================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,          -- tenant-scoped uniqueness (see constraints below)
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    environment_id INT REFERENCES environment(id),
    email CITEXT,                             -- case-insensitive if citext installed
    role VARCHAR(50) DEFAULT 'Viewer',        -- Admin / Editor / Viewer
    is_active BOOLEAN NOT NULL DEFAULT TRUE,  -- to power UI toggle
    created_at TIMESTAMP DEFAULT NOW(),
    last_logged_in TIMESTAMP,

    -- Multi-tenant uniqueness (preferred for SaaS):
    CONSTRAINT users_env_username_uniq UNIQUE (environment_id, username),
    CONSTRAINT users_env_email_uniq    UNIQUE (environment_id, email)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_users_environment_id ON users (environment_id);
CREATE INDEX IF NOT EXISTS idx_users_env_username  ON users (environment_id, username);

-- =========================================
-- SQL Connections (per tenant)
-- =========================================
CREATE TABLE IF NOT EXISTS sql_connections (
    id SERIAL PRIMARY KEY,
    environment_id INT REFERENCES environment(id),
    created_at TIMESTAMP DEFAULT NOW(),
    name VARCHAR(255),
    host VARCHAR(255),
    database_name VARCHAR(255),
    port INT,
    table_name VARCHAR(255),
    username VARCHAR(255),
    password VARCHAR(255)
);

-- =========================================
-- System Logs (audit)
-- =========================================
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    environment_id INT REFERENCES environment(id),
    user_id INT REFERENCES users(id),
    action VARCHAR(255),
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================================
-- API Connections (per tenant)
-- =========================================
CREATE TABLE IF NOT EXISTS api_connections (
    id SERIAL PRIMARY KEY,
    environment_id INT REFERENCES environment(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,                   -- e.g. 'Xero', 'Power BI', 'Timely'
    base_url VARCHAR(255),                        -- optional: base API URL
    api_key VARCHAR(255),                         -- API key or client ID
    api_secret VARCHAR(255),                      -- secret / client secret
    token VARCHAR(500),                           -- access token if needed
    refresh_token VARCHAR(500),                   -- refresh token if needed
    expires_at TIMESTAMP,                         -- expiry time for tokens
    status VARCHAR(50) DEFAULT 'Active',          -- Active / Inactive / Expired
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =========================================
-- Seed initial environments
-- =========================================
INSERT INTO environment (name, domain) VALUES
('Test Company', 'testcompany.com'),
('GM61 Limited', 'gm61.co.uk'),
('IHSS Limited', 'ihss.co.uk')
ON CONFLICT DO NOTHING;

-- =========================================
-- Seed initial users (bcrypt hashes are placeholders)
-- Note: ensure password_hash uses the same hash algorithm your app expects.
-- The example values are the same as you shared; keep or replace as needed.
-- =========================================
INSERT INTO users (username, password_hash, first_name, last_name, environment_id, email, role, is_active)
VALUES
('testuser',  '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'Test', 'User', 1, 'testuser@testcompany.com', 'Admin', TRUE),
('GM61',      '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'GM61', 'User', 2, 'gm61@gm61.co.uk',         'Admin', TRUE),
('IHSS',      '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'IHSS', 'User', 3, 'ihss@ihss.co.uk',          'Admin', TRUE),
('nlemasonry','$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'Nick', 'LeMasonry', 2, 'Nick.LeMasonry@GM61.co.uk', 'Admin', TRUE)
ON CONFLICT DO NOTHING;
