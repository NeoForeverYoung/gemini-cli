# fileDiscoveryService 模块详解

> 本文档详细介绍了 `packages/core/src/services/fileDiscoveryService.ts` 文件的主要功能、核心类与方法，并通过代码片段和注释帮助开发者快速理解其实现原理。

---

## 文件定位与作用

该文件实现了文件发现与过滤服务，主要用于根据 `.gitignore` 和 `.geminiignore` 规则过滤项目文件，帮助工具链只处理未被忽略的文件。

---

## 主要结构与核心逻辑

### 1. 关键常量

- `GEMINI_IGNORE_FILE_NAME`：指定自定义忽略文件名 `.geminiignore`

### 2. FilterFilesOptions 接口

定义过滤文件时的选项：
- `respectGitIgnore`：是否遵循 `.gitignore` 规则
- `respectGeminiIgnore`：是否遵循 `.geminiignore` 规则

```ts
export interface FilterFilesOptions {
  respectGitIgnore?: boolean;
  respectGeminiIgnore?: boolean;
}
```

### 3. FileDiscoveryService 类

#### 构造函数
- 初始化项目根目录
- 加载 `.gitignore` 和 `.geminiignore` 规则

```ts
constructor(projectRoot: string) {
  this.projectRoot = path.resolve(projectRoot);
  if (isGitRepository(this.projectRoot)) {
    const parser = new GitIgnoreParser(this.projectRoot);
    try { parser.loadGitRepoPatterns(); } catch { /* 忽略未找到 */ }
    this.gitIgnoreFilter = parser;
  }
  const gParser = new GitIgnoreParser(this.projectRoot);
  try { gParser.loadPatterns(GEMINI_IGNORE_FILE_NAME); } catch { /* 忽略未找到 */ }
  this.geminiIgnoreFilter = gParser;
}
```

#### filterFiles
- 根据 ignore 规则过滤文件列表

```ts
filterFiles(filePaths: string[], options: FilterFilesOptions = { ... }): string[] {
  return filePaths.filter((filePath) => {
    if (options.respectGitIgnore && this.shouldGitIgnoreFile(filePath)) return false;
    if (options.respectGeminiIgnore && this.shouldGeminiIgnoreFile(filePath)) return false;
    return true;
  });
}
```

#### shouldGitIgnoreFile / shouldGeminiIgnoreFile
- 判断单个文件是否应被 `.gitignore` 或 `.geminiignore` 忽略

```ts
shouldGitIgnoreFile(filePath: string): boolean { /* ... */ }
shouldGeminiIgnoreFile(filePath: string): boolean { /* ... */ }
```

#### shouldIgnoreFile
- 综合判断文件是否应被忽略（可选是否遵循各 ignore 规则）

```ts
shouldIgnoreFile(filePath: string, options: FilterFilesOptions = {}): boolean { /* ... */ }
```

#### getGeminiIgnorePatterns
- 获取 `.geminiignore` 文件中加载的所有规则

```ts
getGeminiIgnorePatterns(): string[] { /* ... */ }
```

---

## 典型调用流程

1. 创建服务实例：
   ```ts
   const fds = new FileDiscoveryService('/path/to/project');
   ```
2. 过滤文件列表：
   ```ts
   const filtered = fds.filterFiles(['src/a.ts', 'node_modules/b.js']);
   ```
3. 判断单个文件是否被忽略：
   ```ts
   const ignored = fds.shouldIgnoreFile('node_modules/b.js');
   ```
4. 获取 .geminiignore 规则：
   ```ts
   const patterns = fds.getGeminiIgnorePatterns();
   ```

---

## 关键特性总结

- **支持多种 ignore 规则**：同时支持 `.gitignore` 和自定义 `.geminiignore`。
- **灵活过滤选项**：可按需选择是否遵循各类 ignore 规则。
- **便于集成**：适合在文件处理、批量操作等场景下快速过滤有效文件。

---

## 参考
- [gitignore 语法说明](https://git-scm.com/docs/gitignore) 