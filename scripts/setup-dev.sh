#!/bin/bash

# Finvoice Development Environment Setup Script

echo "🚀 Starting Finvoice Development Environment"
echo "============================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose > /dev/null 2>&1; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose and try again."
    exit 1
fi

echo "✅ Docker is running"

# Start infrastructure services
echo "📦 Starting infrastructure services (MongoDB, Redis, MinIO, MailHog)..."
docker-compose -f infra/docker-compose.dev.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if MongoDB is ready
echo "🔍 Checking MongoDB connection..."
until docker-compose -f infra/docker-compose.dev.yml exec -T mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
    echo "⏳ Waiting for MongoDB..."
    sleep 2
done
echo "✅ MongoDB is ready"

# Check if Redis is ready
echo "🔍 Checking Redis connection..."
until docker-compose -f infra/docker-compose.dev.yml exec -T redis redis-cli ping > /dev/null 2>&1; do
    echo "⏳ Waiting for Redis..."
    sleep 2
done
echo "✅ Redis is ready"

echo ""
echo "🎉 Development environment is ready!"
echo ""
echo "📋 Service URLs:"
echo "   📄 API Server: http://localhost:3000"
echo "   📚 API Docs: http://localhost:3000/api/docs"
echo "   📊 MongoDB: localhost:27017"
echo "   🗄️ Redis: localhost:6379"
echo "   📧 MailHog: http://localhost:8025"
echo "   📁 MinIO: http://localhost:9001"
echo ""
echo "🔐 Default Credentials:"
echo "   MongoDB: finvoice / finvoice123"
echo "   MinIO: finvoice / finvoice123"
echo ""
echo "📝 Next steps:"
echo "   1. Run 'npm run start:dev' to start the API server"
echo "   2. Visit http://localhost:3000/api/docs for API documentation"
echo "   3. Use Postman collection in docs/ for testing"
echo ""
echo "🛑 To stop services: npm run docker:down"