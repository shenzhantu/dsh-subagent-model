// dsh-subagent-model - Host half.
//
// Purpose: DSH spawns subagents on the SAME model as the main agent by
// default, which wastes the (usually expensive) main model on delegated
// chores. This plugin pins a separate GLOBAL subagent model plus a
// per-delegation "profile" (档位).
//
// Responsibilities (kept minimal on purpose):
//   1. Persist the global subagent model
//      ($DSH_HOME/data/dsh-subagent-model/config.json; migrated once from the
//      legacy dsh-model-manager path) and expose GET /state + POST /sub.
//   2. Register the `delegate_subagent` tool so the main agent spawns
//      subagents with the configured model + profile, labelled
//      [provider/model·effort|profile].
//   3. Inject a short delegation policy prompt section.
//
// Profiles (档位) mirror the deployment's OWN agent presets - the SAME list
// the Settings -> Agent 预设 page shows (内置: 标准模式 / PTC 模式 / 极简模式 /
// 创造模式; 自定义: user-authored presets under ~/.dsh/.agent-presets/).
// The plugin's two hand-tuned profiles (轻量执行/quick, 只读研究/research) are
// SEEDED as real user presets on first run, so the 自定义 group has a single
// source of truth: rename / edit / delete them in Settings and this menu
// follows automatically (and vice versa).
//
// A profile is approximated through the PUBLIC per-child composition seam -
// `request.persona` (a shadowing persona section; for presets it is copied
// from the preset's own persona text) + `request.toolFilter` (tool trimming
// where the preset's toolset is known). It is NOT a true preset swap: prompt
// sections beyond the persona still come from the parent's preset.
//
// The MAIN-agent model is NOT managed here - it stays with the official
// model menu (the composer seat left of send, and /model).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

export const name = 'dsh-subagent-model'
export const inject = ['subagents', 'tools', 'systemPrompt', 'webServer', 'agentPresets']

const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'data', 'dsh-subagent-model')
const DATA_FILE = join(DATA_DIR, 'config.json')
const LEGACY_FILE = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'data', 'dsh-model-manager', 'config.json')

// ---------- hand-tuned custom profiles (seeded as REAL user agent presets) ----------
//
// On first run the plugin writes each of these under
// $DSH_HOME/.agent-presets/<id>/ (preset.yml + agent.cordis.yml), the same
// root the Settings -> Agent 预设 page reads. After seeding they are ordinary
// user presets: rename/edit/delete them in Settings and this plugin follows.
//
// TEMPLATE RULE: every row here must carry the config the target plugin's
// zod schema REQUIRES (no defaults). v1.2.0 seeded tool-fs-search without
// `sampleOverCapGlobResults` (required, no default), so selecting such a
// preset as a session's agent preset failed the mount - and as the DEFAULT
// preset it broke every new session. Cross-check each row against the
// official `standard` preset before changing these templates.

const USER_PRESET_ROOT = join(process.env.DSH_HOME || join(homedir(), '.dsh'), '.agent-presets')

