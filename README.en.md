# dsh-subagent-model

A subagent-model plugin for [DSH (DeepSeek Harness)](https://www.npmjs.com/package/@deepseek-ai/dsh).

## Why

By default, DSH spawns subagents on the SAME model as the main agent: run a
flagship model as your main agent and every delegated chore (research,
tidying, review) burns the flagship too - slow and expensive.

This plugin splits the two concerns:

- **Main-agent model**: stays with DSH's native model management (the composer
  model menu left of send, or `/model`). This plugin never touches it.
- **Subagent model**: owned by this plugin. A "Subagent model" menu appears
  immediately LEFT of the native model menu, pinning one global
  `provider / model / reasoning effort` for all delegated subagents.

In one line: the main model does the main work; subagents run on the
(cheaper / specialized) model you choose.

## Features

- **Native-identical UI**: the menu's styling, fonts, and two-level structure
  (level 1: Subagent model / Reasoning effort / Profile; level 2: provider-grouped
  list with sticky group titles + scrolling) is a 1:1 port of the native model
  menu - zero learning curve.
- **Mutually exclusive with the native menu**: open one, then click the other,
  and the first collapses. At most one menu is expanded at any time.
- **Shared catalog**: reads the same per-session model directory the native
  menu uses (`modelDirectories`), so the provider/model/effort lists match the
  native menu exactly and load once.
- **Pick = persist**: selecting a model, effort, or profile persists
  immediately, no save button (same as native).
- **Subagent profiles**: one shared persona + tool surface for every delegated
  subagent (see the next section), sourced from the SAME roster as
  Settings -> Agent presets:
  - built-in: the official presets - Standard / PTC / Minimal / Creative;
  - custom: the plugin-seeded Light-run / Read-only research, plus every
    preset you author in Settings -> Agent presets;
  - on first start the plugin registers Light-run and Read-only research as
    REAL user agent presets (written to `$DSH_HOME/.agent-presets/`), so they
    show up in BOTH this plugin's menu and the Settings page's custom group,
    and renaming / editing / deleting in either place is reflected in the
    other.
- **`delegate_subagent` tool**: subagents dispatched through it actually run
  on the configured model and profile, labelled
  `[provider/model·effort|profile]` in the subagent tree. Supports foreground
  wait, background start (`run_in_background`), and context-inheriting fork
  (`fork`).
- **Delegation policy prompt**: a short injected section nudges the main agent
  to prefer `delegate_subagent` for independent tasks and to report which
  model and profile were used.

## Subagent profiles

DSH deliberately composes every subagent onto its parent's agent preset. This
plugin approximates a per-subagent preset through the public per-child
composition seam - `request.persona` (a shadowing persona section) +
`request.toolFilter` (`{allow?, deny?}` over registered tool names):

- swappable: persona text (shadowing) and the tool surface (allow/deny);
- not swappable: the parent preset's other prompt sections (tool guidance,
  runtime context) and compaction behavior - roughly 90% of a preset.

The profile list is sourced and ordered from the deployment's own preset
roster (both this menu and Settings read `ctx.agentPresets.list()`):

- Inherit (default): no profile, same persona and tools as the main agent;
- built-in: the official presets - Standard / PTC / Minimal / Creative;
- custom: Light-run (lean persona + bash/read/write/edit/glob/grep) and
  Read-only research (read-only retrieval), plus any preset you author in
  Settings -> Agent presets - the two lists never diverge.

### Syncing the seeded profiles with DSH Agent presets

On first start (idempotent, written once) the plugin seeds the two hand-tuned
profiles as REAL user presets under `$DSH_HOME/.agent-presets/quick/` and
`$DSH_HOME/.agent-presets/research/` (`preset.yml` + `agent.cordis.yml`);
after that they are ordinary user presets:

- they appear in Settings -> Agent presets -> custom, where you can rename,
  edit the persona, or delete them;
