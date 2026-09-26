import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
  testMatch: [
    '**/__tests__/**/*.unit.test.ts',
    '**/__tests__/**/*.integration.test.ts',
  ],
  moduleNameMapper: {
    // Allow integration tests to import across the monorepo boundary
    '^../../../../repo-a-backend/(.*)$': '<rootDir>/../repo-a-backend/$1',
  },
  // ts-jest needs to transform repo-a-backend sources too
  transformIgnorePatterns: ['node_modules'],
};

export default config;
