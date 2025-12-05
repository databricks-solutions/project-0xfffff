# Release v1.0.0

## 🎉 Initial Release - Pre-built Client Included

This release includes a pre-built client application so you can clone and run immediately without needing to build the frontend yourself.

## 📦 Quick Start

### Option 1: Use Pre-built Client (Recommended for Quick Setup)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/databricks-solutions/project-0xfffff.git
   cd project-0xfffff
   ```

2. **Download and extract the pre-built client:**
   - Go to the [Releases page](https://github.com/databricks-solutions/project-0xfffff/releases/tag/v1.0.0)
   - Download `client-build.tar.gz`
   - Extract it in the project root:
   ```bash
   tar -xzf client-build.tar.gz
   ```
   This will create the `client/build/` directory with all the necessary files.

3. **Run the server:**
   ```bash
   uv run uvicorn server.app:app --reload --port 8000
   ```

4. **Open your browser:**
   ```
   http://localhost:8000
   ```

### Option 2: Build Client Yourself (For Development)

If you want to modify the client or build from source:

```bash
cd client
npm install
npm run build
cd ..
uv run uvicorn server.app:app --reload --port 8000
```

## ✨ Features in This Release

### Core Functionality
- **Workshop Management**: Create and manage annotation workshops
- **Discovery Phase**: Users explore traces and identify patterns
- **Annotation Phase**: Rate traces based on custom rubrics
- **IRR Analysis**: Calculate inter-rater reliability metrics
- **MLflow Integration**: Import traces from MLflow experiments

### Key Fixes & Improvements

1. **Annotation Editing** - Users can edit previous ratings with smart change detection
2. **Authentication Fix** - Resolved "permission denied" errors requiring page refresh
3. **Comment Handling** - Multi-line comments with proper newline preservation
4. **Rubric Format** - Fixed question parsing with improved delimiter
5. **Trace Randomization** - Per-user randomized but consistent trace ordering
6. **MLflow Deeplink Fix** - Removed trailing slash causing deeplink hangs

## 📋 Requirements

- Python 3.10+
- uv (Python package installer)
- Modern web browser

## 🔧 Configuration

See the main [README.md](README.md) for detailed configuration options including:
- Database setup
- Databricks integration
- Authentication configuration
- Workshop creation

## 📚 Documentation

- [BUILD_GUIDE.md](client/BUILD_GUIDE.md) - Client build instructions
- [AUTHENTICATION_FIX.md](AUTHENTICATION_FIX.md) - Authentication details
- [ANNOTATION_EDITING_FIX.md](ANNOTATION_EDITING_FIX.md) - Annotation editing
- [TRACE_RANDOMIZATION.md](TRACE_RANDOMIZATION.md) - Randomization logic

## 🐛 Known Issues

None at this time. Please report issues on GitHub.

## 📝 License

See [LICENSE.md](LICENSE.md) for details.

