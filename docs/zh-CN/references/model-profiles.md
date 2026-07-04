# 模型配置

模型配置控制每个 GSD 代理使用哪个 Claude 模型。这允许平衡质量和 token 消耗，或跟随当前会话选择的模型。

## 配置定义

所有命名配置（`quality` / `balanced` / `budget` / `adaptive`）都解析为同一套统一分配 —— 配置键保留只是为了兼容旧配置文件，不再产生差异。`inherit` 将所有代理解析为当前会话模型。

| 代理 | 所有命名配置 | `inherit` |
|-------|--------------|-----------|
| gsd-planner | opus | inherit |
| gsd-roadmapper | opus | inherit |
| gsd-phase-researcher | opus | inherit |
| gsd-project-researcher | opus | inherit |
| gsd-debugger | opus | inherit |
| gsd-executor | sonnet | inherit |
| gsd-research-synthesizer | sonnet | inherit |
| gsd-codebase-mapper | sonnet | inherit |
| gsd-verifier | sonnet | inherit |
| gsd-plan-checker | sonnet | inherit |
| gsd-integration-checker | sonnet | inherit |
| gsd-pattern-mapper | sonnet | inherit |

不在表中的代理（如 gsd-advisor-researcher）通过默认回退解析为 `sonnet`。

**安全审查特殊层级：** execute-phase 的 `security_review_gate` 会按触发方式覆盖模型 —— 硬规则命中（`.env*`/Dockerfile/CI 相关 diff）或 `workflow.security_review: "always"` 时用 **Opus**，`auto` 语义判断触发时用 **Sonnet**。低频高价值路径；该覆盖在生成时传入，不在配置表中。

## 配置理念

**统一分配**（所有命名配置）
- 规划、路线图、研究和调试使用 Opus —— 推理质量对下游影响最大，且调用频率低（每个阶段一次）
- 执行、验证、检查和映射使用 Sonnet —— 它们按照 Opus 层产出的明确指令工作
- 研究质量直接决定计划质量，因此两个研究员都在 Opus 层

**执行者逃生舱**
执行者默认保持 Sonnet（计划承载推理；执行只是实现）。如果某个阶段的实现本身需要顶级推理，只需覆盖执行者而不动配置：

```json
{
  "model_overrides": {
    "gsd-executor": "opus"
  }
}
```

**inherit** - 跟随当前会话模型
- 所有代理解析为 `inherit`
- 适合交互式切换模型的场景（例如 OpenCode 或 Kilo 的 `/model`）
- **使用非 Anthropic 提供商（OpenRouter、本地模型等）时必需** —— 否则 GSD 可能直接调用 Anthropic 模型，产生意外费用

## 解析逻辑

编排器在生成代理前解析模型：

```
1. 读取 .planning/config.json
2. 检查 model_overrides 是否有代理特定覆盖
3. 如果没有覆盖，在统一分配表中查找代理
4. 将 model 参数传递给 Task 调用
```

解析顺序：覆盖 > 配置表 > 默认回退（sonnet）。

## 单代理覆盖

覆盖特定代理而不更改整个配置：

```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "gsd-executor": "opus",
    "gsd-planner": "haiku"
  }
}
```

覆盖优先于配置。有效值：`opus`、`sonnet`、`haiku`。

## 切换配置

通过 `/gsd-settings` 配置，或直接在 `.planning/config.json` 中设置项目默认值：
```json
{
  "model_profile": "balanced"
}
```

## 设计理由

**为什么 gsd-planner 使用 Opus？**
规划涉及架构决策、目标分解和任务设计。这是模型质量影响最大的地方。

**为什么 gsd-executor 使用 Sonnet？**
执行者遵循明确的 PLAN.md 指令。计划已包含推理；执行只是实现。需要时可通过 `model_overrides` 按项目提升。

**为什么验证器使用 Sonnet（而非 Haiku）？**
验证需要目标回溯推理 —— 检查代码是否**交付**了阶段承诺的内容，而不仅仅是模式匹配。Sonnet 处理得很好；Haiku 可能会遗漏细微的差距。

**为什么用 `inherit` 而不是直接传递 `opus`？**
Claude Code 的 `"opus"` 别名映射到特定模型版本。组织可能阻止旧版 opus 而允许新版。GSD 为 opus 级代理返回 `"inherit"`，使其使用用户在会话中配置的任何 opus 版本。这避免了版本冲突和静默回退到 Sonnet。

## 非 Claude 运行时（Codex、OpenCode、Gemini CLI、Kilo）

为非 Claude 运行时安装时，GSD 安装程序会在 `~/.gsd/defaults.json` 中设置 `resolve_model_ids: "omit"`。这会为所有代理返回空的 model 参数，使每个代理使用运行时的默认模型，无需手动设置。

要为不同代理分配不同模型，添加运行时可识别的模型 ID 到 `model_overrides`：

```json
{
  "resolve_model_ids": "omit",
  "model_overrides": {
    "gsd-planner": "o3",
    "gsd-executor": "o4-mini",
    "gsd-debugger": "o3",
    "gsd-codebase-mapper": "o4-mini"
  }
}
```

分层逻辑相同：更强的模型用于规划和调试，更便宜的模型用于执行和映射。
