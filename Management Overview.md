# Service Renewal Hub - System Overview

## 1. Executive Summary
The Service Renewal Hub is a centralized application designed to manage software licenses, track expiry dates, and automate notifications to ensure business continuity. It provides a dashboard for tracking costs and upcoming renewals, reducing the risk of service interruptions.

## 2. High-Level Architecture

The system follows a modern 3-tier architecture:

```mermaid
graph TD
    User["Authorized User"] -->|HTTPS/TLS| LB["Load Balancer / Nginx"]
    
    subgraph AppServer [Application Server]
        LB -->|Static Content| Frontend["Frontend Web App"]
        LB -->|API Requests| Backend["Backend API Service"]
    end
    
    subgraph DataLayer [Data Layer]
        Backend -->|Reads/Writes| DB[("MongoDB Database")]
    end
    
    subgraph ExternalServices [External Services]
        Backend -->|SMTP/API| Email["Email Service (Gmail/SMTP Relay)"]
    end
```

### Components
*   **Frontend Web App**: Built with **React** and **Tailwind CSS**, providing a responsive and modern user interface for managing services.
*   **Backend API Service**: powered by **Python FastAPI**, handling business logic, authentication, and background scheduling.
*   **Database**: **MongoDB** is used for flexible storage of service records, user profiles, and logs.
*   **Email Engine**: An asynchronous email dispatcher that supports both direct SMTP (e.g., Gmail) and API-based providers (e.g., Resend).

## 3. Core Workflows

### 3.1 License Expiry & Notification Process
This automated workflow runs daily to identify and notify stakeholders of expiring services.

```mermaid
sequenceDiagram
    participant Scheduler as System Scheduler
    participant DB as Database
    participant Email as Email Engine
    participant User as Service Owner

    Note over Scheduler: Runs Daily at 09:00 AM
    Scheduler->>DB: Query Active Services
    DB-->>Scheduler: Return Services List
    
    loop For Each Service
        Scheduler->>Scheduler: Check Expiry Date vs Thresholds
        
        alt Matches Threshold (30, 7, 1 day)
            Scheduler->>Email: Trigger Notification
            Email->>Email: Generate Branded HTML
            Email-->>User: Send Email Alert
            Email->>DB: Log Notification
        end
    end
```

### 3.2 User Management & Authentication
Secure access control ensures only authorized personnel can manage sensitive license data.

```mermaid
stateDiagram-v2
    [*] --> Login
    Login --> Dashboard: Valid Credentials
    Login --> [*]: Invalid Credentials
    
    Dashboard --> ManageServices: Admin/User
    Dashboard --> ManageUsers: Admin Only
    Dashboard --> SystemSettings: Admin Only
    
    ManageServices --> EditService
    ManageServices --> AddService
    
    SystemSettings --> EmailConfig
    SystemSettings --> BrandingConfig
```

## 4. Technical Stack

| Component | Technology | Key Features |
|-----------|------------|--------------|
| **Frontend** | React 18, Tailwind CSS | Responsive UI, Dark Mode, Interactive Dashboard |
| **Backend** | Python 3.9+, FastAPI | High Performance, Async I/O, Auto-Documentation |
| **Database** | MongoDB | Scalable JSON storage, dynamic schemas |
| **Security** | JWT, bcrypt | Secure session management, password hashing |
| **Infrastructure** | Docker (Optional) | Portable containerized deployment |

## 5. Deployment Diagram

```mermaid
graph LR
    subgraph CorpNet ["Corporate Network / Cloud"]
        direction TB
        Client("Client PC")
        
        subgraph HostServer ["Host Server"]
            Nginx["Nginx Reverse Proxy"]
            React["Frontend Container (Port 3000/Static)"]
            API["Backend Container (Port 8000)"]
            Mongo["MongoDB (Port 27017)"]
        end
        
        Client -->|HTTP/80 or HTTPS/443| Nginx
        Nginx -->|/api| API
        Nginx -->|/| React
        API --> Mongo
    end
```

## 6. Security Features
*   **Encryption**: All passwords are hashed using **bcrypt** before storage.
*   **Transmission**: System supports TLS for all email communications.
*   **Access Control**: Role-Based Access Control (RBAC) separates Administrators from Standard Users.
