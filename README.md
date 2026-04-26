# BridgePoint

> Cloud-native washer-disinfector monitoring and compliance platform for NHS Sterile Services Departments (SSDs).

BridgePoint replaces paper-based and legacy on-premise workflows with a secure, auditable, cloud-hosted service — designed to meet HTM 01-01 compliance requirements and scale across multi-site SSD operations.

---

## Overview

Sterile Services Departments rely on washer-disinfector machines to decontaminate surgical instruments. Historically, cycle records have been tracked manually or via siloed on-premise systems, creating audit gaps and compliance risk.

BridgePoint provides a cloud-first operational layer that ingests machine telemetry, normalises cycle data, and surfaces it through a role-gated web interface — giving quality managers, engineers, and administrators a single source of truth for compliance evidence.

---

## Features

- **Cycle Monitoring** — Ingest and display washer-disinfector cycle records with pass/fail status, temperature profiles, and timestamps
- **Machine Dashboard** — Analytics and KPI cards for cycle throughput, fault rates, and recent activity
- **Machine Health & Maintenance** — Track device health status and maintenance history per machine
- **Audit Logging** — Append-only audit log with `prev_hash` field for tamper-evident traceability
- **Role-Based Access Control** — Three roles: `Admin`, `Editor`, `Viewer` with tenant-scoped permissions
- **Multi-Tenancy** — Per-environment (tenant) isolation for data and module configuration
- **Module Toggling** — Enable/disable feature modules (Machine Monitoring, Integration Hub, Analytics, Finance) per environment
- **Notifications** — In-app notification system for operational alerts
- **Integration Hub** — Pipeline builder for connecting external data sources via HTTP and database connectors
- **HTM 01-01 Alignment** — Designed around NHS decontamination compliance requirements

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Azure Container Apps                      │
│                                                             │
│  ┌──────────────────┐        ┌──────────────────────────┐  │
│  │  Frontend (Nginx) │ ──────▶│   Backend (FastAPI)      │  │
│  │  React / Vite /  │  /api  │   JWT Auth · RBAC        │  │
│  │  Bootstrap       │        │   Canonical Cycle Model  │  │
│  └──────────────────┘        └────────────┬─────────────┘  │
│                                           │                 │
└───────────────────────────────────────────┼─────────────────┘
                                            │
                              ┌─────────────▼─────────────┐
                              │  PostgreSQL Flexible Server │
                              │  (Azure, UK South)         │
                              └────────────────────────────┘
```

**Container Registry:** Azure Container Registry (ACR)  
**CI/CD:** GitHub Actions — builds and pushes images on every push to `main`, then updates both containers in the Azure Container App  
**Secrets:** Injected at runtime via Azure Container App environment configuration

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Bootstrap 5, Bootstrap Icons |
| Backend | FastAPI (Python), SQLAlchemy, Pydantic, bcrypt, PyJWT |
| Database | PostgreSQL 17 |
| Containerisation | Docker, Docker Compose (local), Nginx (reverse proxy) |
| Cloud | Azure Container Apps, Azure Container Registry, Azure PostgreSQL Flexible Server |
| CI/CD | GitHub Actions (OIDC auth to Azure) |

---

## Project Structure

```
bridgepoint/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline
├── backend/
│   ├── api/                    # FastAPI route handlers
│   ├── core/                   # Config, auth, dependencies
│   ├── models/                 # SQLAlchemy ORM models
│   ├── schemas/                # Pydantic request/response schemas
│   └── Dockerfile
├── webapp/
│   ├── frontend/
│   │   └── src/
│   │       ├── pages/          # React page components
│   │       ├── components/     # Shared UI components
│   │       └── hooks/          # Custom hooks
│   ├── nginx.conf.template     # Nginx reverse proxy config
│   └── Dockerfile              # Multi-stage build (Node → Nginx)
├── database/
│   └── init/
│       └── init.sql            # Schema + seed data
├── docker-compose.yml          # Local development stack
└── bridgepoint.containerapp.yaml  # Azure Container App definition
```

---

## Getting Started (Local Development)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

### Run locally

```bash
git clone https://github.com/<your-org>/bridgepoint.git
cd bridgepoint

# Copy and configure backend environment variables
cp backend/.env.example backend/.env

# Build and start all three services (frontend, backend, database)
docker compose up --build
```

The app will be available at **http://localhost**.

The `docker-compose.yml` mounts `database/init/init.sql` on first run, creating the schema and seeding default data including environments, roles, and a default admin user.

### Environment Variables (Backend)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Full PostgreSQL connection string (takes priority) |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | Fallback individual DB config |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `UPLOAD_BASE_DIR` | Path for file upload storage (default: `/data/uploads`) |
| `MAX_UPLOAD_MB` | Maximum upload file size in MB (default: `25`) |

---

## Deployment (Azure)

Deployments to Azure are fully automated via GitHub Actions. On every push to `main`:

1. OIDC authentication to Azure (no stored credentials)
2. Backend and frontend images are built via Azure Container Registry (ACR) build tasks
3. Both containers in the Azure Container App are updated to the new image tag (`v{run_number}`)

To set up, configure the following repository secrets:

| Secret | Description |
|---|---|
| `AZURE_CLIENT_ID` | Service principal / managed identity client ID |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |

The Container App definition (`bridgepoint.containerapp.yaml`) targets the `uksouth` region.

---

## Authentication & Access Control

BridgePoint uses JWT-based session authentication with bcrypt password hashing. All API routes are protected and scoped to the authenticated user's environment (tenant).

Three roles are supported:

| Role | Capabilities |
|---|---|
| `Admin` | Full access — manage users, modules, settings, and all data |
| `Editor` | Read and write cycle/machine data; cannot manage users |
| `Viewer` | Read-only access to dashboards and cycle records |

---

## Compliance Context

BridgePoint is designed to support compliance with **HTM 01-01** (NHS Health Technical Memorandum for decontamination of surgical instruments). Key compliance-relevant features include:

- Append-only audit log with `prev_hash` for chain integrity
- Tenant-scoped data isolation
- Role-gated access to sensitive records
- Cycle record traceability from raw machine telemetry through to normalised display

> This is an MVP / research prototype. Full HTM 01-01 certification and audit chain verification are post-MVP objectives.

---

## Acknowledgements

BridgePoint was developed as a final-year Software Engineering project at UWE Bristol (Module: UFCFFF-30-3). Primary research was conducted through practitioner interviews with a Quality Service Manager and General Manager at Southampton University Hospital's SSD, and a Head of IT for a CSSD organisation operating across Kent and London.

---

## Licence

This project is currently unlicensed. All rights reserved.
