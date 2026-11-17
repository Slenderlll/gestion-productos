'use strict';

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/helpers/entorno.js'],
  // MongoDB en memoria puede tardar en arrancar la primera vez (descarga el binario)
  testTimeout: 60000,
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coverageThreshold: {
    global: { statements: 90, branches: 80, functions: 90, lines: 90 },
  },
};
