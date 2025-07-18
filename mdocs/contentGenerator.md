# contentGenerator 模块详解

> 本文档详细介绍了 `packages/core/src/core/contentGenerator.ts` 文件的主要功能、核心类型与方法，并通过代码片段和注释帮助开发者快速理解其实现原理。

---

## 文件定位与作用

该文件为 Gemini CLI 的内容生成核心模块，负责统一封装与 Google Gemini/Vertex AI/Code Assist 等模型的内容生成、流式生成、token 计数、embedding 等能力，并根据不同认证方式动态创建内容生成器。

---

## 主要结构与核心逻辑

### 1. ContentGenerator 接口

定义了内容生成器的标准方法：
- `generateContent`：生成内容（一次性返回）
- `generateContentStream`：流式生成内容（异步生成器）
- `countTokens`：统计 token 数量
- `embedContent`：内容 embedding

```ts
export interface ContentGenerator {
  generateContent(request: GenerateContentParameters): Promise<GenerateContentResponse>;
  generateContentStream(request: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>>;
  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
}
```

### 2. AuthType 枚举

定义了三种认证方式：
- `LOGIN_WITH_GOOGLE`：Google OAuth 登录
- `USE_GEMINI`：Gemini API Key
- `USE_VERTEX_AI`：Vertex AI 认证

```ts
export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
}
```

### 3. ContentGeneratorConfig 类型

描述内容生成器的配置，包括模型名、API Key、认证类型等。

```ts
export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
};
```

### 4. createContentGeneratorConfig

根据传入的模型、认证类型和环境变量，动态生成内容生成器配置。
- 支持优先使用运行时 config 的模型名
- 根据认证类型自动选择 API Key、Vertex AI 配置等
- 支持异步获取有效模型名

```ts
export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
  config?: { getModel?: () => string },
): Promise<ContentGeneratorConfig> { /* ... */ }
```

### 5. createContentGenerator

根据配置创建具体的内容生成器实例：
- Google OAuth 走 Code Assist 生成器
- Gemini/Vertex AI 走 GoogleGenAI SDK
- 自动注入 User-Agent
- 不支持的认证类型抛出异常

```ts
export async function createContentGenerator(
  config: ContentGeneratorConfig,
  sessionId?: string,
): Promise<ContentGenerator> { /* ... */ }
```

---

## 典型调用流程

1. 生成内容生成器配置：
   ```ts
   const config = await createContentGeneratorConfig('gemini-pro', AuthType.USE_GEMINI);
   ```
2. 创建内容生成器实例：
   ```ts
   const generator = await createContentGenerator(config);
   ```
3. 生成内容：
   ```ts
   const response = await generator.generateContent({ model: config.model, contents: [...] });
   ```
4. 流式生成内容：
   ```ts
   for await (const chunk of await generator.generateContentStream({ ... })) {
     console.log(chunk);
   }
   ```

---

## 关键特性总结

- **统一内容生成接口**：无论底层模型如何，均暴露一致的内容生成、流式生成、token 计数、embedding 能力。
- **多认证方式支持**：支持 Google OAuth、Gemini API Key、Vertex AI 三种认证。
- **自动配置与模型选择**：根据环境变量和参数自动选择模型与 API Key。
- **易于扩展**：接口与工厂方法设计便于后续扩展更多模型或认证方式。

---

## 参考
- [Google Gemini API 文档](https://ai.google.dev/)
- [js-genai 源码](https://github.com/googleapis/js-genai) 