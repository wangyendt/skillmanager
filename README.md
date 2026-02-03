# skillmanager（`@wang121ye/skillmanager`）

跨平台（Windows / Linux / macOS）的 **Agent Skills 管理器**：把「官方 skills + 第三方 skills 仓库 + 你自己的 skills 仓库」统一做 **安装（install）**，并可选用 **Web UI 交互式勾选**来安装子集。

本项目 **基于 `openskills`** 实现安装与 `AGENTS.md` 同步。

## 环境要求与兼容性（重要）

`skillmanager` 会调用系统里的 `git` 拉取/更新 skills 来源仓库，并通过 `openskills` 执行安装与 `AGENTS.md` 同步。因此你的环境版本过低时，可能出现“看起来配置没问题但某些机器上失败”的情况。

- **Node.js（用于运行 openskills）**：建议 **>= 20.6.0**
  - 低于该版本可能出现语法错误（例如依赖使用了 RegExp `/v` flag）。
- **openskills**：建议 **>= 1.5.0**（本项目依赖与运行时行为以该版本为基准）
- **git**：建议 **>= 2.34.0**
  - 低版本在 GitHub HTTPS + partial clone（如 `--filter=blob:none`）场景下，可能更容易遇到 TLS/gnutls 相关中断（如 `gnutls_handshake()`）。

常见规避方案：

- **升级 git / Node / openskills**（推荐根治）
- **改用 SSH 拉取 GitHub 仓库**（绕开 HTTPS/TLS）：

```bash
export SKILLMANAGER_GIT_PROTOCOL=ssh
skillmanager webui
```

- **降低并发**（网络/中间设备对并发连接敏感时）：

```bash
skillmanager webui --concurrency 1
```

## 安装与使用

### 全局安装（推荐）

```bash
npm i -g @wang121ye/skillmanager
skillmanager install
```

### 直接 npx（无需安装）

```bash
npx @wang121ye/skillmanager install
```

> 说明：你最初写的 `npx skillmanager bootstrap` 只有在发布"非 scope 包名"时才成立。  
> 现在按 scoped 包发布为 `@wang121ye/skillmanager`，对应 npx 用法是 `npx @wang121ye/skillmanager ...`，但执行的命令名仍然叫 `skillmanager`（由 `bin` 决定）。

## 关键能力

### 1) 一键安装（默认装"全部来源的全部 skills"）

```bash
skillmanager install
```

### 2) 安装时启用 Web UI 选择（默认全选，可批量全选/全不选/反选/搜索）

```bash
skillmanager webui
```

你也可以用某个 profile 名称（会保存选择集到该 profile）。**多数情况下不需要显式传 `--profile`**，直接用默认 profile（通常是 `default` 或你在 `skillmanager config set-default-profile` 里设置的值）即可：

```bash
skillmanager webui --profile laptop
skillmanager install --profile laptop
```

## 把 `--profile laptop` 设为默认（推荐）

设置一次默认 profile 后，绝大多数命令都可以不写 `--profile`：

```bash
skillmanager config set-default-profile laptop
skillmanager webui
skillmanager install
```

你也可以用环境变量临时覆盖默认 profile：

```bash
SKILLMANAGER_PROFILE=laptop skillmanager webui
```

## 配置同步：换电脑快速部署

`skillmanager` 支持将配置上传到云端（如阿里云 OSS、AWS S3 等），换电脑时一键拉取，实现配置同步。

**同步内容包括：**
- ✅ `sources.json` - 所有 skills 来源仓库配置
- ✅ `profiles/[profile].json` - 选中的 skills 列表

> 安全提示：**开放公共写权限非常危险**，任何人都可以篡改你的配置。更安全的做法是使用签名 URL、私有桶 + 凭证、或 Git 私有仓库。

### 1) 设置远端基础 URL（只需一次）

```bash
skillmanager config set-remote-profile-url https://<bucket>.<region>.aliyuncs.com/skillmanager/
```

注意：
- URL 是**基础路径**（以 `/` 结尾），工具会自动拼接 `sources.json` 和 `profiles/[profile].json`
- 需要在云存储服务中设置相应目录的读写权限

**阿里云 OSS 权限配置示例：**

