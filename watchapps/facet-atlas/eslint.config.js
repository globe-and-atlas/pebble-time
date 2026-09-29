'use strict';
// ESLint flat config. Tooling lives in tools/dev (npm --prefix tools/dev install).
var globals = require('./tools/dev/node_modules/globals');

var es5Safe = {
  // PebbleKit JS runtimes differ; keep phone code to ES5 syntax plus Promise.
  ecmaVersion: 5,
  sourceType: 'script',
  globals: Object.assign({}, globals.commonjs, {
    Promise: 'readonly', Uint8Array: 'readonly', Uint16Array: 'readonly', Int16Array: 'readonly',
    Int32Array: 'readonly', Uint32Array: 'readonly', Float32Array: 'readonly', Float64Array: 'readonly',
    DataView: 'readonly', ArrayBuffer: 'readonly'
  })
};

module.exports = [
  { ignores: ['build/**', 'tools/dev/**', 'node_modules/**'] },
  {
    files: ['src/pkjs/**/*.js'],
    languageOptions: es5Safe,
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-redeclare': 'error',
      'eqeqeq': ['error', 'always'],
      'no-var': 'off',
      'strict': ['error', 'global']
    }
  },
  {
    files: ['src/pkjs/index.js'],
    languageOptions: Object.assign({}, es5Safe, {
      globals: Object.assign({}, es5Safe.globals, {
        Pebble: 'readonly', XMLHttpRequest: 'readonly', localStorage: 'readonly', navigator: 'readonly',
        setTimeout: 'readonly', console: 'readonly'
      })
    })
  },
  {
    // pageMain runs in the settings web view, not in pkjs.
    files: ['src/pkjs/config_page.js'],
    languageOptions: Object.assign({}, es5Safe, {
      globals: Object.assign({}, es5Safe.globals, {
        document: 'readonly', location: 'readonly', navigator: 'readonly', confirm: 'readonly', atob: 'readonly'
      })
    })
  },
  {
    files: ['test/**/*.js', 'tools/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], 'no-undef': 'error', 'eqeqeq': ['error', 'always'] }
  }
];