- this plugin's profile menu reads the SAME `agentPresets.list()` roster, so
  any rename / edit / delete in either place is reflected in the other;
- deleting a seeded profile is respected (the plugin does not regenerate it on
  the next start); to get the factory profiles back, remove
  `$DSH_HOME/data/dsh-subagent-model/seeded-presets.json` and restart.

A preset profile's persona text is taken from the preset's own persona row
(the `persona` row of `agent.cordis.yml`), so editing the persona in Settings
is picked up by delegated subagents too. Presets with a known tool surface
(e.g. Minimal -> bash + str_replace_editor, Light-run, Read-only research)
also get their tools trimmed. A mismatched tool name never fails the
delegation: the plugin degrades to persona-only for that run and surfaces a
hint to fix the profile.

## Composer layout

```
[+]  ............  [Subagent kimi-for-coding off v] [deepseek-chat v] [Send]
                     ^ this plugin                   ^ native model menu
```

## Install

```bash
# 1. Place the package anywhere, e.g.
git clone <this-repo> /root/DSH_exe/dsh-subagent-model

# 2. Declare the dependency + bundle in the web profile's package.json
#    /root/.dsh/profiles/web/package.json
{
  "dependencies": {
    "dsh-subagent-model": "link:/root/DSH_exe/dsh-subagent-model"
  },
  "dsh": { "profile": { "bundles": ["...", "dsh-subagent-model"] } }
}

# 3. Link it (or install with pnpm)
ln -s /root/DSH_exe/dsh-subagent-model \
      /root/.dsh/profiles/web/node_modules/dsh-subagent-model

# 4. Restart dsh-web and hard-refresh the browser (Ctrl+Shift+R)
systemctl restart dsh-web
```

## Usage

1. Open any session; a "Subagent" trigger sits left of the native model menu
   showing the current subagent model and effort.
2. Click it -> pick "Subagent model" or "Reasoning effort" -> click a row in
   the grouped list. The choice persists instantly.
3. Every subagent the main agent dispatches via `delegate_subagent` now runs
   on that model; verify via the `[provider/model·effort]` label.
4. Want the old behavior back? Just select the same model as your main agent.

## Storage

The global subagent model lives in
`$DSH_HOME/data/dsh-subagent-model/config.json`:

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

`reasoningEffort` may be omitted = the model's adapter-default effort.
`profile` may be omitted or `inherit` = same persona and tools as the main
agent; values are `preset:<presetId>` (same roster as Agent presets, including
the seeded `preset:quick` / `preset:research`). Config from the retired
`dsh-model-manager` package is migrated on first start; legacy `quick` /
`research` profile ids are migrated to `preset:quick` / `preset:research`.

## How it works

| Piece | Notes |
| --- | --- |
| Browser `client.js` | Registers the seat in `conversation.input.right` (immediately left of the native model seat); UI ported from the official `dsh-client-ui-model-selection` (same CSS tokens and icons); catalog reuses the shared `modelDirectories` store; selections go to this package's host routes, never to `session.selectModel`, so the current session's main model is never modified. |
| Host `index.js` | Serves `GET /dsh-subagent-model/state` (profile list comes directly from `agentPresets.list()`, same source as Settings; seeds Light-run/Read-only research as user presets on first start) and `POST /dsh-subagent-model/sub`; registers the `delegate_subagent` tool (`ctx.subagents.start` + `agentOptions.{provider,model,reasoningEffort}` + `request.{persona,toolFilter}` profile composition with automatic unknown-tool fallback); injects the delegation policy prompt section. |
| Exclusivity | Both menus close on document-level outside `mousedown`, which yields the either/or behaviour with no synthetic events. |

## Compatibility

- DSH web only (browser UI). The host half needs the `subagents`, `tools`,
  `systemPrompt`, and `webServer` services.
- Requires `dsh-client-ui-model-selection` in the deployment (bundled with the
  official web app).

## License

MIT
