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
    company_id INT REFERENCES environment(id),
    email VARCHAR(255) UNIQUE,
    role VARCHAR(50) DEFAULT 'Viewer',
    created_at TIMESTAMP DEFAULT NOW(),
    last_logged_in TIMESTAMP
);

-- SQL Connections table
CREATE TABLE IF NOT EXISTS sql_connections (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES environment(id),
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
    company_id INT REFERENCES environment(id),
    user_id INT REFERENCES users(id),
    action VARCHAR(255),
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);


-- Seed initial environments
INSERT INTO environment (name, domain) VALUES 
('Test Company', 'testcompany.com'),
('GM61 Limited', 'gm61.co.uk'),
('IHSS Limited', 'ihss.co.uk');

-- Seed initial users with placeholder password hashes
INSERT INTO users (username, password_hash, first_name, last_name, company_id, email, role) VALUES
('testuser', 'PLACEHOLDER_HASH', 'Test', 'User', 1, 'testuser@testcompany.com', 'Admin'),
('GM61', 'PLACEHOLDER_HASH', 'GM61', 'User', 2, 'gm61@gm61.co.uk', 'Admin'),
('IHSS', 'PLACEHOLDER_HASH', 'IHSS', 'User', 3, 'ihss@ihss.co.uk', 'Admin');