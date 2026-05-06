import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import loderunnerBase from "eslint-config-loderunner/base";
import loderunnerTs from "eslint-config-loderunner/typescript";
import loderunnerReact from "eslint-config-loderunner/react";
import loderunnerFormatting from "eslint-config-loderunner/formatting";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...loderunnerBase,
  ...loderunnerTs,
  ...loderunnerReact,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // *.config.ts is in tsconfig already; .mjs files are not — allow only the latter
          // to avoid "found in both project service and allowDefaultProject" errors.
          allowDefaultProject: ["*.config.mjs"],
        },
      },
    },
    rules: {
      // next/core-web-vitals handles React import; suppress loderunner duplicate
      "react/react-in-jsx-scope": "off",
      // next already validates this; loderunner's react/prop-types is redundant in TS
      "react/prop-types": "off",
    },
  },
  ...loderunnerFormatting,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agents/**",
  ]),
]);

export default eslintConfig;
