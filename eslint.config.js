const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['react', 'react-*', 'react-native', 'expo', 'expo-*', '@expo/*'],
          message: 'src/domain must stay free of UI and platform dependencies.',
        }],
      }],
    },
  },
  { ignores: ['node_modules/', '.expo/', 'dist/', 'eslint.config.js', 'metro.config.js'] },
);
