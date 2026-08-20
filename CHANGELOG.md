# Changelog

## v1.2.1

### Fixed

- **Critical: seeded presets failed to mount** (`new session failed` when a
  seeded preset was selected as the default agent preset). The v1.2.0 seed
  templates mounted `@deepseek-ai/dsh-tool-fs-search` without a `config`
  block, but that plugin's zod schema declares `sampleOverCapGlobResults` as
  **required with no default** - so every mount of the seeded 轻量执行 (quick)
  / 只读研究 (research) presets failed validation. Selecting such a preset as
  the session default then broke new-session creation entirely (the error was
  only visible in the browser console).
  - Fixed both seed templates (`quick` and `research`) to carry
    `config: sampleOverCapGlobResults: false`, matching the official
    `standard` preset.
  - **Seed self-healing**: seed templates are now version-managed. On the
    next start the plugin upgrades any seed file still byte-identical to the
    broken v1 template (i.e. never edited by the user) in place; files the
    user edited are always left untouched, and disks already carrying the
    correct content (e.g. fixed by hand) are not modified.
  - Audited every other row in the seed templates against the target plugins'
    zod schemas (`dsh-persona`, `dsh-tool-bash`, `dsh-tool-fs`,
    `dsh-tool-web`): all required fields are present, remaining fields have
    defaults.

## v1.2.0

### Added

- Profiles (档位) are now fully synced with Settings -> Agent 预设: the menu
  reads the same `agentPresets.list()` roster as the Settings page.
- The two hand-tuned profiles (轻量执行/quick, 只读研究/research) are seeded
  as REAL user agent presets under `$DSH_HOME/.agent-presets/` on first run,
  so they appear in both the plugin menu and the Settings custom group, and
  rename/edit/delete in either place is reflected in the other.
- Persona text for a seeded preset is read from the preset file itself, so
  editing the persona in Settings propagates to delegated subagents.
- Legacy config migration: `profile: "quick"` / `"research"` stored by older
  builds migrates to `preset:quick` / `preset:research`.

## v1.1.0

- Menu structure mirrors the official Settings -> Agent 预设 page: 内置
  (standard/PTC/minimal/cordis with official Chinese names) + 自定义 (user
  presets auto-discovered).

## v1.0.0

- Initial release: subagent model seat (provider/model/reasoning effort) left
  of the native model menu, `delegate_subagent` tool, 1:1 port of the native
  ModelSelect UI.
