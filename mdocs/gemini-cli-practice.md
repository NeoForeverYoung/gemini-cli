1. GEMINI.md 是干啥的？

- 是仓库内的贡献与工程实践指南，主要用途：
- 说明提交前要跑的全量检查命令：`npm run preflight`（包含 build、test、typecheck、lint）。
- 测试规范：使用 Vitest，文件位置、mock 方式、异步测试、React/Ink 测试要点等。
- TypeScript/JS 代码风格：偏好普通对象 + 接口/类型声明，避免类、避免 `any`，推荐
  `unknown`；用模块导出控制可见性；数组操作使用 map/filter/reduce 等。
- React 指南：函数组件 +
  Hooks，避免类组件；渲染纯函数；正确使用 effect、依赖和清理；避免直接变更 state；并强调并发兼容、避免过度 useMemo。
- 其他约束：使用 `checkExhaustive`
  做 switch 穷举；flag 使用连字符；仅写高价值注释；主分支名是 main；文档贡献需遵守
  `/docs` 指南和根目录 `CONTRIBUTING.md` 的规范。

简单说：这是提交代码前的质量检查与风格/测试/React/TS 规范总览，确保贡献符合项目标准。
