module.exports = {
  displayName: 'Integration Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.e2e-spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.enum.ts',
    '!src/**/*.type.ts'
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@auth/(.*)$': '<rootDir>/src/modules/auth/$1',
    '^@billing/(.*)$': '<rootDir>/src/modules/billing/$1',
    '^@payment/(.*)$': '<rootDir>/src/modules/payment/$1',
    '^@expense/(.*)$': '<rootDir>/src/modules/expense/$1',
    '^@time/(.*)$': '<rootDir>/src/modules/time/$1',
    '^@client/(.*)$': '<rootDir>/src/modules/client/$1',
    '^@project/(.*)$': '<rootDir>/src/modules/project/$1',
    '^@notification/(.*)$': '<rootDir>/src/modules/notification/$1',
    '^@analytics/(.*)$': '<rootDir>/src/modules/analytics/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
  testTimeout: 30000,
  maxWorkers: 1,
  forceExit: true,
  detectOpenHandles: true,
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))'
  ],
  verbose: true
};