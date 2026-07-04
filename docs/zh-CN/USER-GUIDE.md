# GSD 用户指南

工作流、故障排除和配置的详细参考。快速入门设置请参阅 [README](README.md)。

---

## 目录

- [工作流图解](#工作流图解)
- [命令参考](#命令参考)
- [配置参考](#配置参考)
- [使用示例](#使用示例)
- [故障排除](#故障排除)
- [恢复快速参考](#恢复快速参考)

---

## 工作流图解

### 完整项目生命周期

```
  ┌──────────────────────────────────────────────────┐
  │                   新建项目                        │
  │  /gsd-new-project                                │
  │  提问 -> 研究 -> 需求 -> 路线图                    │
  └─────────────────────────┬────────────────────────┘
                            │
             ┌──────────────▼─────────────┐
             │      每个阶段:              │
             │                            │
             │  ┌────────────────────┐    │
             │  │ /gsd-discuss-phase │    │  <- 锁定偏好
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /gsd-plan-phase    │    │  <- 研究 + 规划 + 验证
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /gsd-execute-phase │    │  <- 并行执行
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /gsd-verify-work   │    │  <- 手动 UAT
             │  └──────────┬─────────┘    │
             │             │              │
             │     下一阶段?────────────┘
             │             │ 否
             └─────────────┼──────────────┘
                            │
            ┌───────────────▼──────────────┐
            │  /gsd-complete-milestone     │
            └───────────────┬──────────────┘
                            │
                   另一个里程碑?
                       │          │
                      是         否 -> 完成!
                       │
               ┌───────▼──────────────┐
               │  /gsd-new-milestone  │
               └──────────────────────┘
```

### 规划代理协调

```
  /gsd-plan-phase N
         │
         ├── 阶段研究员 (x4 并行)
         │     ├── 技术栈研究员
         │     ├── 功能研究员
         │     ├── 架构研究员
         │     └── 陷阱研究员
         │           │
         │     ┌──────▼──────┐
         │     │ RESEARCH.md │
         │     └──────┬──────┘
         │            │
         │     ┌──────▼──────┐
         │     │   规划者    │  <- 读取 PROJECT.md, REQUIREMENTS.md,
         │     │             │     CONTEXT.md, RESEARCH.md
         │     └──────┬──────┘
         │            │
         │     ┌──────▼───────────┐     ┌────────┐
         │     │   计划检查器     │────>│ 通过?  │
         │     └──────────────────┘     └───┬────┘
         │                                  │
         │                             是   │  否
         │                              │   │   │
         │                              │   └───┘  (循环，最多 3 次)
         │                              │
         │                        ┌─────▼──────┐
         │                        │ PLAN 文件  │
         │                        └────────────┘
         └── 完成
```

### 执行波次协调

```
  /gsd-execute-phase N
         │
         ├── 分析计划依赖
         │
         ├── 波次 1 (独立计划):
         │     ├── 执行者 A (全新 200K 上下文) -> 提交
         │     └── 执行者 B (全新 200K 上下文) -> 提交
         │
         ├── 波次 2 (依赖波次 1):
         │     └── 执行者 C (全新 200K 上下文) -> 提交
         │
         └── 验证器
               └── 根据阶段目标检查代码库
                     │
                     ├── 通过 -> VERIFICATION.md (成功)
                     └── 失败 -> 问题记录到 /gsd-verify-work
```

### 现有代码库工作流

```
  /gsd-map-codebase
         │
         ├── 技术栈映射器     -> codebase/STACK.md
         ├── 架构映射器      -> codebase/ARCHITECTURE.md
         ├── 约定映射器 -> codebase/CONVENTIONS.md
         └── 关注点映射器   -> codebase/CONCERNS.md
                │
        ┌───────▼──────────┐
        │ /gsd-new-project │  <- 问题聚焦于你正在添加的内容
        └──────────────────┘
```

---

## 命令参考

### 核心工作流

| 命令 | 用途 | 何时使用 |
|---------|---------|-------------|
| `/gsd-new-project` | 完整项目初始化：提问、研究、需求、路线图 | 新项目开始时 |
| `/gsd-new-project --auto @idea.md` | 从文档自动初始化 | 有现成的 PRD 或想法文档 |
| `/gsd-discuss-phase [N] [--chain] [--power]` | 捕获实现决策（`--chain` 自动链式，`--power` 文件批量输入） | 规划前，塑造构建方式 |
| `/gsd-plan-phase [N]` | 研究 + 规划 + 验证 | 执行阶段前 |
| `/gsd-execute-phase <N>` | 在并行波次中执行所有计划 | 规划完成后 |
| `/gsd-verify-work [N]` | 带自动诊断的手动 UAT | 执行完成后 |
| `/gsd-complete-milestone` | 归档里程碑，标记发布 | 所有阶段已验证 |
| `/gsd-new-milestone [name]` | 开始下一个版本周期 | 完成里程碑后 |

### 导航

| 命令 | 用途 | 何时使用 |
|---------|---------|-------------|
| `/gsd-progress` | 显示状态和下一步 | 任何时候 -- "我在哪?" |
| `/gsd-resume-work` | 从上次会话恢复完整上下文 | 开始新会话 |
| `/gsd-pause-work` | 保存上下文交接 | 阶段中途停止 |
| `/gsd-help` | 显示所有命令 | 快速参考 |
| `/gsd-update` | 更新 GSD 并预览变更日志 | 检查新版本 |

### 阶段管理

| 命令 | 用途 | 何时使用 |
|---------|---------|-------------|
| `/gsd-add-phase` | 向路线图追加新阶段 | 初始规划后范围增长 |
| `/gsd-insert-phase [N]` | 插入紧急工作（小数编号） | 里程碑中途紧急修复 |
| `/gsd-remove-phase [N]` | 删除未来阶段并重新编号 | 移除某个功能 |
| `/gsd-research-phase [N]` | 仅深度生态研究 | 复杂或不熟悉的领域 |
| `/gsd-autonomous [--from N] [--to N] [--only N]` | 自主执行剩余阶段（`--to N` 到阶段 N 停止） | 批量自动处理 |

### 状态管理

| 命令 | 用途 | 何时使用 |
|---------|---------|-------------|
| `state validate` | 检测 STATE.md 与文件系统之间的偏差 | STATE.md 看起来不对时 |
| `state sync` | 从磁盘上的实际项目状态重建 STATE.md | 验证发现偏差后 |
| `state sync --verify` | 干运行：显示提议的更改但不写入 | sync 前预览 |
| `state planned-phase --phase N --plans N` | 记录 plan-phase 完成后的状态转换 | plan-phase 后 |

### 现有代码库和工具

| 命令 | 用途 | 何时使用 |
|---------|---------|-------------|
| `/gsd-map-codebase` | 分析现有代码库 | 在现有代码上运行 `/gsd-new-project` 之前 |
| `/gsd-quick` | 带 GSD 保证的临时任务 | Bug 修复、小功能、配置更改 |
| `/gsd-debug [desc] [--diagnose]` | 带持久状态的系统化调试（`--diagnose` 仅诊断） | 出问题时 |
| `/gsd-add-todo [desc]` | 捕获想法留待后用 | 会话期间想到什么 |
| `/gsd-check-todos` | 列出待处理事项 | 查看捕获的想法 |
| `/gsd-settings` | 配置工作流开关和模型配置 | 更改模型、切换代理 |
| `/gsd-reapply-patches` | 更新后恢复本地修改 | 如果你有本地编辑，在 `/gsd-update` 后 |

---

## 配置参考

GSD 在 `.planning/config.json` 中存储项目设置。在 `/gsd-new-project` 期间配置或稍后用 `/gsd-settings` 更新。

### 完整 config.json 模式

```json
{
  "mode": "interactive",
  "granularity": "standard",
  "model_profile": "balanced",
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "nyquist_validation": false
  },
  "git": {
    "branching_strategy": "none",
    "phase_branch_template": "gsd/phase-{phase}-{slug}",
    "milestone_branch_template": "gsd/{milestone}-{slug}"
  }
}
```

### 核心设置

| 设置 | 选项 | 默认值 | 控制内容 |
|---------|---------|---------|------------------|
| `mode` | `interactive`, `yolo` | `interactive` | `yolo` 自动批准决策；`interactive` 每步确认 |
| `granularity` | `coarse`, `standard`, `fine` | `standard` | 阶段粒度：范围切分多细（3-5、5-8 或 8-12 个阶段） |
| `model_profile` | `quality`, `balanced`, `budget` | `balanced` | 每个代理的模型层级（见下表） |

### 规划设置

| 设置 | 选项 | 默认值 | 控制内容 |
|---------|---------|---------|------------------|
| `planning.commit_docs` | `true`, `false` | `true` | `.planning/` 文件是否提交到 git |
| `planning.search_gitignored` | `true`, `false` | `false` | 在广泛搜索中添加 `--no-ignore` 以包含 `.planning/` |

> **注意：** 如果 `.planning/` 在 `.gitignore` 中，无论配置值如何，`commit_docs` 自动为 `false`。

### 工作流开关

| 设置 | 选项 | 默认值 | 控制内容 |
|---------|---------|---------|------------------|
| `workflow.research` | `true`, `false` | `true` | 规划前的领域调查 |
| `workflow.plan_check` | `true`, `false` | `true` | 计划验证循环（最多 3 次迭代） |
| `workflow.verifier` | `true`, `false` | `true` | 根据阶段目标的执行后验证 |
| `workflow.nyquist_validation` | `true`, `false` | `false` | 遗留开关（对应功能已移除）；请保持显式 `false` |
| `workflow.security_review` | `auto`, `always`, `off` | `auto` | 按 diff 范围触发的安全审查：`auto` 在改动涉及安全敏感面时触发，`always` 每个阶段都触发 |

在熟悉的领域或需要节省 token 时禁用这些以加速阶段。

### Git 分支

| 设置 | 选项 | 默认值 | 控制内容 |
|---------|---------|---------|------------------|
| `git.branching_strategy` | `none`, `phase`, `milestone` | `none` | 何时以及如何创建分支 |
| `git.phase_branch_template` | 模板字符串 | `gsd/phase-{phase}-{slug}` | 阶段策略的分支名 |
| `git.milestone_branch_template` | 模板字符串 | `gsd/{milestone}-{slug}` | 里程碑策略的分支名 |

**分支策略说明：**

| 策略 | 创建分支 | 范围 | 适用于 |
|----------|---------------|-------|----------|
| `none` | 从不 | N/A | 独立开发、简单项目 |
| `phase` | 每次 `execute-phase` | 每个阶段一个分支 | 每阶段代码审查、细粒度回滚 |
| `milestone` | 第一次 `execute-phase` | 所有阶段共享一个分支 | 发布分支、每个版本一个 PR |

**模板变量：** `{phase}` = 零填充数字（如 "03"），`{slug}` = 小写连字符名称，`{milestone}` = 版本（如 "v1.0"）。

### 模型配置（每个代理分解）

所有命名配置（`quality` / `balanced` / `budget`）现在解析为同一套统一分配 —— 配置键保留只是为了兼容旧配置文件：

| 代理 | 所有命名配置 |
|-------|--------------|
| gsd-planner | Opus |
| gsd-roadmapper | Opus |
| gsd-phase-researcher | Opus |
| gsd-project-researcher | Opus |
| gsd-debugger | Opus |
| gsd-executor | Sonnet |
| gsd-research-synthesizer | Sonnet |
| gsd-codebase-mapper | Sonnet |
| gsd-verifier | Sonnet |
| gsd-plan-checker | Sonnet |
| gsd-integration-checker | Sonnet |

**配置理念：** 规划、路线图、研究和调试对下游质量影响最大且调用频率低，使用 Opus；执行、验证、检查和映射按照 Opus 层产出的明确指令工作，使用 Sonnet。`inherit` 让所有代理跟随当前会话模型（使用非 Anthropic 提供商时必需）。如需单独提升某个代理，可用 `model_overrides` 覆盖（例如把 `gsd-executor` 提到 `opus`）。

---

## 使用示例

### 新项目（完整周期）

```bash
claude --dangerously-skip-permissions
/gsd-new-project            # 回答问题，配置，批准路线图
/clear
/gsd-discuss-phase 1        # 锁定你的偏好
/gsd-plan-phase 1           # 研究 + 规划 + 验证
/gsd-execute-phase 1        # 并行执行
/gsd-verify-work 1          # 手动 UAT
/clear
/gsd-discuss-phase 2        # 对每个阶段重复
...
/gsd-complete-milestone     # 归档，标记，完成
```

### 从现有文档创建新项目

```bash
/gsd-new-project --auto @prd.md   # 从你的文档自动运行研究/需求/路线图
/clear
/gsd-discuss-phase 1               # 从这里开始正常流程
```

### 现有代码库

```bash
/gsd-map-codebase           # 分析现有内容（并行代理）
/gsd-new-project            # 问题聚焦于你正在添加的内容
# （从这里开始正常阶段工作流）
```

### 快速 Bug 修复

```bash
/gsd-quick
> "修复移动端 Safari 上登录按钮无响应的问题"
```

### 中断后恢复

```bash
/gsd-progress               # 查看你停在哪和接下来做什么
# 或
/gsd-resume-work            # 从上次会话完整恢复上下文
```

### 准备发布

```bash
/gsd-complete-milestone     # 归档，标记，完成
```

### 速度与质量预设

| 场景 | 模式 | 粒度 | 配置 | 研究 | 计划检查 | 验证器 |
|----------|------|-------|---------|----------|------------|----------|
| 原型开发 | `yolo` | `coarse` | `budget` | 关 | 关 | 关 |
| 正常开发 | `interactive` | `standard` | `balanced` | 开 | 开 | 开 |
| 生产环境 | `interactive` | `fine` | `quality` | 开 | 开 | 开 |

### 里程碑中途范围变更

```bash
/gsd-add-phase              # 向路线图追加新阶段
# 或
/gsd-insert-phase 3         # 在阶段 3 和 4 之间插入紧急工作
# 或
/gsd-remove-phase 7         # 移除阶段 7 并重新编号
```

---

## 故障排除

### "项目已初始化"

你运行了 `/gsd-new-project` 但 `.planning/PROJECT.md` 已存在。这是安全检查。如果你想重新开始，先删除 `.planning/` 目录。

### 长会话期间上下文退化

在主要命令之间清除上下文窗口：Claude Code 中的 `/clear`。GSD 设计围绕全新上下文 —— 每个子代理获得干净的 200K 窗口。如果主会话质量下降，清除并使用 `/gsd-resume-work` 或 `/gsd-progress` 恢复状态。

### 计划看起来错误或不一致

在规划前运行 `/gsd-discuss-phase [N]`。大多数计划质量问题来自 Claude 做出了 `CONTEXT.md` 本可以防止的假设。你也可以把 `workflow.discuss_mode` 设为 `"assumptions"`，让 GSD 先呈现它的假设供你纠正。

### 执行失败或产生存根

检查计划是否太雄心勃勃。计划最多应有 2-3 个任务。如果任务太大，它们超出了单个上下文窗口可以可靠产生的内容。用更小的范围重新规划。

### 忘记你在哪里

运行 `/gsd-progress`。它读取所有状态文件，准确告诉你位置和下一步。

### 执行后需要更改某些内容

不要重新运行 `/gsd-execute-phase`。使用 `/gsd-quick` 进行针对性修复，或用 `/gsd-verify-work` 通过 UAT 系统识别和修复问题。

### STATE.md 不同步

如果 STATE.md 显示不正确的阶段状态或位置，使用状态一致性命令：

```bash
node gsd-tools.cjs state validate          # 检测 STATE.md 与文件系统之间的偏差
node gsd-tools.cjs state sync --verify     # 预览 sync 将更改的内容
node gsd-tools.cjs state sync              # 从磁盘重建 STATE.md
```

这些命令是 v1.32 新增的，替代了手动编辑 STATE.md。

### 研究门控（Research Gate）

`/gsd-plan-phase` 在规划开始前会检查 RESEARCH.md 是否存在未解决的开放问题。如果存在未解决的问题，规划将被阻止，系统会显示需要解决的具体问题。这防止了基于不完整信息构建计划。

### 模型成本太高

如果领域对你（或 Claude）熟悉，通过 `/gsd-settings` 禁用研究和计划检查代理，以减少 token 消耗。

### 处理敏感/私有项目

在 `/gsd-new-project` 期间或通过 `/gsd-settings` 设置 `commit_docs: false`。将 `.planning/` 添加到 `.gitignore`。规划工件保留在本地，从不接触 git。

### GSD 更新覆盖了我的本地更改

从 v1.17 开始，安装程序将本地修改的文件备份到 `gsd-local-patches/`。运行 `/gsd-reapply-patches` 将你的更改合并回来。

### 子代理似乎失败但工作已完成

存在 Claude Code 分类 bug 的已知解决方法。GSD 的编排器（execute-phase、quick）在报告失败前抽查实际输出。如果你看到失败消息但提交已创建，检查 `git log` —— 工作可能已成功。

---

## 恢复快速参考

| 问题 | 解决方案 |
|---------|----------|
| 丢失上下文 / 新会话 | `/gsd-resume-work` 或 `/gsd-progress` |
| 阶段出错 | `git revert` 阶段提交，然后重新规划 |
| 需要更改范围 | `/gsd-add-phase`、`/gsd-insert-phase` 或 `/gsd-remove-phase` |
| 出问题了 | `/gsd-debug "描述"` |
| STATE.md 不同步 | `state validate` 然后 `state sync` |
| 快速针对性修复 | `/gsd-quick` |
| 计划与你的愿景不符 | `/gsd-discuss-phase [N]` 然后重新规划 |
| 成本过高 | 用 `/gsd-settings` 关闭可选代理 |
| 更新破坏了本地更改 | `/gsd-reapply-patches` |

---

## 项目文件结构

供参考，这是 GSD 在你的项目中创建的内容：

```
.planning/
  PROJECT.md              # 项目愿景和上下文（始终加载）
  REQUIREMENTS.md         # 界定 v1/v2 需求及 ID
  ROADMAP.md              # 带状态跟踪的阶段分解
  STATE.md                # 决策、阻塞项、会话记忆
  config.json             # 工作流配置
  MILESTONES.md           # 已完成里程碑归档
  research/               # 来自 /gsd-new-project 的领域研究
  todos/
    pending/              # 等待处理的捕获想法
    done/                 # 已完成的待办事项
  debug/                  # 活跃调试会话
    resolved/             # 已归档的调试会话
  codebase/               # 现有代码库映射（来自 /gsd-map-codebase）
  phases/
    XX-phase-name/
      XX-YY-PLAN.md       # 原子执行计划
      XX-YY-SUMMARY.md    # 执行结果和决策
      CONTEXT.md          # 你的实现偏好
      RESEARCH.md         # 生态研究发现
      VERIFICATION.md     # 执行后验证结果
```