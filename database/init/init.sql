-- Environment table (companies)
CREATE TABLE IF NOT EXISTS environment (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    environment_id INT REFERENCES environment(id),
    email VARCHAR(255) UNIQUE,
    role VARCHAR(50) DEFAULT 'Viewer',
    created_at TIMESTAMP DEFAULT NOW(),
    last_logged_in TIMESTAMP
);

-- SQL Connections table
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

-- System Logs table
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    environment_id INT REFERENCES environment(id),
    user_id INT REFERENCES users(id),
    action VARCHAR(255),
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- API Connections table
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

-- Seed initial environments
INSERT INTO environment (name, domain) VALUES 
('Test Company', 'testcompany.com'),
('GM61 Limited', 'gm61.co.uk'),
('IHSS Limited', 'ihss.co.uk');

-- Seed initial users with placeholder password hashes
INSERT INTO users (username, password_hash, first_name, last_name, environment_id, email, role) VALUES
('testuser', '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'Test', 'User', 1, 'testuser@testcompany.com', 'Admin'),
('GM61', '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'GM61', 'User', 2, 'gm61@gm61.co.uk', 'Admin'),
('IHSS', '$2b$12$h82fM8b1unYEkJg4KQQghui4.Rqpto5OVhX./tr3ZRQ4gZI6KYc8G', 'IHSS', 'User', 3, 'ihss@ihss.co.uk', 'Admin');