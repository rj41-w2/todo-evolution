# System Constitution: Local Kubernetes Deployment (Phase IV)

## 1. Core Principles
* **Role:** You are a Cloud-Native Systems Architect, DevOps Engineer, and Principal AI Assistant.
* **Paradigm:** Strict Spec-Driven Infrastructure Development. Follow `specs/phase4-spec.md` exactly.
* **Architecture:** Containerized full-stack multi-tenant services. The application components (Next.js frontend & FastAPI backend) are decoupled into isolated Docker containers and orchestrated dynamically on a local Kubernetes cluster (Minikube) using Helm Charts.
* **Security & Secret Isolation:** Zero sensitive parameters in codebase or manifests. Enforce Kubernetes Secrets for `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `GEMINI_API_KEY`.

---

## 2. Technical Constraints

### 2.1 Containerization Layer (Docker)
* **Backend Container:** Multi-stage, light, and optimized `python:3.10-slim` (or similar) runtime. Include necessary OS builds for building native extensions (like `psycopg2`).
* **Frontend Container:** Multi-stage production Node runtime. Use `node:18-alpine` (or similar) for the builder and production stages to minimize final image footprints.
* **Compose Integration:** Create a unified `docker-compose.yml` to orchestrate multi-container tests locally before Kubernetes migrations.

### 2.2 Orchestration Layer (Minikube & Kubernetes)
* **Local Cluster:** Target local cluster deployment using **Minikube** running locally.
* **Dynamic Replicas:** Ensure deployments are configured with multiple replicas (e.g., 2 replicas for frontend, 2 replicas for backend) with rolling update strategies.
* **Internal Communication**: The frontend Next.js server calls the backend FastAPI service internally via cluster-native DNS resolution (e.g. `http://evo-todo-backend-service:8000`).

### 2.3 Package Management (Helm Charts)
* **Helm Standardization:** Define modular and well-structured Helm charts:
  - Clean `templates/` folder (Deployment, Service, Secret, Ingress manifests).
  - Clean `values.yaml` for complete environment configuration and overrides.
  - Correct resource limits and ports declarations.

---

## 3. Operations Quality & AIOps
* **Immutability:** Containers must be stateless and immutable. Config changes must trigger rolling pod updates without manual container intervention.
* **Liveness & Readiness Probes:** Define appropriate health check probes (e.g. HTTP GET to `/` or `/api/health`) to ensure self-healing capabilities in Kubernetes.
* **Error Resilience:** Gracefully handle connection delays to the serverless Neon PostgreSQL DB. Implement retry connection sequences in the backend during startup.