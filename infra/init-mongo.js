// MongoDB initialization script
db = db.getSiblingDB('finvoice');

// Create collections
db.createCollection('invoices');
db.createCollection('payments');
db.createCollection('expenses');
db.createCollection('clients');
db.createCollection('users');
db.createCollection('timeentries');

// Create indexes for better performance
db.invoices.createIndex({ "invoiceNumber": 1 }, { unique: true });
db.invoices.createIndex({ "clientId": 1 });
db.invoices.createIndex({ "status": 1 });
db.invoices.createIndex({ "issueDate": 1 });
db.invoices.createIndex({ "dueDate": 1 });

db.payments.createIndex({ "invoiceId": 1 });
db.payments.createIndex({ "status": 1 });
db.payments.createIndex({ "gatewayTransactionId": 1 });

db.expenses.createIndex({ "employeeId": 1 });
db.expenses.createIndex({ "status": 1 });
db.expenses.createIndex({ "category": 1 });
db.expenses.createIndex({ "expenseDate": 1 });

db.clients.createIndex({ "email": 1 }, { unique: true });
db.clients.createIndex({ "name": 1 });
db.clients.createIndex({ "isActive": 1 });

db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "role": 1 });

db.timeentries.createIndex({ "employeeId": 1 });
db.timeentries.createIndex({ "projectId": 1 });
db.timeentries.createIndex({ "date": 1 });

print('Database initialization completed successfully!');