// Prefer the agentPresets service's own resolved user root (a deployment may
// configure roots differently); fall back to the conventional path.
function resolveUserPresetRoot(ctx) {
  try {
    const roots = ctx.agentPresets.roots
    for (const root of roots) {
      if (root.trust !== 'user') continue
      const p = root.path.replace(/^~\//, join(homedir(), '') + '/')
      return isAbsolute(p) ? p : join(process.cwd(), p)
    }
  } catch (e) { /* fall through */ }
  return USER_PRESET_ROOT
}

const SEED_PRESETS = [
  {
    id: 'quick',
    name: '轻量执行',
    description: '精简人格，仅保留 bash/read/write/edit/glob/grep 核心工具',
    order: 1,
    persona: '你是一个专注执行的助手：用最少的步骤直接完成任务并返回结果，不写多余的开场、复述与总结。',
    toolFilter: { allow: ['bash', 'read', 'write', 'edit', 'glob', 'grep'] },
    composition: `# 轻量执行 (quick) - seeded by dsh-subagent-model.
# 精简人格 + bash/read/write/edit/glob/grep 核心工具（无 web、无 skill、无子代理）。
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: 你是一个专注执行的助手：用最少的步骤直接完成任务并返回结果，不写多余的开场、复述与总结。
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false
`,
  },
  {
    id: 'research',
    name: '只读研究',
    description: '只读检索（read/glob/grep/web_search），不改动任何文件',
    order: 2,
    persona: '你是一个只读研究助手：只检索与阅读，不创建、不修改、不删除任何文件；结论需给出来源依据。',
    toolFilter: { allow: ['read', 'glob', 'grep', 'web_search'] },
    composition: `# 只读研究 (research) - seeded by dsh-subagent-model.
# 只读检索（read/glob/grep/web_search），不改动任何文件。
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: 你是一个只读研究助手：只检索与阅读，不创建、不修改、不删除任何文件；结论需给出来源依据。
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false
- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetch: false
    searchTimeoutMs: 60000
`,
  },
]

// Tool allow-lists for presets whose registered tool names we know. A preset
// without an entry still contributes its persona; its tool surface stays the
// parent's. `tools.restrict()` rejects unknown names, so never guess here -
// a wrong guess would roll back the whole child creation.
const PRESET_TOOL_ALLOW = {
  minimal: ['bash', 'str_replace_editor'],
  quick: ['bash', 'read', 'write', 'edit', 'glob', 'grep'],
  research: ['read', 'glob', 'grep', 'web_search'],
}

// ---------- seed the two profiles as real user presets (versioned, self-healing) ----------

const SEED_MARKER = join(DATA_DIR, 'seeded-presets.json')

// Bump when a seed template changes; pristine older seeds are self-healed on
// the next start, while user-edited files are always left untouched.
const SEED_VERSION = 2

// The exact compositions seed version 1 wrote. v1 omitted the REQUIRED
// `sampleOverCapGlobResults` config on tool-fs-search (zod: required, no
// default), so the seeded presets failed to mount - and selecting one as the
// default agent preset broke every new session with `new session failed`.
// A disk file still byte-identical to its v1 template is provably untouched
// by the user, so the v2 seed upgrades it in place.
const V1_COMPOSITIONS = {
  quick: `# 轻量执行 (quick) - seeded by dsh-subagent-model.
# 精简人格 + bash/read/write/edit/glob/grep 核心工具（无 web、无 skill、无子代理）。
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: 你是一个专注执行的助手：用最少的步骤直接完成任务并返回结果，不写多余的开场、复述与总结。
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
`,
  research: `# 只读研究 (research) - seeded by dsh-subagent-model.
# 只读检索（read/glob/grep/web_search），不改动任何文件。
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: 你是一个只读研究助手：只检索与阅读，不创建、不修改、不删除任何文件；结论需给出来源依据。
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetch: false
    searchTimeoutMs: 60000
`,
}

function seedPresetYml(preset) {
  return 'name: ' + preset.name + '\n' +
    'description: ' + preset.description + '\n' +
    'order: ' + preset.order + '\n'
}

export function seedUserPresets(ctx) {
  try {
    const root = resolveUserPresetRoot(ctx)
    mkdirSync(root, { recursive: true })
    const marker = (() => { try { return JSON.parse(readFileSync(SEED_MARKER, 'utf8')) } catch { return {} } })()
    if (marker.version === SEED_VERSION) return // up to date; never touch anything again
    for (const preset of SEED_PRESETS) {
      const dir = join(root, preset.id)
      const compPath = join(dir, 'agent.cordis.yml')
      if (!existsSync(compPath)) {
        // Fresh install, a deleted seed, or a broken placeholder directory:
        // write the current template (metadata too, when absent).
        mkdirSync(dir, { recursive: true })
        writeFileSync(compPath, preset.composition, 'utf8')
        if (!existsSync(join(dir, 'preset.yml'))) {
          writeFileSync(join(dir, 'preset.yml'), seedPresetYml(preset), 'utf8')
        }
        continue
      }
      const onDisk = readFileSync(compPath, 'utf8')
      if (onDisk === preset.composition) continue // already current
      if (V1_COMPOSITIONS[preset.id] !== undefined && onDisk === V1_COMPOSITIONS[preset.id]) {
        // Pristine v1 seed (broken template, provably untouched by the user)
        // -> self-heal in place. Only the composition is rewritten; a
        // user-renamed preset.yml keeps its edits.
        writeFileSync(compPath, preset.composition, 'utf8')
      }
      // Otherwise the user authored this id or edited the file -> respect it.
    }
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(SEED_MARKER, JSON.stringify({ version: SEED_VERSION }), 'utf8')
  } catch (e) { /* seeding is best-effort; the menu falls back to hardcoded rows */ }
}

// ---------- preset YAML persona extraction (small, best-effort) ----------

function extractPresetPersona(yamlText) {
  try {
    const row = /(?:^|\n)-\s+id:\s*persona\b[\s\S]*?(?=\n-\s+id:|\s*$)/.exec(yamlText)
    if (!row) return undefined
    const block = row[0]
    const scalar = /\btext:[ \t]*(\|-?|>-?|>|[|])\s*\r?\n((?:[ \t]+[^\n]*\r?\n?)+)/.exec(block)
    if (scalar) {
      const lines = scalar[2].replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '')
      const indent = Math.min(...lines.map((l) => l.match(/^ */)[0].length))
      return lines.map((l) => l.slice(indent)).join('\n').trim() || undefined
    }
    const inline = /\btext:[ \t]*([^\n]+)/.exec(block)
    return inline ? inline[1].trim().replace(/^["']|["']$/g, '') || undefined : undefined
  } catch (e) { return undefined }
}

// ---------- config ----------

function normalizeSub(raw) {
  if (raw && typeof raw === 'object' && typeof raw.provider === 'string' && typeof raw.model === 'string'
      && raw.provider && raw.model) {
    const sub = { provider: raw.provider, model: raw.model }
    if (typeof raw.reasoningEffort === 'string' && raw.reasoningEffort) sub.reasoningEffort = raw.reasoningEffort
    if (typeof raw.profile === 'string' && raw.profile && raw.profile !== 'inherit') sub.profile = raw.profile
    return sub
  }
  return null
}

function loadSubModel() {
  try {
    if (existsSync(DATA_FILE)) return migrateProfile(JSON.parse(readFileSync(DATA_FILE, 'utf8')).sub)
    // one-time migration from the retired dsh-model-manager package
    if (existsSync(LEGACY_FILE)) {
      const legacy = normalizeSub(JSON.parse(readFileSync(LEGACY_FILE, 'utf8')).sub)
      if (legacy) {
        saveSubModel(legacy)
        return migrateProfile(legacy)
      }
    }
  } catch (e) { /* broken file -> unset */ }
  return null
}

// Legacy ids from before these profiles became real user presets.
function migrateProfile(sub) {
  if (!sub || typeof sub.profile !== 'string') return sub
  if (sub.profile === 'quick' || sub.profile === 'research') {
    return { ...sub, profile: 'preset:' + sub.profile }
  }
  return sub
}

function saveSubModel(sub) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(DATA_FILE, JSON.stringify({ sub }, null, 2), 'utf8')
  } catch (e) { /* non-fatal */ }
}

