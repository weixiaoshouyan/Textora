// ESLint flat config（ESLint 10 + typescript-eslint 8）
// 规则取向：先跑通（error 级规则少而精），后续再逐步收紧。
// 已知取舍：no-explicit-any 关闭（项目内 IPC 兼容层大量使用 any 保持 Tauri 迁移签名）；
// no-unused-vars 仅警告，避免重构期间的死代码阻塞 CI。
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["dist/**", "release/**", "node_modules/**", "coverage/**", "playwright-report/**", "test-results/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // CommonJS 配置文件（postcss.config.cjs、tailwind.config.js 等）运行在 Node 环境，
  // 需要声明 node globals，否则 js.configs.recommended 的 no-undef 会误报 module/require
  {
    files: ["**/*.{js,cjs}"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        require: "readonly",
        process: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // TS 编译已做类型检查，JS 层的 no-undef 在 TS 文件里会误报
      "no-undef": "off",
      // IPC 兼容层/编辑器插件有历史遗留的 any，先放行
      "@typescript-eslint/no-explicit-any": "off",
      // 死代码仅警告，CI 不阻塞（--max-warnings 0 时可通过清理存量逐步收紧）
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
      // 以下规则关闭原因：
      // - set-state-in-effect：项目大量「统计/镜像同步/存储恢复」模式属合理用法，逐条重构收益低
      // - refs：latest-ref 赋值与事件回调读取是项目既定模式，静态分析误报较多
      // - no-control-regex：htmlSanitizer/shared 用控制字符正则做安全过滤，属合法用途
      // - compiler：React Compiler 辅助规则，对渐进式重构项目误报多（CommandPalette 等）
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/compiler": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "no-control-regex": "off",
    },
  },
  // preload 运行在 sandbox 环境，只能用 require('electron')，无法使用 ESM import
  {
    files: ["src/preload.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
