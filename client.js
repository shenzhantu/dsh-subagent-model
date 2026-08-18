// dsh-subagent-model - Client half (browser).
//
// One seat: the "子代理模型" trigger in the composer toolbar
// (conversation.input.right - immediately LEFT of the native model seat,
// which itself sits just left of send). The MAIN-agent model stays with the
// native model menu; this plugin only edits the GLOBAL subagent model.
//
// UI is a faithful port of the native ModelSelect (dsh-client-ui-model-selection):
//   - identical CSS (copied from the official stylesheet, re-prefixed dsm_)
//   - identical two-level menu: root pane = 子代理模型 / 推理强度 cells,
//     model pane = provider-grouped list with sticky group titles + scroll,
//     effort pane = the selected model's adapter-published efforts
//   - identical trigger anatomy (label + caption effort + rotating chevron)
//   - identical open/close semantics: document-level outside `mousedown`
//     closes, so this menu and the native model menu are mutually exclusive
//     (opening either one collapses the other) without any synthetic events.
//
// The model catalog rides the SHARED per-session ModelDirectory
// (`modelDirectories.directoryFor(sessionId)`) - the same store the native
// /model popup and composer seat use - so groups stay in sync and are loaded
// once. Selections are NOT submitted through the directory (that would switch
// the main model); they are persisted to this package's host routes
// (GET /dsh-subagent-model/state, POST /dsh-subagent-model/sub).

