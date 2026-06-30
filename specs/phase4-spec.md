# System Specification: Local Kubernetes Deployment (Phase IV)

This specification defines the functional, architectural, and structural requirements for containerizing the full-stack Todo Chatbot application and deploying it on a local Kubernetes cluster using Minikube and Helm.

---

## 1. Architectural Blueprint

The application components are packed into isolated, stateless Docker containers. Kubernetes orchestrates these containers, managing scale, network routing, and secrets isolation.

```
                           MINIKUBE LOCAL CLUSTER
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│                        evo-todo-secrets (Secret)                       │
│             [DATABASE_URL, BETTER_AUTH_SECRET, GEMINI_API_KEY]         │
│                                                                        │
│       evo-todo-frontend (Deployment)       evo-todo-backend (Deployment)
│             Replicas: 2                          Replicas: 2           │
│       ┌───────────────┐  ┌───────────────┐ ┌───────────────┐  ┌───────────────┐
│       │  Frontend Pod │  │  Frontend Pod │ │  Backend Pod  │  │  Backend Pod  │
│       └───────┬───────┘  └───────┬───────┘ └───────┬───────┘  └───────┬───────┘
│               │                  │                 │                  │
│       ┌───────▼──────────────────▼───────┐ ┌───────▼──────────────────▼───────┐
│       │    evo-todo-frontend-service     │ │     evo-todo-backend-service     │
│       │          (NodePort: 30080)       │ │           (ClusterIP)            │
│       └───────────────┬──────────────────┘ └───────────────▲──────────────────┘
│                       │                                    │
│                       └─────────(Calls Internally)─────────┘
│                                                                        │
└───────────────────────┬────────────────────────────────────────────────┘
                        │
                        ▼ (User Browser Accesses NodePort)
```

---

## 2. Docker Containerization Specs

We define secure, multi-stage Docker builds to containerize the frontend Next.js and backend FastAPI applications.

### 2.1 Backend Dockerfile (`src/backend/Dockerfile`)
- **Base Image:** `python:3.10-slim` (or similar) to reduce footprint.
- **Dependency Build:** Installs standard system packages required to compile database dependencies (e.g., `libpq-dev`, `gcc`).
- **Workspace:** Sets up `/app` directory, installs `requirements.txt`, and copies the source files.
- **Port:** Exposes port `8000`.
- **Command:** `uvicorn main:app --host 0.0.0.0 --port 8000`.

### 2.2 Frontend Dockerfile (`frontend/Dockerfile`)
- **Base Image:** `node:18-alpine` (multi-stage build).
- **Stage 1 (Builder):** Installs packages, copies codebase, and runs `npm run build`.
- **Stage 2 (Runner):** Lightweight alpine runtime, copies only built assets (`.next`, `public`, `package.json`, `node_modules`), minimizing final image size.
- **Port:** Exposes port `3000`.
- **Command:** `npm run start`.

### 2.3 Local Multi-Container Test (`docker-compose.yml`)
- Integrates both containers locally over a bridged network.
- Declares environment secrets inside `.env` to map to the containers.

---

## 3. Helm Chart Specifications

The entire infrastructure package is defined under a single Helm Chart located in `helm/evo-todo/`.

### 3.1 Values Configuration (`values.yaml`)
Enables dynamic parameter overrides for the entire deployment:
```yaml
replicaCount: 2

image:
  repository: evo-todo
  pullPolicy: IfNotPresent
  tag: latest

backend:
  replicas: 2
  port: 8000
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 250m
      memory: 256Mi

frontend:
  replicas: 2
  port: 3000
  service:
    type: NodePort
    nodePort: 30080
  resources:
    limits:
      cpu: 1000m
      memory: 1Gi
    requests:
      cpu: 500m
      memory: 512Mi
```

### 3.2 Secrets Manifest (`templates/secrets.yaml`)
Creates a Kubernetes Secret mapping sensitive variables securely:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: evo-todo-secrets
type: Opaque
data:
  DATABASE_URL: {{ .Values.secrets.databaseUrl | b64enc | quote }}
  BETTER_AUTH_SECRET: {{ .Values.secrets.betterAuthSecret | b64enc | quote }}
  GEMINI_API_KEY: {{ .Values.secrets.geminiApiKey | b64enc | quote }}
  BETTER_AUTH_URL: {{ .Values.secrets.betterAuthUrl | b64enc | quote }}
```

### 3.3 Backend Deployment (`templates/backend-deployment.yaml`)
- Configures 2 backend pod replicas.
- Hooks up Liveness Probe (`GET /` to verify API is active).
- Injects environment variables dynamically from `evo-todo-secrets`.

### 3.4 Frontend Deployment (`templates/frontend-deployment.yaml`)
- Configures 2 frontend pod replicas.
- Hooks up Liveness Probe (`GET /login` to verify web app is active).
- Sets `API_BASE_URL` dynamically to call the internal backend service DNS: `http://evo-todo-backend-service:8000`.

---

## 4. Local Deployment Playbook (Minikube)

To deploy the cluster locally on a developer workstation, the following sequence is executed:

1. **Start Minikube Cluster**:
   ```bash
   minikube start --driver=docker
   ```
2. **Configure Docker CLI Environment**:
   - Instructs the local shell to use Minikube's in-cluster Docker daemon instead of host daemon. This allows building images directly inside Minikube without pushing to external registries like Docker Hub:
   ```bash
   # Windows PowerShell:
   & minikube -p minikube docker-env | Invoke-Expression
   ```
3. **Build Images In-Cluster**:
   ```bash
   docker build -t evo-todo-backend:latest ./src/backend
   docker build -t evo-todo-frontend:latest ./frontend
   ```
4. **Deploy Helm Chart**:
   - Deploy the applications passing parameters dynamically via Helm values:
   ```bash
   helm install evo-todo ./helm/evo-todo \
     --set secrets.databaseUrl="<YOUR_NEON_DB_URL>" \
     --set secrets.betterAuthSecret="<YOUR_SECRET>" \
     --set secrets.geminiApiKey="<YOUR_GEMINI_KEY>"
   ```
5. **Acquire Access URL**:
   - Generate local access URL for the NodePort service:
   ```bash
   minikube service evo-todo-frontend --url
   ```
