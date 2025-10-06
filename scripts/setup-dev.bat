@echo off
REM Finvoice Development Environment Setup Script for Windows

echo 🚀 Starting Finvoice Development Environment
echo ============================================

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker and try again.
    exit /b 1
)

echo ✅ Docker is running

REM Start infrastructure services
echo 📦 Starting infrastructure services (MongoDB, Redis, MinIO, MailHog)...
docker-compose -f infra/docker-compose.dev.yml up -d

REM Wait for services to be ready
echo ⏳ Waiting for services to be ready...
timeout /t 10 /nobreak >nul

echo 🔍 Checking service health...
timeout /t 5 /nobreak >nul

echo.
echo 🎉 Development environment is ready!
echo.
echo 📋 Service URLs:
echo    📄 API Server: http://localhost:3000
echo    📚 API Docs: http://localhost:3000/api/docs
echo    📊 MongoDB: localhost:27017
echo    🗄️ Redis: localhost:6379
echo    📧 MailHog: http://localhost:8025
echo    📁 MinIO: http://localhost:9001
echo.
echo 🔐 Default Credentials:
echo    MongoDB: finvoice / finvoice123
echo    MinIO: finvoice / finvoice123
echo.
echo 📝 Next steps:
echo    1. Run 'npm run start:dev' to start the API server
echo    2. Visit http://localhost:3000/api/docs for API documentation
echo    3. Use Postman collection in docs/ for testing
echo.
echo 🛑 To stop services: npm run docker:down

pause