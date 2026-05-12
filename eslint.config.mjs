import { defineConfig, globalIgnores } from 'eslint/config';
import loderunnerBase from 'eslint-config-loderunner/base';
import loderunnerFormatting from 'eslint-config-loderunner/formatting';
import loderunnerImport from 'eslint-config-loderunner/import';
import loderunnerReact from 'eslint-config-loderunner/react';
import loderunnerTs from 'eslint-config-loderunner/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...loderunnerBase,
  ...loderunnerTs,
  ...loderunnerReact,
  ...loderunnerImport,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // *.config.ts is in tsconfig already; .mjs/.cjs files are not — allow only the
          // latter to avoid "found in both project service and allowDefaultProject" errors.
          allowDefaultProject: ['*.config.{mjs,cjs}'],
        },
      },
    },
  },
  {
    rules: {
      // next/core-web-vitals handles React import; suppress loderunner duplicate
      'react/react-in-jsx-scope': 'off',
      // next already validates this; loderunner's react/prop-types is redundant in TS
      'react/prop-types': 'off',
      'import/no-deprecated': 'warn',
      '@typescript-eslint/no-deprecated': 'warn',
    },
  },
  ...loderunnerFormatting,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.agents/**',
  ]),
]);

export default eslintConfig;
