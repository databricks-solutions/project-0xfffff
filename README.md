# Workshop Annotation Platform

A collaborative platform for annotating and evaluating LLM traces with MLflow integration, discovery phases, and inter-rater reliability analysis.

## 📚 Documentation

For detailed documentation, see the [/doc](doc/) folder:

- **[Facilitator Guide](doc/FACILITATOR_GUIDE.md)** - A comprehensive guide for facilitators to deploy, configure, and run the workshop.
- **[Release Notes](doc/RELEASE_NOTES.md)** - Latest release information and quick start
- **[Build Guide](doc/FACILITATOR_GUIDE.md)** - Client build instructions
- **[Authentication Fix](doc/AUTHENTICATION_FIX.md)** - Authentication improvements
- **[Annotation Editing](doc/ANNOTATION_EDITING_FIX.md)** - Annotation editing features
- **[Database Migrations](doc/DB_MIGRATIONS.md)** - SQLite schema migrations (Alembic)
- **[All Documentation](doc/README.md)** - Complete documentation index

## 🚀 Quick Start (Recommended)

For production use, we recommend using the **latest stable release**:

> 💡 **Tip:** View all releases at [Releases Page](https://github.com/databricks-solutions/project-0xfffff/releases)

## Installation
Download project-with-build.zip which includes pre-built frontend assets.

## 📋 Prerequisites

- **Python 3.11+**
- **Node.js 22.16+**
- **Databricks workspace** with:
  - MLflow experiments
  - Databricks Apps
- **Strongly recommended: just**
   - [Installation](https://just.systems/man/en/packages.html)
   - It's possible to use without this, but the majority of useful scripts use just.



## 🚀 Local Development

### Frontend Setup

1. **Navigate to client directory:**
   ```bash
   cd client
   ```

2. **Install Node dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

   The UI will be available at `http://localhost:3000`

4. **Build for production:**
   ```bash
   npm run build
   ```

### Backend Setup

#### Option 1: Using uv (Recommended ⚡)
1. **Create a virtual environment and install dependencies:**
   ```bash
   uv venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   uv pip install -e .
   ```


2. **Run the FastAPI development server in local:**
   ```bash
   uv run uvicorn server.app:app --reload --port 8000
   ```

   The API will be available at `http://localhost:8000`
   API documentation at `http://localhost:8000/docs`

#### Option 2: Using pip (Traditional)

1. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -e .
   # Or for editable install with dev dependencies:
   pip install -e ".[dev]"
   ```

3. **Run the FastAPI development server:**
   ```bash
   uvicorn server.app:app --reload --port 8000
   ```

   The API will be available at `http://localhost:8000`
   API documentation at `http://localhost:8000/docs`


## 🧪 End-to-End (E2E) Tests

E2E tests are run with **Playwright** against a real local stack (FastAPI + Vite) using an **isolated SQLite database**.

```bash
# Run E2E tests headless (default)
just e2e

# Run E2E tests headed (useful for debugging)
just e2e headed

# Run E2E tests in Playwright UI mode
just e2e ui

# Debugging helpers
just e2e-servers   # start API+UI against .e2e-workshop.db
just e2e-test      # run tests (assumes servers are already running)
```

## 🚢 Deploying to Databricks Apps Manually

### 0. Prerequisites

Ensure you have the [Databricks CLI](https://docs.databricks.com/aws/en/dev-tools/cli/tutorial) installed and configured:

```bash
databricks --version
databricks current-user me  # Verify authentication
```

### 1. Create a Databricks App

```bash
databricks apps create human-eval-workshop
```

### 2. Build the Frontend

```bash
cd client && npm install && npm run build && cd ..
```

This creates an optimized production build in `client/build/`

### 3. Sync Files to Workspace

```bash
DATABRICKS_USERNAME=$(databricks current-user me | jq -r .userName)
databricks sync . "/Workspace/Users/$DATABRICKS_USERNAME/human-eval-workshop"
```

Refer to the [Databricks Apps deploy documentation](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/deploy?language=Databricks+CLI#deploy-the-app) for more info.

### 4. Deploy the App

```bash
databricks apps deploy human-eval-workshop \
  --source-code-path /Workspace/Users/$DATABRICKS_USERNAME/human-eval-workshop
```

### 5. Access Your App

Once deployed, the Databricks CLI will provide a URL to access your application.


## ⚙️ Configuration

### Authentication Configuration (`config/auth.yaml`)

Configure facilitator accounts and security settings:

```yaml
facilitators:
  - email: "facilitator@email.com"
    password: "xxxxxxxxxx"
    name: "Workshop Facilitator"
    description: "Primary workshop facilitator"

security:
  default_user_password: "changeme123"
  password_requirements:
    min_length: 8
    require_uppercase: true
    require_lowercase: true
    require_numbers: true
  session:
    token_expiry_hours: 24
    refresh_token_expiry_days: 7
```

## 📄 License

See LICENSE.MD file for details.
