
# BridgePoint Integration Platform Report

---

## Cover Page
**Project Title:** BridgePoint – Secure Integration Platform for Sterile Services  
**Student Name and Number:** Nicholas LeMasonry – [Student Number]  
**Supervisor Name:** Steve Battle  

---

## Title Page
**BridgePoint: Digital Transformation in Sterile Services**  
Prepared by Nicholas LeMasonry
Date: [Insert Date]  

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
### Problem Statement
Sterile services rely on multiple disconnected systems (washers, sterilisers, track-and-trace, finance). Manual data handling increases risk of errors, delays, and compliance issues.  
**BridgePoint** addresses these challenges by providing a unified, automated integration platform hosted in Azure, reducing manual intervention and improving operational efficiency.

---

## Chapter 2: Method
- **Tools & Methodology:**  
  - Development: .NET Core, Azure Kubernetes Service (AKS), REST APIs  
  - CI/CD: GitHub Actions  
  - Containerisation: Docker  
- **Risks:**  
  - Data security breaches  
  - Integration failures  
- **Ethics Methodology:**  
  - GDPR compliance for patient-related data  
- **Design Methodology:**  
  - UML-based architecture diagrams  
- **Version Control Strategy:**  
  - Git branching model (feature, develop, main)

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
