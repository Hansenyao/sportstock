import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^resend$':         '<rootDir>/tests/__mocks__/resend.ts',
    '^firebase-admin$': '<rootDir>/tests/__mocks__/firebase-admin.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testTimeout: 20000,
  verbose: true,
  forceExit: true,
};

export default config;