export function apply(ctx) {
  seedUserPresets(ctx)
  let subModel = loadSubModel()

  function readBody(req) {
    return new Promise((resolve) => {
      let data = ''
      req.on('data', (chunk) => { data += chunk })
      req.on('end', () => resolve(data))
      req.on('error', () => resolve(''))
    })
  }
  function sendJson(res, status, obj) {
    const body = JSON.stringify(obj)
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }
  function parseArgs(raw) {
    try {
      const v = JSON.parse(raw || '{}')
      return v && typeof v === 'object' ? v : {}
    } catch (e) { return {} }
  }

  // ---------- profile resolution (for the delegate tool) ----------

  async function resolveProfileDef(id) {
    if (!id || id === 'inherit') return undefined
    // Legacy ids from before these profiles became real presets (and the
    // fallback when seeding did not run).
    const legacy = SEED_PRESETS.find((p) => p.id === id)
    if (legacy) return { id: 'preset:' + id, name: legacy.name, persona: legacy.persona, toolFilter: legacy.toolFilter }
    if (!id.startsWith('preset:')) return undefined // stale id from an older build -> inherit
    const presetId = id.slice('preset:'.length)
    const preset = await ctx.agentPresets.resolve(presetId).then((p) => p, () => undefined)
    if (preset === undefined) return undefined // deleted in Settings -> inherit
    const yaml = await ctx.agentPresets.read(presetId).then((t) => t, () => undefined)
    const persona = yaml === undefined ? undefined : extractPresetPersona(yaml)
    const allow = PRESET_TOOL_ALLOW[presetId]
    const name = typeof preset.name === 'string' ? preset.name : presetId
    return { id, name, persona, toolFilter: allow === undefined ? undefined : { allow } }
  }

  // ---------- routes ----------

  ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subagent-model/state',
    handler: async (_req, res) => {
      const profiles = [{ id: 'inherit', name: '继承', description: '与主 agent 相同的人格与工具面（默认）' }]
      try {
        // The deployment's OWN preset roster - identical ids, display names,
        // descriptions, and ordering to the Settings page's agent-preset list
        // (system -> 内置, user -> 自定义). The two seeded profiles live under
        // the user root, so they appear here AND in Settings, in sync.
        const presets = await ctx.agentPresets.list()
        for (const preset of presets) {
          if (preset.broken !== undefined) continue
          profiles.push({
            id: 'preset:' + preset.id,
            name: typeof preset.name === 'string' && preset.name ? preset.name : preset.id,
            description: typeof preset.description === 'string' ? preset.description : '',
            group: preset.trust === 'user' ? 'custom' : 'builtin',
          })
        }
      } catch (e) { /* presets unavailable -> inherit only */ }
      // Fallback: if seeding never completed (user root missing/unwritable),
      // still surface the two profiles so the feature works; once the seed
      // marker is at the current version, deletions in Settings are respected
      // (true sync).
      const seededOnce = (() => { try { return JSON.parse(readFileSync(SEED_MARKER, 'utf8')).version === SEED_VERSION } catch { return false } })()
      if (!seededOnce) {
        for (const seed of SEED_PRESETS) {
          if (!profiles.some((p) => p.id === 'preset:' + seed.id)) {
            profiles.push({ id: 'preset:' + seed.id, name: seed.name, description: seed.description, group: 'custom' })
          }
        }
      }
      sendJson(res, 200, { sub: subModel, profiles })
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subagent-model/sub',
    handler: async (req, res) => {
      try {
        const args = parseArgs(await readBody(req))
        const provider = String(args.provider || '').trim()
        const model = String(args.model || '').trim()
        // Full selection: provider + model required. Partial update
        // (profile/effort only) is allowed when a selection already exists.
        if ((!provider || !model) && subModel === null) {
          return sendJson(res, 400, { error: '尚未选择子代理模型：请先在「子代理模型」里选择模型' })
        }
        const next = { provider: provider || subModel.provider, model: model || subModel.model }
        // reasoningEffort: absent key = keep; explicit null/'' = provider default
        if ('reasoningEffort' in args) {
          const effort = String(args.reasoningEffort || '').trim()
          if (effort) next.reasoningEffort = effort
        } else if (subModel.reasoningEffort) {
          next.reasoningEffort = subModel.reasoningEffort
        }
        // profile: absent key = keep; explicit null/''/'inherit' = back to inherit
        if ('profile' in args) {
          const raw = typeof args.profile === 'string' ? args.profile.trim() : ''
          if (raw && raw !== 'inherit') next.profile = raw
        } else if (subModel.profile) {
          next.profile = subModel.profile
        }
        subModel = migrateProfile(next)
        saveSubModel(subModel)
        sendJson(res, 200, { ok: true, sub: subModel })
      } catch (e) {
        sendJson(res, 500, { error: String(e && e.message || e) })
      }
    },
  })

  // ---------- delegate_subagent tool ----------

  const tool = {
    name: 'delegate_subagent',
    description: '委派一个子代理，使用 composer 底部「子代理模型」菜单（官方模型菜单左侧）中配置的全局子代理模型与档位（provider/model/思考强度/档位）。档位与「设置 -> Agent 预设」完全同源：官方内置预设（标准/PTC/极简/创造）与用户自建预设都可用，插件预置的 轻量执行/只读研究 也以用户预设形式注册在 Agent 预设的「自定义」里，两边保持同步。档位经人格影子与工具裁剪实现，主 agent 模型与预设不受影响。子代理名字带 [provider/model·强度|档位] 标签，便于在子代理树里识别实际所用模型与档位。',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '给子代理的完整、自包含任务描述' },
        name: { type: 'string', description: '简短任务名，显示在子代理树里' },
        max_tokens: { type: 'number', description: '子代理输出上限（token），可选' },
        run_in_background: { type: 'boolean', description: '后台启动：立即返回 childId，稍后用 send_message 继续获取结果' },
        fork: { type: 'boolean', description: 'fork 模式：子代理继承当前对话上下文（延续分析、基于本线程的 review 才用）' },
      },
      required: ['task'],
    },
    output: {
      schema: { type: 'string' },
      render(_args, value) { return [{ type: 'text', text: value }] },
    },
    async execute(args, exec) {
      if (!args || typeof args.task !== 'string' || !args.task.trim()) {
        throw new Error('delegate_subagent: task 参数缺失或为空')
      }
      const parent = exec.agent
      if (!parent) throw new Error('delegate_subagent 需要调用它的 agent（exec.agent 缺失）')
      if (!subModel) throw new Error('尚未配置子代理模型：请先点击 composer 底部（官方模型菜单左侧）的「子代理模型」菜单选择模型')
      const { provider, model, reasoningEffort } = subModel
      const profileDef = subModel.profile ? await resolveProfileDef(subModel.profile) : undefined
      const profileId = profileDef ? profileDef.id : undefined
      const agentOptions = { provider, model }
      if (reasoningEffort) agentOptions.reasoningEffort = reasoningEffort
      if (typeof args.max_tokens === 'number') agentOptions.maxTokens = args.max_tokens
      const taskName = (typeof args.name === 'string' && args.name.trim()) ? '·' + args.name.trim() : ''
      const label = '[' + provider + '/' + model
        + (reasoningEffort ? '·' + reasoningEffort : '')
        + (profileDef ? '|' + (profileDef.name || profileId) : '')
        + '] 子代理' + taskName
      const modelText = provider + '/' + model + (reasoningEffort ? '·' + reasoningEffort : '')
        + (profileDef ? '｜档位 ' + (profileDef.name || profileId) : '')
      const prompt = [{ type: 'text', text: args.task }]
      const signal = exec.signal

      // Profile composition through the public per-child seam. If the tool
      // filter names a tool this deployment does not register, creation rolls
      // back with "names unknown global tool" - retry once with persona only
      // and surface the mismatch instead of failing the delegation.
      let profileWarning = null
      const compose = (withTools) => {
        const out = {}
        if (profileDef && profileDef.persona) out.persona = profileDef.persona
        if (withTools && profileDef && profileDef.toolFilter) out.toolFilter = profileDef.toolFilter
        return out
      }
      const withFallback = async (run) => {
        try {
          return await run(true)
        } catch (e) {
          const msg = String(e && e.message || e)
          if (profileDef && profileDef.toolFilter && /names unknown global tool/.test(msg)) {
            profileWarning = '档位「' + (profileDef.name || profileId) + '」的工具裁剪本次已跳过（' + msg.split('; known')[0] + '）；仅应用了人格。请修正档位的工具名列表。'
            return run(false)
          }
          throw e
        }
      }

      if (args.fork) {
        const childId = (await withFallback((withTools) => ctx.subagents.startContinuable({
          provider: 'fork',
          label,
          request: { label, prompt, parent, agentOptions, ...compose(withTools) },
          signal,
        }))).childId
        return '已在 ' + modelText + ' 以 fork 模式启动子代理 ' + childId + '（继承当前对话上下文，稍后用 send_message 继续）' + (profileWarning ? '\n[警告] ' + profileWarning : '')
      }

      if (args.run_in_background) {
        const childId = (await withFallback((withTools) => ctx.subagents.startContinuable({
          provider: 'spawn',
          label,
          request: { label, prompt, parent, agentOptions, ...compose(withTools) },
          signal,
        }))).childId
        return '已在 ' + modelText + ' 后台启动子代理 ' + childId + '（稍后用 send_message 获取结果）' + (profileWarning ? '\n[警告] ' + profileWarning : '')
      }

      const run = await withFallback((withTools) => ctx.subagents.start('spawn', {
        label, prompt, parent, agentOptions, signal, ...compose(withTools),
      }))
      const result = await run.result
      let disposeError = null
      try { await run.dispose() } catch (e) { disposeError = String(e) }
      const text = (result.output || [])
        .filter((b) => b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('')
      const warn = profileWarning ? '\n[警告] ' + profileWarning : ''
      if (result.stopReason && result.stopReason !== 'completed') {
        return '子代理在 ' + modelText + ' 未正常完成（stopReason=' + result.stopReason + '）\n' + text + (disposeError ? '\n[note: ' + disposeError + ']' : '') + warn
      }
      return '委派成功，模型 ' + modelText + '\n' + text + (disposeError ? '\n[note: ' + disposeError + ']' : '') + warn
    },
  }
  ctx.tools.register(tool)

  ctx.systemPrompt.section({
    name: 'subagent-model-policy',
    order: 91,
    text: () => '子代理模型策略：需要把独立任务委派给子代理时，优先使用 delegate_subagent 工具--它会使用用户在 composer 底部「子代理模型」菜单（官方模型菜单左侧）配置的全局子代理模型与档位（provider/model/思考强度/档位；档位与「设置 -> Agent 预设」同源：官方内置预设 标准模式/PTC 模式/极简模式/创造模式 与用户自建预设均可用，插件预置的 轻量执行/只读研究 也注册在 Agent 预设的「自定义」分组里并保持同步），主 agent 模型与预设不受影响；子代理树里以 [provider/model·强度|档位] 标签显示实际配置；委派结束后向用户汇报所用模型与档位。',
  })
}