window.__ModuleLoader__.load({
  id: 'dsh-subagent-model',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useRef = React.useRef
    var useId = React.useId
    var useSyncExternalStore = React.useSyncExternalStore

    var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    var IconChevronDown = primitives.IconChevronDownOutline14
    var IconChevronRight = primitives.IconChevronRightOutline14
    var IconCheck = primitives.IconCheckOutline16
    var IconWarning = primitives.IconWarningOutline16
    var Toast = primitives.Toast

    var CSS = '.dsm_root{min-width:0;position:relative}.dsm_trigger{min-width:0;max-width:220px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex}.dsm_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dsm_trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.dsm_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dsm_triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.dsm_triggerEffort{color:var(--dsw-alias-label-caption);flex:none}.dsm_chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}.dsm_chevronOpen{transform:rotate(180deg)}.dsm_menu{z-index:20;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:min(240px,100vw - 32px);max-height:min(360px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:hidden}.dsm_status,.dsm_empty{color:var(--dsw-alias-label-tertiary);padding:10px;font-size:13px;line-height:20px}.dsm_error,.dsm_warning{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;padding:7px 8px;font-size:12px;line-height:18px;display:flex}.dsm_warning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}.dsm_retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600}.dsm_groups{min-height:0;overflow-y:auto}.dsm_group+.dsm_group{margin-top:4px}.dsm_groupTitle{z-index:1;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);padding:5px 8px 3px;font-size:12px;font-weight:500;line-height:18px;position:sticky;top:0}.dsm_option{width:100%;min-height:38px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:10px;outline:none;align-items:center;gap:8px;padding:6px 8px;display:flex}.dsm_option:hover:not(:disabled),.dsm_option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.dsm_selected{background:0 0}.dsm_option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dsm_optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}.dsm_modelName{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;line-height:20px;overflow:hidden}.dsm_description{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;overflow:hidden}.dsm_check{color:var(--dsw-alias-label-primary);flex:0 0 18px;place-items:center;display:grid}.dsm_cell{width:100%;height:40px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;border-radius:10px;align-items:center;gap:8px;padding:0 10px;font-size:14px;line-height:22px;display:flex}.dsm_cell:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsm_cellLabel{text-overflow:ellipsis;white-space:nowrap;flex:auto;min-width:0;overflow:hidden}.dsm_cellValue{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-tertiary);flex:0 auto;overflow:hidden}.dsm_cellChevron{color:var(--dsw-alias-label-tertiary);flex:none}.dsm_prefix{color:var(--dsw-alias-label-caption);flex:none}'

    var STYLE_ATTR = 'dsh-subagent-model-css'

    function cx() {
      var out = ''
      for (var i = 0; i < arguments.length; i++) {
        var e = arguments[i]
        if (!e) continue
        if (typeof e === 'string' || typeof e === 'number') { if (out) out += ' '; out += e }
      }
      return out
    }

    // Minimal class-component error boundary (never breaks the composer row).
    function Boundary(props) { this.props = props }
    Boundary.prototype.isReactComponent = {}
    Boundary.prototype.state = { failed: false }
    Boundary.getDerivedStateFromError = function () { return { failed: true } }
    Boundary.prototype.render = function () {
      return this.state.failed ? null : this.props.children
    }

    var inject = ['slots', 'modelDirectories', 'sessions']

    // Shown before the first /state response lands (and as a floor if the
    // route ever fails); replaced by the host's live list on every fetch.
    var FALLBACK_PROFILES = [
      { id: 'inherit', name: '继承', description: '与主 agent 相同的人格与工具面（默认）' },
    ]

    // Captured in apply().
    var modelDirectoriesSvc = null
    var sessionsSvc = null
    var directoryCache = {}

    // ---------- host routes (global subagent model) ----------

    function apiGetSub() {
      return fetch('/dsh-subagent-model/state', { cache: 'no-store' })
        .then(function (r) { return r.json() })
        .then(function (body) {
          if (body && body.error) throw new Error(body.error)
          return { sub: body && body.sub ? body.sub : null, profiles: (body && body.profiles) || [] }
        })
    }

    function apiPostSub(payload) {
      return fetch('/dsh-subagent-model/sub', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json() })
        .then(function (body) {
          if (!body || body.error) throw new Error(body ? body.error : '保存失败')
          return body.sub
        })
    }

    function apply(ctx) {
      modelDirectoriesSvc = ctx.modelDirectories
      sessionsSvc = ctx.sessions

      ctx.effect(function mountCss() {
        var selector = 'style[data-plugin-css=' + JSON.stringify(STYLE_ATTR) + ']'
        if (document.querySelector(selector) === null) {
          var tag = document.createElement('style')
          tag.dataset.pluginCss = STYLE_ATTR
          tag.textContent = CSS
          document.head.appendChild(tag)
        }
        return function unmountCss() {
          var el = document.querySelector(selector)
          if (el && el.parentNode) el.parentNode.removeChild(el)
        }
      })

      var slots = ctx.slots

      slots.inject('conversation.input.right', function () {
        return slots.register(
          {
            name: 'conversation.input.right',
            id: 'dsh-subagent-model',
            order: 100,
            label: '子代理模型',
          },
          function (props) {
            return h(Boundary, null, h(Seat, props || {}))
          }
        )
      })
    }

    // ---------- seat: resolve the session + shared directory ----------

    function Seat(props) {
      var session = props.session
      if (!session || !session.sessionId) return null
      // Addressed subagent sessions have no advisory directory - the same
      // rule the native model seat applies.
      if (sessionsSvc.subagentAddress(session.sessionId) !== undefined) return null
      return h(SubagentModelSelect, { sessionId: session.sessionId })
    }

    // ---------- the control (port of native ModelSelect) ----------

    function SubagentModelSelect(props) {
      var sessionId = props.sessionId
      var directory = directoryCache[sessionId]
      if (directory === undefined) {
        try { directory = modelDirectoriesSvc.directoryFor(sessionId) }
        catch (e) { directory = null }
        directoryCache[sessionId] = directory
      }
      if (directory === null) return null
      var store = directory.store

      var state = useSyncExternalStore(
        function (fn) { return store.subscribe(fn) },
        function () { return store.getSnapshot() }
      )

      var subPair = useState(undefined) // undefined = loading, null = unset
      var sub = subPair[0]
      var setSub = subPair[1]

      var profilesPair = useState(FALLBACK_PROFILES)
      var profiles = profilesPair[0]
      var setProfiles = profilesPair[1]

      var openPair = useState(false)
      var open = openPair[0]
      var setOpen = openPair[1]

      var panePair = useState('root')
      var pane = panePair[0]
      var setPane = panePair[1]

      var savingPair = useState(false)
      var saving = savingPair[0]
      var setSaving = savingPair[1]

      var toastPair = useState(null)
      var toast = toastPair[0]
      var setToast = toastPair[1]

      var toastSeq = useRef(0)
      var rootRef = useRef(null)
      var triggerRef = useRef(null)
      var itemRefs = useRef([])
      var id = useId()

      var groups = state.groups || []
      var failures = state.failures || []
      var loadError = state.error === null ? undefined : state.error

      // All (group, model) pairs from the shared catalog.
      var choices = []
      for (var gi = 0; gi < groups.length; gi++) {
        var group = groups[gi]
        for (var mi = 0; mi < group.models.length; mi++) {
          choices.push({ group: group, model: group.models[mi] })
        }
      }

      var currentChoice = null
      if (sub) {
        for (var ci = 0; ci < choices.length; ci++) {
          if (choices[ci].group.id === sub.provider && choices[ci].model.id === sub.model) {
            currentChoice = choices[ci]
            break
          }
        }
      }

      var reasoning = currentChoice ? currentChoice.model.reasoning : undefined
      var effectiveEffort = sub
        ? (sub.reasoningEffort !== undefined
            ? sub.reasoningEffort
            : (reasoning ? reasoning.defaultEffort : undefined))
        : undefined

      var effortLabel
      if (reasoning !== undefined) {
        if (effectiveEffort === undefined) effortLabel = '默认'
        else {
          effortLabel = effectiveEffort
          var levels = reasoning.efforts || []
          for (var li = 0; li < levels.length; li++) {
            if (levels[li].id === effectiveEffort) { effortLabel = levels[li].name; break }
          }
        }
      }

      var modelLabel = currentChoice
        ? currentChoice.model.name
        : (sub ? sub.model : '未设置')

      var busy = saving

      // Initial load: catalog (shared with the native seat) + persisted config.
      var onState = function (body) {
        setSub(body.sub)
        if (body.profiles.length > 0) setProfiles(body.profiles)
      }
      useEffect(function () {
        directory.load().catch(function () {})
        apiGetSub().then(onState, function () { setSub(null) })
        return function () { delete directoryCache[sessionId] }
      }, [])

      // Outside mousedown closes - identical to the native menu, which is
      // what makes the two menus mutually exclusive ("或" state).
      useEffect(function () {
        if (!open) return
        var closeOutside = function (event) {
          if (!rootRef.current || !rootRef.current.contains(event.target)) setOpen(false)
        }
        document.addEventListener('mousedown', closeOutside)
        return function () { document.removeEventListener('mousedown', closeOutside) }
      }, [open])

      if (sub === undefined) {
        // Config not fetched yet - hold the row height, stay inert.
        return h('div', { ref: rootRef, className: 'dsm_root' })
      }

      var reload = function () { directory.load().catch(function () {}) }
      var refetchSub = function () {
        apiGetSub().then(onState, function () {})
      }

      var show = function () {
        setPane('root')
        setOpen(true)
        reload()
        refetchSub()
      }
      var close = function (restoreFocus) {
        setOpen(false)
        setPane('root')
        if (restoreFocus) {
          queueMicrotask(function () {
            if (triggerRef.current && triggerRef.current.focus) triggerRef.current.focus()
          })
        }
      }

      var moveFocus = function (offset) {
        var items = itemRefs.current.filter(function (x) { return x !== null })
        if (items.length === 0) return
        var active = -1
        for (var ii = 0; ii < items.length; ii++) {
          if (items[ii] === document.activeElement) { active = ii; break }
        }
        var target = items[(Math.max(active, 0) + offset + items.length) % items.length]
        if (target && target.focus) target.focus()
      }

      var onRootKeyDown = function (event) {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          if (pane !== 'root') setPane('root')
          else close(true)
          return
        }
        if (!open) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          moveFocus(event.key === 'ArrowDown' ? 1 : -1)
        }
      }

      var onBlur = function (event) {
        var to = event.relatedTarget
        if (to instanceof Node && rootRef.current && rootRef.current.contains(to)) return
        close()
      }

      var showToast = function (text) {
        toastSeq.current += 1
        setToast({ seq: toastSeq.current, text: text })
      }

      var chooseModel = function (group, model) {
        if (sub && sub.provider === group.id && sub.model === model.id) {
          close(true)
          return
        }
        setSaving(true)
        var payload = { provider: group.id, model: model.id }
        // Materialize the picked model's default effort (explicit null =
        // provider default) exactly like the native selection flow.
        payload.reasoningEffort = (model.reasoning && model.reasoning.defaultEffort !== undefined)
          ? model.reasoning.defaultEffort
          : null
        apiPostSub(payload).then(
          function (saved) {
            setSaving(false)
            setSub(saved)
            close(true)
          },
          function (err) {
            setSaving(false)
            showToast('子代理模型保存失败：' + (err && err.message ? err.message : err))
          }
        )
      }

      var chooseEffort = function (effort) {
        if (!sub) return
        if (effectiveEffort === effort) {
          close(true)
          return
        }
        setSaving(true)
        var payload = { provider: sub.provider, model: sub.model }
        if (effort === undefined) payload.reasoningEffort = null
        else payload.reasoningEffort = effort
        apiPostSub(payload).then(
          function (saved) {
            setSaving(false)
            setSub(saved)
            close(true)
          },
          function (err) {
            setSaving(false)
            showToast('推理强度保存失败：' + (err && err.message ? err.message : err))
          }
        )
      }

      var chooseProfile = function (id) {
        if (!sub) {
          showToast('请先选择子代理模型，再设置档位')
          return
        }
        var active = (sub.profile || 'inherit')
        if (active === id) {
          close(true)
          return
        }
        setSaving(true)
        apiPostSub({
          provider: sub.provider,
          model: sub.model,
          profile: id === 'inherit' ? null : id,
        }).then(
          function (saved) {
            setSaving(false)
            setSub(saved)
            close(true)
          },
          function (err) {
            setSaving(false)
            showToast('档位保存失败：' + (err && err.message ? err.message : err))
          }
        )
      }

      var profileOf = function (id) {
        if (!id || id === 'inherit') return profiles[0] || FALLBACK_PROFILES[0]
        for (var i = 0; i < profiles.length; i++) {
          if (profiles[i].id === id) return profiles[i]
        }
        return { id: id, name: id, description: '' }
      }
      var activeProfileId = sub ? (sub.profile || 'inherit') : 'inherit'
      var profileLabel = profileOf(activeProfileId).name

      var triggerLabel = effortLabel === undefined ? modelLabel : modelLabel + ' · ' + effortLabel
      var triggerAria = !sub
        ? '选择子代理模型'
        : effortLabel === undefined
          ? '子代理模型，当前 ' + modelLabel
          : '子代理模型，当前 ' + modelLabel + '，推理强度 ' + effortLabel

      itemRefs.current = []
      var itemIndex = 0
      var itemRef = function () {
        var at = itemIndex++
        return function (node) { itemRefs.current[at] = node }
      }

      // --- root pane: the three cells ---
      var rootPane = []
      rootPane.push(h('button', {
        key: 'model-cell',
        ref: itemRef(),
        type: 'button',
        role: 'menuitem',
        className: 'dsm_cell',
        onClick: function () { setPane('model') },
      },
        h('span', { className: 'dsm_cellLabel' }, '子代理模型'),
        h('span', { className: 'dsm_cellValue' }, modelLabel),
        h(IconChevronRight, { className: 'dsm_cellChevron' })
      ))
      if (reasoning !== undefined) {
        rootPane.push(h('button', {
          key: 'effort-cell',
          ref: itemRef(),
          type: 'button',
          role: 'menuitem',
          className: 'dsm_cell',
          onClick: function () { setPane('effort') },
        },
          h('span', { className: 'dsm_cellLabel' }, '推理强度'),
          h('span', { className: 'dsm_cellValue' }, effortLabel),
          h(IconChevronRight, { className: 'dsm_cellChevron' })
        ))
      }
      rootPane.push(h('button', {
        key: 'profile-cell',
        ref: itemRef(),
        type: 'button',
        role: 'menuitem',
        className: 'dsm_cell',
        onClick: function () { setPane('profile') },
      },
        h('span', { className: 'dsm_cellLabel' }, '子代理档位'),
        h('span', { className: 'dsm_cellValue' }, profileLabel),
        h(IconChevronRight, { className: 'dsm_cellChevron' })
      ))

      // --- model pane: provider-grouped catalog ---
      var modelPane = []
      if (state.status === 'loading') {
        modelPane.push(h('div', { key: 'status', className: 'dsm_status' }, '正在刷新模型列表…'))
      }
      if (loadError !== undefined) {
        modelPane.push(h('div', { key: 'error', className: 'dsm_error' },
          h('span', null, '目录加载失败：' + loadError),
          h('button', { type: 'button', className: 'dsm_retry', onClick: reload }, '重试')
        ))
      }
      for (var fi = 0; fi < failures.length; fi++) {
        var failure = failures[fi]
        modelPane.push(h('div', { key: 'failure:' + failure.id, className: 'dsm_warning' },
          h('span', null, failure.name + ' 加载失败：' + failure.message),
          h('button', { type: 'button', className: 'dsm_retry', onClick: reload }, '重试')
        ))
      }
      var groupSections = []
      for (var g2 = 0; g2 < groups.length; g2++) {
        var grp = groups[g2]
        var options = []
        for (var m2 = 0; m2 < grp.models.length; m2++) {
          var mdl = grp.models[m2]
          var selected = !!sub && sub.provider === grp.id && sub.model === mdl.id
          options.push(h('button', {
            key: mdl.id,
            ref: itemRef(),
            type: 'button',
            role: 'menuitemradio',
            'aria-checked': selected,
            className: cx('dsm_option', selected && 'dsm_selected'),
            title: mdl.name,
            disabled: busy,
            onClick: (function (g, m) {
              return function () { chooseModel(g, m) }
            })(grp, mdl),
          },
            h('span', { className: 'dsm_optionCopy' },
              h('span', { className: 'dsm_modelName' }, mdl.name),
              mdl.description !== undefined ? h('span', { className: 'dsm_description' }, mdl.description) : null
            ),
            h('span', { className: 'dsm_check' }, selected ? h(IconCheck, null) : null)
          ))
        }
        groupSections.push(h('section', {
          key: grp.id,
          role: 'group',
          'aria-labelledby': id + '-' + grp.id,
          className: 'dsm_group',
        },
          h('div', { className: 'dsm_groupTitle', id: id + '-' + grp.id }, grp.name),
          options
        ))
      }
      modelPane.push(h('div', { key: 'groups', className: cx('dsm_groups', 'scrollable') }, groupSections))
      if (state.status === 'ready' && choices.length === 0) {
        modelPane.push(h('div', { key: 'empty', className: 'dsm_empty' }, '没有可用的模型。'))
      }

      // --- effort pane: the selected model's published efforts ---
      var effortPane = []
      if (loadError !== undefined) {
        effortPane.push(h('div', { key: 'error', className: 'dsm_error' },
          h('span', null, '目录加载失败：' + loadError),
          h('button', { type: 'button', className: 'dsm_retry', onClick: reload }, '重新加载')
        ))
      }
      var effortChoices = []
      if (reasoning !== undefined) {
        if (reasoning.defaultEffort === undefined) {
          effortChoices.push({ key: 'provider-default', effort: undefined, label: '默认' })
        }
        var effs = reasoning.efforts || []
        for (var ei = 0; ei < effs.length; ei++) {
          effortChoices.push({
            key: 'effort:' + effs[ei].id,
            effort: effs[ei].id,
            label: effs[ei].name,
            description: effs[ei].description,
          })
        }
      }
      if (effortChoices.length === 0) {
        effortPane.push(h('div', { key: 'empty', className: 'dsm_empty' }, '当前模型未提供推理强度。'))
      } else {
        var effortRows = []
        for (var e2 = 0; e2 < effortChoices.length; e2++) {
          (function (level) {
            var on = effectiveEffort === level.effort
            effortRows.push(h('button', {
              key: level.key,
              ref: itemRef(),
              type: 'button',
              role: 'menuitemradio',
              'aria-checked': on,
              className: cx('dsm_option', on && 'dsm_selected'),
              disabled: busy,
              onClick: function () { chooseEffort(level.effort) },
            },
              h('span', { className: 'dsm_optionCopy' },
                h('span', { className: 'dsm_modelName' }, level.label),
                level.description !== undefined ? h('span', { className: 'dsm_description' }, level.description) : null
              ),
              h('span', { className: 'dsm_check' }, on ? h(IconCheck, null) : null)
            ))
          })(effortChoices[e2])
        }
        effortPane.push(effortRows)
      }

      // --- profile pane: leading 继承 + 内置(官方预设) / 自定义 groups ---
      var profileList = [];
      // Leading "off" option, outside any group - same pattern the effort
      // pane's provider-default row uses.
      (function () {
        var on = activeProfileId === 'inherit'
        profileList.push(h('button', {
          key: 'inherit',
          ref: itemRef(),
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': on,
          className: cx('dsm_option', on && 'dsm_selected'),
          disabled: busy,
          onClick: function () { chooseProfile('inherit') },
        },
          h('span', { className: 'dsm_optionCopy' },
            h('span', { className: 'dsm_modelName' }, '继承'),
            h('span', { className: 'dsm_description' }, '与主 agent 相同的人格与工具面（默认）')
          ),
          h('span', { className: 'dsm_check' }, on ? h(IconCheck, null) : null)
        ))
      })()
      var buckets = [
        { key: 'builtin', title: '内置', items: [] },
        { key: 'custom', title: '自定义', items: [] },
      ]
      for (var pi = 0; pi < profiles.length; pi++) {
        var entry = profiles[pi]
        if (entry.id === 'inherit') continue
        if (entry.group === 'builtin') buckets[0].items.push(entry)
        else buckets[1].items.push(entry)
      }
      var profileGroups = []
      for (var bi = 0; bi < buckets.length; bi++) {
        if (buckets[bi].items.length === 0 && buckets[bi].key !== 'custom') continue
        var rows = []
        var items = buckets[bi].items
        if (items.length === 0) {
          rows.push(h('div', { key: 'empty', className: 'dsm_empty' },
            '在「设置 -> Agent 预设」创建自己的预设后，这里会自动出现'))
        }
        for (var ri = 0; ri < items.length; ri++) {
          (function (item) {
            var on = activeProfileId === item.id
            rows.push(h('button', {
              key: item.id,
              ref: itemRef(),
              type: 'button',
              role: 'menuitemradio',
              'aria-checked': on,
              className: cx('dsm_option', on && 'dsm_selected'),
              title: item.name,
              disabled: busy,
              onClick: function () { chooseProfile(item.id) },
            },
              h('span', { className: 'dsm_optionCopy' },
                h('span', { className: 'dsm_modelName' }, item.name),
                item.description !== undefined ? h('span', { className: 'dsm_description' }, item.description) : null
              ),
              h('span', { className: 'dsm_check' }, on ? h(IconCheck, null) : null)
            ))
          })(items[ri])
        }
        profileGroups.push(h('section', {
          key: buckets[bi].key,
          role: 'group',
          'aria-labelledby': id + '-profile-' + buckets[bi].key,
          className: 'dsm_group',
        },
          h('div', { className: 'dsm_groupTitle', id: id + '-profile-' + buckets[bi].key }, buckets[bi].title),
          rows
        ))
      }
      profileList.push(profileGroups)
      var profilePane = [h('div', { key: 'groups', className: cx('dsm_groups', 'scrollable') }, profileList)]

      var menu = open
        ? h('div', {
          id: id + '-menu',
          className: 'dsm_menu',
          role: 'menu',
          'aria-label': '子代理模型、推理强度与档位',
          'aria-busy': state.status === 'loading' || busy,
        },
          pane === 'root' ? rootPane : null,
          pane === 'model' ? modelPane : null,
          pane === 'effort' ? effortPane : null,
          pane === 'profile' ? profilePane : null
        )
        : null

      var toastNode = toast !== null
        ? h(Toast, {
          key: toast.seq,
          text: toast.text,
          icon: h(IconWarning, null),
          anchor: (rootRef.current && rootRef.current.closest)
            ? rootRef.current.closest('[data-composer-card]')
            : null,
          onDone: function () { setToast(null) },
        })
        : null

      return h('div', {
        ref: rootRef,
        className: 'dsm_root',
        onKeyDown: onRootKeyDown,
        onBlur: onBlur,
      },
        h('button', {
          ref: triggerRef,
          type: 'button',
          className: 'dsm_trigger',
          'aria-label': triggerAria,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-controls': open ? id + '-menu' : undefined,
          title: triggerLabel,
          onClick: function () {
            if (open) close()
            else show()
          },
        },
          h('span', { className: 'dsm_prefix' }, '子代理'),
          h('span', { className: 'dsm_triggerLabel' }, modelLabel),
          effortLabel !== undefined ? h('span', { className: 'dsm_triggerEffort' }, effortLabel) : null,
          h(IconChevronDown, { className: cx('dsm_chevron', open && 'dsm_chevronOpen') })
        ),
        menu,
        toastNode
      )
    }

    exports.name = 'dsh-subagent-model'
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