在 OSS 控制台的 "Bucket 授权策略" 中添加：
- 授权资源：`your-bucket/skillmanager/*` （注意 `/*` 通配符）
- 授权操作：读/写（或 `PutObject`、`GetObject`）

你也可以不写入本地配置，改用环境变量（更适合 CI/临时机器）：

```bash
export SKILLMANAGER_PROFILE_URL=https://<bucket>.<region>.aliyuncs.com/skillmanager/
```

### 2) 推送配置到云端

```bash
# 使用默认 profile
skillmanager config push

# 指定 profile 名称
skillmanager config push --profile laptop
```

**推送内容：**
- `sources.json` → `https://...com/skillmanager/sources.json`
- `profiles/laptop.json` → `https://...com/skillmanager/profiles/laptop.json`

### 3) 新电脑拉取配置

```bash
# 使用默认 profile
skillmanager config pull

# 指定 profile 名称
skillmanager config pull --profile laptop
```

**拉取后直接安装：**

```bash
skillmanager config pull --profile laptop
skillmanager install --profile laptop
```

### 3) 安装位置（交给 openskills）

- 默认：项目级（`./.claude/skills`）
- `--global`：全局（`~/.claude/skills`）
- `--universal`：使用通用目录（`.agent/skills` / `~/.agent/skills`）

示例：

```bash
skillmanager install --global --universal
```

### 4) 同步 `AGENTS.md`

默认会执行 `openskills sync`（输出到当前目录的 `AGENTS.md`）。

- 指定输出文件：

```bash
skillmanager install --output AGENTS.md
```

- 跳过同步：

```bash
skillmanager install --no-sync
```

### 5) dry-run（只打印要装什么，不实际安装）

```bash
skillmanager install --dry-run
```

## 更方便地添加/管理第三方仓库

以后不需要手动去编辑 `sources.json`，可以直接用命令写入用户配置：

```bash
skillmanager source add https://github.com/obra/superpowers
skillmanager source add ComposioHQ/awesome-claude-skills
skillmanager source list
```

禁用/启用/删除：

```bash
skillmanager source disable superpowers
skillmanager source enable superpowers
skillmanager source remove superpowers
```

> `source add` 支持输入 `owner/repo` 或 GitHub URL（也支持 `git@github.com:owner/repo.git`）。

## 更新已安装 skills（无论哪种来源）

### 默认更新（推荐）

这会调用 `openskills update` 更新所有 openskills 已记录的来源，然后重新 `sync`：

```bash
skillmanager update
```

### 如果你用了 profile 做"子集安装"（Web UI 勾选）

因为子集安装是按"本地目录复制安装"（为了兼容 Windows 下 openskills 的本地路径识别问题），`openskills update` 不一定能自动追踪来源；此时用 profile 方式更新最稳：

```bash
skillmanager update --profile laptop
```

需要临时调整选择集：先用 Web UI 更新 profile，再执行 update：

```bash
skillmanager webui --profile laptop
skillmanager update --profile laptop
```

## 卸载 skills

### 用 Web UI 勾选要卸载的已安装 skills（推荐）

```bash
skillmanager webui --mode uninstall
```

### 直接按名称卸载

```bash
skillmanager uninstall algorithmic-art xlsx
```

### 清空目标目录（危险操作，需要显式 --all）

```bash
skillmanager uninstall --all
```

## Skills 来源配置（官方 / 第三方 / 你自己的）

skillmanager 会在第一次运行时，把内置的 `manifests/sources.json` 复制到你的用户配置目录，之后你只需要编辑 **用户配置文件**即可：

```bash
skillmanager paths
```

会打印出类似：

- `manifest: C:\Users\<you>\AppData\Roaming\skillmanager\sources.json`（Windows）
- macOS/Linux 则在 `~/.config/skillmanager/sources.json` 附近

`sources.json` 里维护三类来源（你可以继续追加第三方仓库）：

- 官方：`anthropics/skills`
- 你的：`wangyendt/wayne-skills`
- 第三方：自行添加（`enabled: true`）

## 发布到 npm（给你未来用）

你要发布 scoped 包到 npm，一般是：

```bash
npm login
npm publish --access public
```

（你提到的 npm 账号是 `wang121ye`：确保你拥有 `@wang121ye` scope 的发布权限；发布 scoped 包通常需要 `npm publish --access public`，本项目已在 `publishConfig` 里默认设置为 public。）
