# BridgePoint - Automated Invoicing system

## Non-Technical Overview
BridgePoint is a web-based application designed to streamline financial processes for small to medium-sized businesses. It allows users to log in securely, view key metrics, access and manage raw financial data, track invoices, and interact with integrations such as SQL databases and financial APIs.

The application emphasizes a modern, iOS-style user interface, with a floating login island and a clean, intuitive layout. Users can navigate through sections such as Home, Overview, Data, Invoices, and Settings with ease.

Key features include:
- Secure login with username/password (temporary placeholder users for development).
- Placeholder integrations for Microsoft and GitHub authentication.
- Interactive dashboard showing total billed amounts, KPIs, and charts.
- Data management features for raw SQL data and invoicing.
- User settings for profile management, access rights, and application integrations.
- Dark mode toggle.

## Technical Design

### System Architecture
- **Front-End:** HTML, CSS, and JavaScript SPA (Single Page Application) running in a Docker container.
- **Back-End:** Planned separate container for API and calculation services.
- **Database:** SQL Server container for storing user data, invoices, and financial metrics.
- **Authentication:** Initially simple username/password validation; future integration with Microsoft and GitHub OAuth.

### Front-End
- **SPA Layout:** Side navigation bar with icons for Home, Overview, Data, Invoices, Settings, and Logout.
- **Floating Login Island:** Centralized login UI with company branding.
- **Responsive Design:** iOS-style visual aesthetics.
- **Dynamic Content Rendering:** Each tab displays content conditionally without reloading the page.
- **CSS:** Custom stylesheet supporting dark mode, floating login island, sidebar icons, and page-specific layouts.

### Back-End (Planned)
- **API Container:** Handles data retrieval, calculations, and integration with financial systems.
- **Endpoints:**
  - User authentication
  - Data retrieval for dashboards
  - Invoice management
  - Integration configuration

### Database
- **SQL Server:** Stores user accounts, access rights, company details, financial metrics, raw data, and invoice records.
- **Security:** Access controlled via the API; direct front-end queries are not permitted.

### Deployment
- **Docker:**
  - `Dockerfile` for front-end container.
  - `docker-compose.yml` for orchestrating front-end and back-end containers.
  - Containers named consistently (e.g., `financeModuleWebServer`) for easy management.
- **Local Development:** Pull updates via GitHub repository and run using Docker.

### Future Enhancements
- Full integration with Microsoft and GitHub OAuth for login.
- Multi-container orchestration using Kubernetes for scaling.
- Advanced analytics and reporting.
- Full CRUD operations on data and invoices.
- Role-based access controls.

## Getting Started
1. Clone the repository:
```bash
git clone https://github.com/yourusername/FinanceModule.git
cd FinanceModule
```
2. Build and run the containers:
```bash
docker-compose up --build
```
3. Open a web browser and navigate to `http://localhost:8080`.
4. Use the temporary credentials (username: `admin`, password: `admin`) to log in.

## License
This project is proprietary and intended for internal use at GM61.

---

*FinanceModule README - Comprehensive overview and technical design.*
