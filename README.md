# dsh-subagent-model

[DSH (DeepSeek Harness)](https://www.npmjs.com/package/@deepseek-ai/dsh) 子代理模型插件。

## 为什么需要它

DSH 官方默认情况下，主 agent 调用的 subagent **继承主 agent 的同一个模型**：你用旗舰模型当主 agent，委派出去的检索、整理、审计等杂活也全走旗舰模型——既慢又贵，纯属资源浪费。

本插件把两件事拆开：

- **主 agent 模型**：继续用 DSH 官方自带的模型管理（composer 底部发送按钮左侧的模型菜单，或 `/model` 命令），本插件完全不碰。
- **子代理模型**：交给本插件。在官方模型菜单**左侧**多出一个「子代理模型」菜单，为所有委派出去的子代理统一配置 `provider / model / 推理强度`（全局生效）。

一句话：主模型干主活，子代理走你指定的（更便宜/更专用的）模型。

## 功能

- **官方同款 UI**：菜单样式、字体、两级结构（一级：子代理模型 / 推理强度 / 子代理档位；二级：厂商分组列表，粘性分组标题 + 滚动）与官方模型菜单 1:1 一致，零学习成本。
- **与官方菜单互斥**：打开「子代理模型」再点官方模型菜单，前者自动收起（反之亦然），同一时刻最多一个菜单展开。
- **模型目录共享**：读取与官方菜单同一份会话模型目录（`modelDirectories`），厂商/模型/推理强度列表与官方菜单完全同步，只加载一次。
- **点选即存**：选中模型、推理强度或档位立即持久化，无保存按钮（与官方行为一致）。
- **子代理档位**：为所有委派的子代理统一套用一个人格 + 工具面组合（详见下节），与「设置 → Agent 预设」**完全同源**：
  - 内置：官方预设 标准模式 / PTC 模式 / 极简模式 / 创造模式；
  - 自定义：插件预置的 轻量执行 / 只读研究，以及你在「设置 → Agent 预设」里自建的所有预设；
  - 插件首次启动时会把 轻量执行 / 只读研究 **注册为真实的用户 Agent 预设**（写入 `$DSH_HOME/.agent-presets/`），因此它们同时出现在本插件菜单与 DSH 设置页的「自定义」分组里，改名 / 编辑 / 删除任一处都会同步到另一处。
- **`delegate_subagent` 工具**：主 agent 用它委派任务时，子代理真正运行在配置的模型与档位上，并在子代理树中以 `[provider/model·强度|档位]` 标签显示实际配置。支持前台等待、后台启动（`run_in_background`）与 fork 继承上下文（`fork`）。
- **委派策略注入**：向主 agent 注入一段简短 prompt，引导它优先用 `delegate_subagent` 委派独立任务，并在结束后汇报所用模型与档位。

## 子代理档位（profiles）

官方机制里子代理强制"认父"继承主 agent 的预设；本插件通过官方公开的 per-child 组合缝（`request.persona` 人格影子段 + `request.toolFilter` 工具裁剪）近似实现"给子代理换预设"：

- 能换：人格文本（影子替换）、工具面（allow/deny 裁剪）；
- 不能换：父预设除人格外的其他提示段（工具指导、运行时上下文等）与压缩策略，约等于预设效果的 90%。

菜单里的档位列表与「设置 → Agent 预设」**同源同序**（都来自 `ctx.agentPresets.list()`）：

- 继承（默认）：不套用任何档位，与主 agent 相同；
- 内置：官方预设 标准模式 / PTC 模式 / 极简模式 / 创造模式；
- 自定义：插件预置的 轻量执行（精简人格 + bash/read/write/edit/glob/grep）、只读研究（只读检索不改文件），以及你在「设置 → Agent 预设」里自建的预设——两边永远一致。

### 插件预置档位与 DSH Agent 预设的同步

插件首次启动时（幂等，按种子版本管理），把两个手调档位以**真实用户预设**形式写入 `$DSH_HOME/.agent-presets/quick/` 与 `$DSH_HOME/.agent-presets/research/`（`preset.yml` + `agent.cordis.yml`），之后它们就是普通用户预设：

- 在「设置 → Agent 预设 → 自定义」里能看到、能改名、能编辑人格、能删除；
- 本插件的「子代理档位 → 自定义」读的是**同一个** `agentPresets.list()` 名单，所以任何一处的改名 / 编辑 / 删除都会同步反映到另一处；
- 若你删除了某个预置档位，插件不会在下次启动时重新生成（尊重你的删除）；想找回，把 `$DSH_HOME/data/dsh-subagent-model/seeded-presets.json` 删掉再重启即可（会重新写入缺失的预置档位）。

**种子自愈（v1.2.1）**：种子模板带版本号。v1.2.0 的模板漏写了 `tool-fs-search` 的必填配置 `sampleOverCapGlobResults`（官方 schema 必填且无默认值），导致预置预设无法挂载；一旦被设为默认预设，新建会话会直接失败。v1.2.1 修复了模板，并在下次启动时把**仍与旧模板逐字节一致**（即你从未编辑过）的种子文件原地升级到新模板；你编辑过的文件永远原样保留，磁盘上已是正确内容的（如手动修复过的）也不会被改动。

预设档位的人格文本取自该预设自身（`agent.cordis.yml` 的 persona 行），所以你在设置里编辑人格后，委派出去的子代理也会用新人格。已知工具面的预设（如 极简模式 → bash + str_replace_editor、轻量执行、只读研究）还会裁剪工具。工具名与实际注册不符时委派不会失败：插件自动降级为仅人格并在结果中提示修正。

## 效果示意

```
composer 工具栏（输入框底部）：

  [＋] ──────────── ... ── [子代理 kimi-for-coding off ▾] [deepseek-chat ▾] [➤发送]
                                  ↑ 本插件                        ↑ 官方模型菜单
```

```
本插件菜单
├─ 子代理模型   kimi-for-coding ›   （厂商分组的二级列表）
├─ 推理强度     关闭 ›              （所选模型公布的强度）
└─ 子代理档位   极简 ›              （内置 / Agent 预设 / 自定义 三组）
```

## 安装

DSH 插件以 npm 包形式挂载到 web profile：

```bash
# 1. 放置本包（任意路径，例如）
git clone <this-repo> /root/DSH_exe/dsh-subagent-model

# 2. 在 web profile 的 package.json 中声明依赖与 bundle
#    /root/.dsh/profiles/web/package.json
{
  "dependencies": {
    "dsh-subagent-model": "link:/root/DSH_exe/dsh-subagent-model"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "...",
        "dsh-subagent-model"
      ]
    }
  }
}

# 3. 建立 link（或用 pnpm 安装）
ln -s /root/DSH_exe/dsh-subagent-model /root/.dsh/profiles/web/node_modules/dsh-subagent-model

# 4. 重启 dsh-web 并硬刷新浏览器（Ctrl+Shift+R）
systemctl restart dsh-web
```

## 使用

1. 打开任意会话，composer 底部官方模型菜单左侧会出现「子代理」按钮，显示当前子代理模型与推理强度。
2. 点开 → 一级菜单选「子代理模型」「推理强度」或「子代理档位」→ 二级菜单里点选，即选即存。
3. 之后主 agent 所有 `delegate_subagent` 委派的子代理都运行在该模型与档位上；子代理树标签 `[provider/model·强度|档位]` 可直接核对。
4. 想换回默认行为？模型选成与主模型相同、档位选「继承」即可（DSH 原生 subagent 通道不受影响）。

## 配置存储

- 全局子代理模型保存在 `$DSH_HOME/data/dsh-subagent-model/config.json`（默认 `~/.dsh/data/dsh-subagent-model/config.json`）：

```json
{
  "sub": {
    "provider": "kimi-coding",
    "model": "kimi-for-coding",
    "reasoningEffort": "off",
    "profile": "minimal"
  }
}
```

- `reasoningEffort` 可省略 = 使用该模型的适配器默认推理强度。
- `profile` 可省略或 `inherit` = 与主 agent 相同的人格与工具面；取值为 `preset:<预设id>`（与 Agent 预设同源，含插件预置的 `preset:quick` / `preset:research`）。
- 旧版 `dsh-model-manager` 的配置会在首次启动时自动迁移；旧版存储的 `quick` / `research` 档位 id 也会自动迁移为 `preset:quick` / `preset:research`。

## 工作原理

| 部件 | 说明 |
| --- | --- |
| 浏览器端 `client.js` | 在 `conversation.input.right`（官方模型席位左侧）注册「子代理模型」席位；UI 移植自官方 `dsh-client-ui-model-selection`（同一套 CSS token 与图标）；模型目录复用 `modelDirectories` 共享存储；选择写入宿主路由而非 `session.selectModel`，因此**绝不会**改动当前会话主模型。 |
| 宿主端 `index.js` | 提供 `GET /dsh-subagent-model/state`（档位清单直接来自 `agentPresets.list()`，与设置页同源；首次启动把 轻量执行/只读研究 种子化为用户预设）、`POST /dsh-subagent-model/sub` 配置路由；注册 `delegate_subagent` 工具（`ctx.subagents.start` + `agentOptions.{provider,model,reasoningEffort}` + `request.{persona,toolFilter}` 档位组合，未知工具名自动降级）；注入委派策略 prompt 段。 |
| 互斥逻辑 | 两个菜单都用「document 级 mousedown 外点关闭」，天然形成"或"关系，无合成事件。 |

## 兼容性

- 仅支持 DSH web（浏览器端 UI）。宿主端能力依赖 `subagents` / `tools` / `systemPrompt` / `webServer` 服务。
- 需要 DSH 部署自带 `dsh-client-ui-model-selection`（官方 web app 默认包含）。

## License

MIT
