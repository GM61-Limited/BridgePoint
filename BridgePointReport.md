
# BridgePoint Integration Platform Report

---

## Cover Page
**Project Title:** BridgePoint – Secure Integration Platform for Sterile Services  
**Student Name and Number:** Nicholas LeMasonry – 23007675  
**Supervisor Name:** Steve Battle  

---

## Title Page
**BridgePoint: Digital Transformation in Sterile Services**  
Prepared by Nicholas LeMasonry
Date: 1st December 2025 

---

## Table of Contents
1. Glossary  
2. Chapter 1: Introduction  
3. Chapter 2: Method  
4. Chapter 3: Research  
5. Chapter 4: Requirements  
6. Chapter 5: Design & Development  
7. Chapter 6: Results  
8. Chapter 7: Conclusion  
9. References  
10. Appendices  

---

## Glossary
- **BridgePoint:** Secure, web-based integration platform for sterile services.
- **Sterile Services:** Department responsible for cleaning and sterilising medical instruments.
- **Azure:** Cloud hosting platform by Microsoft.
- **Containerisation:** Packaging software with dependencies for portability.

---


## Chapter 1: Introduction

### Background
Sterile Services Departments (SSDs) are essential in healthcare for ensuring surgical instruments are cleaned, disinfected, and sterilised to prevent infection and maintain patient safety. However, SSDs face significant operational challenges due to fragmented systems and complex processes. These departments often rely on multiple standalone systems—washers, sterilisers, track-and-trace software, and finance tools—that do not communicate effectively. In some cases, paper-based solutions are still used, adding further inefficiency and risk.

### Current Challenges
- **Disconnected Systems:**  
  Washers and sterilisers often operate independently from track-and-trace systems. For example, staff may manually copy washer cycle details onto packing notes for trays (sets of surgical instruments) or supplementary items (single instruments). This manual intervention is time-consuming and prone to error.
  
- **Paper-Based Processes:**  
  Despite digital transformation efforts, some SSDs still rely on paper records for certain workflows, making data retrieval and auditing cumbersome.

- **Complex Reporting:**  
  Track-and-trace systems typically export large, non-user-friendly files. SSD teams spend considerable time manipulating these files in Excel to produce compliance reports. This manual process introduces delays and increases the risk of inaccuracies.

- **Billing Inefficiencies:**  
  Billing workflows are equally problematic. SSD teams extract raw data, perform complex manipulations in Excel, and pass it to finance teams, who repeat similar steps before generating invoices. These processes are labour-intensive and error-prone.

### Problem Statement
The lack of integration between SSD systems creates inefficiencies, increases operational costs, and heightens the risk of compliance failures. Manual data handling across multiple platforms and paper-based workflows undermine productivity and accuracy.  
**BridgePoint** is proposed as a secure, cloud-hosted integration platform designed to unify SSD systems and automate data exchange. At this stage, the platform concept remains flexible: rather than defining specific integrations upfront, the project will identify priorities through stakeholder engagement and research.

### Research-Driven Approach
BridgePoint will be developed using a research-based methodology. Initial design will focus on creating a modular, scalable architecture capable of supporting multiple integration scenarios. Specific integrations—such as washer logs, steriliser cycles, compliance dashboards, or billing automation—will be determined after conducting interviews and workshops with SSD stakeholders. This ensures the solution addresses real-world needs rather than assumptions.

### Project Objectives
- **Propose a scalable integration platform** for sterile services.
- **Engage stakeholders** to identify high-value integration points.
- **Design a modular architecture** that supports future expansion.
- **Ensure compliance and security** through adherence to GDPR, NHS Digital standards, and ISO frameworks.

### Scope
The project will deliver:
- A conceptual design for BridgePoint.
- A prototype demonstrating core integration capabilities.
- Research findings from SSD stakeholders to guide future development.


---


## Chapter 2: Method

### Development Approach
The development of **BridgePoint** will follow a modular, containerised architecture to ensure scalability, portability, and security. The application will be composed of three primary containers:

- **Front-End Container:**  
  - Based on **Nginx** for serving static content.
  - Technologies: **HTML**, **CSS**, and **JavaScript** for building responsive web pages.
  - JavaScript will handle API calls to the back-end container to retrieve and display data dynamically.
  
