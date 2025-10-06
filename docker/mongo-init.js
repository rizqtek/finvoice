// MongoDB initialization script for Finvoice

// Switch to the finvoice database
db = db.getSiblingDB('finvoice');

// Create collections with basic indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ createdAt: 1 });

db.invoices.createIndex({ number: 1 }, { unique: true });
db.invoices.createIndex({ clientId: 1 });
db.invoices.createIndex({ status: 1 });
db.invoices.createIndex({ dueDate: 1 });
db.invoices.createIndex({ createdAt: 1 });

db.clients.createIndex({ email: 1 }, { unique: true });
db.clients.createIndex({ name: 1 });

db.projects.createIndex({ name: 1, clientId: 1 }, { unique: true });
db.projects.createIndex({ clientId: 1 });

// Create a sample admin user (password will be hashed by the application)
db.users.insertOne({
  email: 'admin@finvoice.com',
  firstName: 'Admin',
  lastName: 'User',
  roles: ['ADMIN', 'USER'],
  isActive: true,
  isEmailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date()
});

console.log('✅ MongoDB initialization completed for Finvoice');