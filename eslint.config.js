const js = require("@eslint/js");
const ts = require("typescript-eslint");
const globals = require("globals");
const hooks = require("eslint-plugin-react-hooks");
const refresh = require("eslint-plugin-react-refresh");

module.exports = ts.config(
  { ignores: ["**/dist/**", "**/test-results/**", "**/playwright-report/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": hooks, "react-refresh": refresh },
    rules: {
      ...hooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
);