- **Back-End Container:**  
  - Built using **Python**, responsible for business logic and heavy processing tasks.
  - Handles API requests from the front end and queries the database.
  - Performs calculations and data formatting before sending responses to the front end.

- **Database Container:**  
  - Runs **PostgreSQL**, chosen for its lightweight nature and ease of deployment in Docker.
  - Stores all application data securely.
  - Access restricted to the back-end container only, adding an extra layer of security and reducing the risk of direct data breaches.

Each container will have its own **Dockerfile** for specific configurations. A **Docker Compose** file will orchestrate all containers, ensuring they work together seamlessly. This approach allows the application to be easily deployed in any environment.

### Cloud Deployment
The containers will be deployed on **Microsoft Azure** using **Azure Kubernetes Service (AKS)** for orchestration. This provides:
- **Scalability:** Containers can scale automatically based on demand.
- **Performance:** Resources are allocated dynamically to match workload requirements.
- **Resilience:** High availability and fault tolerance through Kubernetes clustering.

### Security Considerations
- The front end will not have direct access to the database; all data requests will go through the back end.
- API endpoints will be secured using authentication and authorisation mechanisms.
- Data will be encrypted in transit and at rest using industry-standard protocols.

### Agile Methodology
The project will adopt **SCRUM**, a form of Agile development, to ensure iterative progress and stakeholder engagement:
- **Sprints:** Short development cycles for incremental delivery.
- **Daily Stand-Ups:** Quick updates to track progress and remove blockers.
- **Sprint Reviews:** Demonstrate completed features to stakeholders.
- **Sprint Retrospectives:** Identify improvements for future sprints.

### Tools & Technologies Summary
- **Development:** Python (back end), HTML/CSS/JavaScript (front end).
- **Containerisation:** Docker, Docker Compose.
- **Orchestration:** Azure Kubernetes Service (AKS).
- **Database:** PostgreSQL.
- **CI/CD:** GitHub Actions for automated builds and deployments.
- **Version Control:** Git branching strategy (feature, develop, main).

### Risks and Mitigation
| **Risk**                  | **Likelihood** | **Impact** | **Mitigation**                                      |
|---------------------------|---------------|-----------|-----------------------------------------------------|
| Data security breaches    | Medium        | High      | Encryption, RBAC, secure API endpoints             |
| Integration failures      | Medium        | Medium    | Modular design, thorough unit and integration tests|
| Performance bottlenecks   | Low           | High      | Kubernetes auto-scaling, load testing              |

### Ethics and Compliance
- **GDPR Compliance:** All patient-related data will be anonymised or pseudonymised.
- **NHS Digital Standards:** Align with healthcare data governance frameworks.


---

## Chapter 3: Research
- **Primary Research:**  
  - Interviews with sterile services staff  
  - Workflow observations  
- **Secondary Research:**  
  - ISO 13485 (Medical Device Quality Management)  
  - NHS Digital standards  
- **Informal Sources:**  
  - User stories from sterile services teams  
- **Technology Selection:**  
  - Pugh Matrix comparing Azure vs AWS vs GCP  
- **Main Argument:**  
  - Cloud-hosted integration improves compliance and efficiency  
- **Alternative Arguments:**  
  - On-premise solutions for data sovereignty

---

## Chapter 4: Requirements
- **User Stories / Use Cases:**  
  - *As a sterile services manager, I want automated reporting so I can ensure compliance.*  
- **Functional Requirements (FR):**  
  - FR1: System shall integrate washer and steriliser logs  
  - FR2: System shall generate compliance reports  
- **Non-Functional Requirements (NFR):**  
  - NFR1 (Usability): Intuitive dashboard  
  - NFR2 (Reliability): 99.9% uptime  
  - NFR3 (Security): AES-256 encryption  

---

## Chapter 5: Design & Development
- **Software Architecture:**  
  - Microservices hosted in Azure AKS  
- **UML Diagrams:**  
  - Component diagram for integration flow  
- **Code Snippets:**  
  ```csharp
  // Example API call for steriliser data
  var response = await httpClient.GetAsync("/steriliser/logs");
