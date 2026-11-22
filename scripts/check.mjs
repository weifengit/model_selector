// 自检：不依赖浏览器，验证纯逻辑与产物的形状。
//
// 覆盖五件事：
//   1. 探测判定的映射（网关拒绝文本 → 判定状态）——规则住在宿主半边；
//   2. 判定表的新鲜度与折叠规则；
//   3. 车道名单与选择器行的 id 对齐（两套命名法）；
//   4. 清理规则：哪些模型该离开清单；
//   5. 产物的形状——dist/client.js 必须是 ModuleLoader 认得的 classic-script。
import { readFileSync, existsSync } from 'node:fs'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0

/** 断言一个条件成立。 */
function check(label, condition) {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.error(`  FAIL ${label}`)
  }
}

/** 把一个纯逻辑模块用 esbuild 转译后直接跑起来。 */
async function loadModule(relative) {
  const built = await build({
    entryPoints: [join(root, relative)],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
    absWorkingDir: root, logLevel: 'silent',
  })
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
}

// 网关拒绝文本到判定的映射——规则住在宿主半边（探测在宿主上跑，密钥不进页面）。
console.log('refusal classification')
{
  const G = await import('../src/gateway.js')
  check('402 reads as no credit', G.classifyRefusal(402, 'insufficient balance (1008)') === 'no-credit')
  check('missing credential reads as a vendor fault', G.classifyRefusal(502, '未配置凭据，请先登录') === 'no-credential')
  check('a 429 reads as throttled', G.classifyRefusal(429, 'Free usage limit reached') === 'throttled')
  check('a region refusal reads as region-blocked', G.classifyRefusal(403, 'This model is not available in your country') === 'region-blocked')
  check('a 401 says nothing about the model', G.classifyRefusal(401, 'invalid api key') === 'unknown')
  // 厂商级 403（登录过期）是判定，门级 401（密钥错）不是。
  check('a provider 403 is a vendor fault', G.classifyRefusal(403, 'codearts: model request failed with HTTP 403') === 'no-credential')
  check('a door 401 is not a verdict', G.classifyRefusal(401, 'Missing or invalid API key') === 'unknown')
  check('a 503 with the words does not ban a model', G.classifyRefusal(503, 'Service Unavailable') === 'unknown')
  check('a 502 wraps the upstream refusal', G.classifyRefusal(502, 'no such model: x') === 'unavailable')
  check('an unrecognised refusal is unknown', G.classifyRefusal(418, 'teapot') === 'unknown')
}

// 判定表：新旧、折叠、以及「未知不是答案」。
console.log('per-model verdicts')
{
  const V = await loadModule('client/src/verdicts.ts')
  check('a refusal is a refusal', V.isRefused(V.laneVerdict({ availability: 'region-blocked', availabilitySource: 'probe' })))
  check('a throttled verdict is a refusal', V.isRefused(V.laneVerdict({ availability: 'throttled', availabilitySource: 'probe' })))
  check('an available verdict is usable', V.isUsable(V.laneVerdict({ availability: 'available', availabilitySource: 'manual' })))
  // listing 不是答案：listing 来的 unknown 仍要探测。
  const listed = V.laneVerdict({ availability: 'unknown', availabilitySource: 'listing' })
  check('a listing is not an answer', V.needsProbe(listed))
  check('a listing refusal still refuses', V.isRefused(V.laneVerdict({ availability: 'region-blocked', availabilitySource: 'listing' })))
  check('a vendor fault is not a model fact', V.isVendorFault('no-credential') && !V.isVendorFault('unavailable'))
  check('a stale refusal is still a refusal', V.isRefused({ state: 'no-credential', source: 'gateway-probe', detail: '', at: 0 }))

  // 新鲜度：缓存里的判定过期后不再作数。
  const now = 1_800_000_000_000
  const fresh = V.cachedVerdict({ m: { state: 'available', detail: '', at: now - 1000 } }, 'm', now)
  const stalePositive = V.cachedVerdict({ m: { state: 'available', detail: '', at: now - V.probeTtl('available') - 1 } }, 'm', now)
  const oldRefusal = V.cachedVerdict({ m: { state: 'unavailable', detail: '', at: now - V.probeTtl('unavailable') + 1000 } }, 'm', now)
  check('a fresh probe answers', fresh !== undefined && V.isUsable(fresh))
  check('a stale positive expires', stalePositive === undefined)
  check('a refusal is kept longer than a positive',
    V.probeTtl('unavailable') > V.probeTtl('available') && oldRefusal !== undefined)

  // 折叠：更新的答案胜出；同龄时正面胜出。
  const older = { state: 'unavailable', source: 'lane-probe', detail: '', at: 100 }
  const newer = { state: 'available', source: 'gateway-probe', detail: '', at: 200 }
  check('the fresher answer wins', V.bestVerdict(older, newer).state === 'available')
  check('the fresher answer wins the other way', V.bestVerdict(newer, older).state === 'available')
  check('a positive wins at equal age', V.bestVerdict(
    { state: 'unavailable', source: 'lane-probe', detail: '', at: 100 },
    { state: 'available', source: 'gateway-probe', detail: '', at: 100 },
  ).state === 'available')
  check('no answer at all is unknown', V.bestVerdict(undefined, undefined).state === 'unknown')

  // 键映射：lane 的路由用裸 id，厂商用 provider/model——与缓存键一致。
  check('a lane model is keyed by its roster id', V.pickerProbeKey('our-free-model', 'kilo-auto/free') === 'kilo-auto/free')
  check('the region lane is a lane too', V.pickerProbeKey('our-free-model-region', 'beam-free') === 'beam-free')
  check('a vendor model is keyed provider/model', V.pickerProbeKey('trae', 'glm-5.3-flash') === 'trae/glm-5.3-flash')
  check('a slashed vendor model keeps its own slash', V.pickerProbeKey('cline', 'recursive/flint-v1.0:free') === 'cline/recursive/flint-v1.0:free')

  // 车道模型的命名分歧：名单用裸 id，缓存用 provider 前缀。
  const cacheFixture = {
    'opencode/flint-40b-free': { state: 'throttled', detail: '', at: 5 },
    'cline/reflection/beam-free': { state: 'region-blocked', detail: '', at: 5 },
    'unrelated/other': { state: 'available', detail: '', at: 5 },
  }
  const answering = V.laneCacheKeys(cacheFixture, 'flint-40b-free')
  check('a prefixed cache key answers for a bare lane id', answering.length === 1 && answering[0] === 'opencode/flint-40b-free')
  check('a two-level prefix still answers', V.laneCacheKeys(cacheFixture, 'beam-free').length === 1)
  check('a different model does not answer', V.laneCacheKeys(cacheFixture, 'flint-40b').length === 0)
  check('a bare lane id does not answer for itself as a prefix', V.laneCacheKeys({ 'flint-40b-free': { state: 'available', detail: '', at: 5 } }, 'flint-40b-free').length === 0)
  check('a lane model reads its prefixed probe', V.cachedLaneVerdict(cacheFixture, 'flint-40b-free', 6)?.state === 'throttled')
  check('a lane model with no key reads unknown', V.cachedLaneVerdict(cacheFixture, 'nothing-here', 6) === undefined)
  // 选择器里的车道行可能就用带前缀的 id，手探的判定也存这个键；折叠时必须
  // 把它算进来，否则刷新后手探过的模型又读成未探测。
  check('the fresher of two readings wins',
    V.freshestVerdict({ state: 'throttled', source: 'gateway-probe', detail: '', at: 5 },
      { state: 'available', source: 'gateway-probe', detail: '', at: 9 })?.state === 'available')
  check('one missing reading is the other',
    V.freshestVerdict(undefined, { state: 'available', source: 'gateway-probe', detail: '', at: 9 })?.state === 'available'
      && V.freshestVerdict({ state: 'available', source: 'gateway-probe', detail: '', at: 9 }, undefined)?.state === 'available'
      && V.freshestVerdict(undefined, undefined) === undefined)
  const storeSrc = readFileSync(join(root, 'client', 'src', 'verdict-store.ts'), 'utf8')
  check('a lane row also reads the cache key matching its own id',
    storeSrc.includes('cachedVerdict(cache, row.id)') && storeSrc.includes('freshestVerdict('))
}

// 车道名单与选择器行的 id 对齐：两套命名法，一个模型两个拼法。
console.log('roster alignment')
{
  const R = await loadModule('client/src/roster.ts')
  const roster = [
    { id: 'flint-40b-free', name: 'Flint', availability: 'throttled', detail: '', route: '', availabilitySource: 'probe', probedAt: 5, hiddenByUser: false },
    { id: 'opencode/flint-40b-free', name: 'Flint', availability: 'unknown', detail: '', route: '', availabilitySource: 'listing', probedAt: 0, hiddenByUser: false },
    { id: 'openai/gpt-oss-20b', name: 'GPT OSS', availability: 'unknown', detail: '', route: '', availabilitySource: 'listing', probedAt: 0, hiddenByUser: false },
    { id: 'beam-free', name: 'Beam', availability: 'region-blocked', detail: '', route: '', availabilitySource: 'probe', probedAt: 5, hiddenByUser: false },
  ]
  // 带前缀的选择器 id 匹配到裸 id 的名单行——并且要选中「有答案」的那一行，
  // 而不是仅仅命名了模型的那一行。
  check('a prefixed picker id finds its bare roster row',
    R.rosterVerdictRow(roster, 'opencode/flint-40b-free')?.id === 'flint-40b-free')
  check('the answering row wins over the listing row',
    R.rosterVerdictRow(roster, 'opencode/flint-40b-free')?.availability === 'throttled')
  check('an exact id matches exactly',
    R.rosterVerdictRow(roster, 'openai/gpt-oss-20b')?.id === 'openai/gpt-oss-20b')
  check('a picker id the roster never named reads nothing',
    R.rosterVerdictRow(roster, 'nvidia/nemotron-3.5-ultra:free') === undefined)
  const aligned = R.alignRoster(roster, ['opencode/flint-40b-free', 'openai/gpt-oss-20b', 'nothing/here'])
  check('the aligned map covers what it can', aligned.size === 2)
  check('the aligned map keeps the answering row',
    aligned.get('opencode/flint-40b-free')?.availability === 'throttled')
}

// 清理规则：哪些模型该离开清单。
console.log('cleanup rule')
{
  const V = await loadModule('client/src/verdicts.ts')
  const models = [
    { id: 'good', name: 'Good', disabled: false, dead: false },
    { id: 'refused', name: 'Refused', disabled: false, dead: false },
    { id: 'off', name: 'Off', disabled: true, dead: false },
    { id: 'gone', name: 'Gone', disabled: false, dead: true },
  ]
  const verdicts = {
    'p/refused': { state: 'throttled', source: 'gateway-probe', detail: '', at: 5 },
  }
  const doomed = V.doomedModelIds('p', models, verdicts, false)
  check('a refused model is doomed', doomed.includes('refused'))
  check('a working model stays', !doomed.includes('good'))
  check('a hidden model is not doomed again', !doomed.includes('off'))
  check('a dead model is not doomed', !doomed.includes('gone'))
  // 厂商级不可用时，整家的模型都该走。
  const all = V.doomedModelIds('p', models, verdicts, true)
  check('an unusable vendor dooms every visible model',
    all.includes('good') && all.includes('refused') && !all.includes('off') && !all.includes('gone'))
  // 未知不隐藏：隐藏一个能用的模型比多显示一个坏模型更糟。
  check('an untested model stays', !V.doomedModelIds('p', models, {}, false).includes('good'))
}

// 探测计划：只问还没答案的模型。
console.log('sweep plan')
{
  const S = await loadModule('client/src/sweep.ts')
  const now = 20_000_000
  const lane = [
    { id: 'ask-me', name: 'Ask', availability: 'unknown', availabilitySource: 'listing', detail: '', probedAt: 0, hiddenByUser: false },
    { id: 'answered', name: 'Done', availability: 'available', availabilitySource: 'probe', detail: '', probedAt: now, hiddenByUser: false },
    { id: 'hidden-one', name: 'Hidden', availability: 'unknown', availabilitySource: 'listing', detail: '', probedAt: 0, hiddenByUser: true },
  ]
  const vendorModels = {
    trae: [
      { id: 'glm', name: 'GLM', disabled: false, dead: false },
      { id: 'off', name: 'Off', disabled: true, dead: false },
      { id: 'gone', name: 'Gone', disabled: false, dead: true },
    ],
    deadbeat: [{ id: 'x', name: 'X', disabled: false, dead: false }],
  }
  const verdicts = {
    answered: { state: 'available', source: 'lane-probe', detail: '', at: now },
    'deadbeat/x': { state: 'no-credential', source: 'gateway-probe', detail: '', at: now },
  }
  const plan = S.planSweep(lane, vendorModels, {}, verdicts, now)
  const keys = plan.map(target => target.key).sort()
  check('the sweep asks the unknowns', keys.includes('ask-me') && keys.includes('trae/glm'))
  check('the sweep skips what is answered', !keys.includes('answered'))
  check('the sweep skips what the picker does not list', !keys.includes('hidden-one') && !keys.includes('trae/off') && !keys.includes('trae/gone'))
  check('a vendor-level fault ends that vendor', !keys.some(key => key.startsWith('deadbeat/')))
  check('a lane model is addressed through the gateway prefix',
    S.gatewayModelId('ask-me', '') === 'our-free-model/ask-me' && S.gatewayModelId('trae/glm', 'trae') === 'trae/glm')
  // 网关寻址用的是选择器里的那个 id，而不是名单里的裸 id。
  const laneTarget = plan.find(target => target.key === 'ask-me')
  check('the target carries the gateway id the plan computed', laneTarget?.modelId === 'our-free-model/ask-me')
}

// 判定表 store：一份表、两条读法、失败不清空。
console.log('verdict store')
{
  const store = await loadModule('client/src/verdict-store.ts')
  store.publishLaneModels([{ id: 'kilo-auto/free', name: 'Kilo', availability: 'throttled', detail: '', route: '', availabilitySource: 'probe', probedAt: 5, hiddenByUser: false }])
  check('the store folds published lane rows', store.getVerdicts()['kilo-auto/free']?.state === 'throttled')
  const before = store.verdictSnapshot()
  store.publishLaneModels([{ id: 'kilo-auto/free', name: 'Kilo', availability: 'throttled', detail: '', route: '', availabilitySource: 'probe', probedAt: 5, hiddenByUser: false }])
  check('an unchanged table keeps its identity', before === store.verdictSnapshot())
  // 「闪一下就没」的真因：读失败/空名单曾把整张表塌掉。
  const sizeBefore = Object.keys(store.getVerdicts()).length
  store.publishLaneModels([])
  check('an empty roster does not wipe the table', Object.keys(store.getVerdicts()).length === sizeBefore)
  // 探测器落地的新判定要即时进入表里，并忽略 unknown（unknown 不是答案）。
  store.recordProbes({ 'trae/x': { state: 'available', detail: '', at: 9 }, 'trae/y': { state: 'unknown', detail: '', at: 9 } })
  check('a landed probe folds in', store.getVerdicts()['trae/x']?.state === 'available')
  check('an unknown probe is not an answer', store.getVerdicts()['trae/y'] === undefined)
}

// 清单挂在输入框底部的模型席位上。
console.log('the composer seat')
{
  const entry = readFileSync(join(root, 'client', 'src', 'index.tsx'), 'utf8')
  const picker = readFileSync(join(root, 'client', 'src', 'picker.tsx'), 'utf8')
  const styles = readFileSync(join(root, 'client', 'src', 'styles.ts'), 'utf8')
  // 输入框底部的模型席位是 single slot：只有一个占位者，插件要遮蔽它就必须
  // 用不同的 priority 覆盖，否则注册直接抛错。
  check('the picker occupies the composer model seat', entry.includes("'conversation.input.model'"))
  check('the seat is shadowed at a distinct priority', /priority:\s*-\d+/.test(entry))
  check('the seat waits for the declaration', entry.includes("scope.slots.inject('conversation.input.model'"))
  check('the picker reads the shared verdict table', picker.includes('feature.verdicts'))
  check('every row carries a verdict dot', picker.includes('ms-picker-dot'))
  check('the picker submits through the shared directory', picker.includes('select(') && picker.includes('directory'))
  check('a subagent session renders no seat', picker.includes('if (!available) return null'))
  // 打开清单时默认定位到当前模型：模型多了以后，选中项常常在几百行之外，
  // 而「从当前模型往上/下挑」正是打开清单的常见目的。
  check('the list opens anchored on the current model',
    picker.includes("'.ms-picker-list'")
      && picker.includes("'.ms-picker-row-wrap.is-selected'")
      && /anchoredRef\.current\s*=/.test(picker))
  // 厂商名吸顶 + 余额：用户滚动几百个模型时仍知道自己在哪家名下。
  check('the vendor header sticks while scrolling', /\.ms-picker-group-name\s*\{[^}]*position:\s*sticky/.test(styles))
  check('the vendor header appears exactly once', (styles.match(/\.ms-picker-group-name/g) ?? []).length === 1)
  check('the vendor balance has its own slot', styles.includes('.ms-picker-group-balance'))
  check('the picker renders the vendor balance', picker.includes('ms-picker-group-balance') && picker.includes('vendorBalance'))
  check('the picker formats each vendor own unit', picker.includes('shortUnit'))
  // 查不到余额不是 0——那是「不知道」，显示成 0 会误导用户。
  check('an unreadable balance is not shown as zero', picker.includes('balanceInfo.balance === null'))
  // 底部控制条：清理 / 刷新 / 探测就在选模型的地方。
  check('the picker footer carries the controls', picker.includes('ms-picker-footer') && picker.includes('ms-picker-footer-btn'))
  check('the footer drives the cleanup switch', picker.includes('feature.setSwitch('))
  check('the footer drives the shared refresh', picker.includes('feature.refresh()'))
  check('the footer drives the shared sweep', picker.includes('feature.runSweep') && picker.includes('feature.stopSweep'))
  // 细粒度探测：厂家级 / 单模型级都不走「全扫一遍」，但必须和总扫共用同一条
  // 落盘路径（执行器、读回、开关收尾），否则手探的判定会在刷新后丢掉。
  const hook = readFileSync(join(root, 'client', 'src', 'use-model-selector.ts'), 'utf8')
  const sweepSrc = readFileSync(join(root, 'client', 'src', 'sweep.ts'), 'utf8')
  check('a vendor header carries its own probe', picker.includes('feature.probeGroup('))
  check('a model row carries its own probe', picker.includes('feature.probeTargets(['))
  check('a row probe never also switches the model', /ms-picker-row-probe/.test(picker) && /ms-picker-row-wrap/.test(styles))
  check('in-flight probes are per-key and per-vendor', hook.includes('probingKeys') && hook.includes('probingGroups'))
  // 总扫与窄探必须是同一个执行器、只差 sweeping 标志；两条调用点都在才算。
  check('both probe paths share one executor',
    hook.includes("await runProbeBatch(targets, { sweeping: true })")
      && hook.includes("await runProbeBatch(unique, { sweeping: false })"))
  check('the executor persists and reads the cache back',
    hook.includes('recordProbes(status.results)') && hook.includes('refreshReadings(true)'))
  // 网关寻址必须与判定表的键一致，否则手探过的模型仍会读成未探测。
  check('a picker row maps to the same key the sweep stores', sweepSrc.includes('export function targetFor('))
  check('the lane keeps its gateway prefix under a row probe',
    /lane ? \? '' : provider/.test(sweepSrc) && sweepSrc.includes('gatewayModelId(key, lane ? \'\' : provider)'))
  // 窄输入框：模型名必须像原生一样收成图标，而不是把整行挤到第二行。
  check('the seat answers the shell compact-width flags', styles.includes('--dsh-composer-model-text-display') && styles.includes('--dsh-composer-model-icon-display'))
  check('the seat carries a glyph for the compact case', picker.includes('<ModelGlyph />'))
  // 席位崩溃即永久消失：inject 工厂的结果按 binding 缓存，抛一次就把条目
  // abdicate 掉，直到刷新页面才回来。所以工厂本身不能做会抛的事，目录的解析
  // 必须交给会重试的延迟面。
  const seatFace = readFileSync(join(root, 'client', 'src', 'seat-face.ts'), 'utf8')
  check('the seat factory never resolves the directory eagerly',
    !entry.includes('const directory = models.directoryFor(sessionId)'))
  check('the seat resolves through the deferred face',
    entry.includes('createSeatFace({') && entry.includes('resolve: () => models.directoryFor(sessionId)'))
  check('the deferred face retries instead of retiring',
    seatFace.includes('attempts >= retryAttempts') && seatFace.includes('directory.attach('))
  // 根因：modelDirectories 的方法被 trace 回调用者自己的 fiber，
  // 少了 remote / remote.session 就在这里抛「without inject」。
  check('the client half declares the services the seat walk needs',
    /export const inject = \[.*'remote'[^\]]*'remote\.session'[^\]]*\]/.test(entry))
  check('the seat scope redeclares them for the traced call',
    entry.includes("'sessions', 'remote', 'remote.session'"))
}

// 密钥留在宿主：页面永远看不到网关的 key。
console.log('the secret stays on the host')
{
  const gateway = readFileSync(join(root, 'src', 'gateway.js'), 'utf8')
  check('the probe runs on the Host against the gateway', gateway.includes('chat/completions'))
  check('the page never sees the key', !readFileSync(join(root, 'client/src/probe.ts'), 'utf8').includes('api-key'))
  check('the client bundle never sees the key', !readFileSync(join(root, 'client/src/data.ts'), 'utf8').includes('api-key'))
  // 状态固化在宿主：重启不丢。
  const host = readFileSync(join(root, 'src', 'host.js'), 'utf8')
  check('serves the switch state over a route', host.includes('API_PREFIX'))
  check('persists the state in a file', host.includes('JsonStore'))
  check('serves the verdict cache over a route', host.includes("route === '/verdicts'"))
  check('the sweep routes are mounted on the Host', host.includes("route === '/sweep'"))
  const store = readFileSync(join(root, 'src', 'store.js'), 'utf8')
  check('the store survives a restart', store.includes('class JsonStore'))
  check('the store writes atomically', store.includes('rename'))
  check('an unknown verdict is never cached', store.includes('VERDICT_STATES.has'))
}

// 产物形状。
console.log('bundle shape')
{
  const out = join(root, 'dist', 'client.js')
  if (!existsSync(out)) {
    failures += 1
    console.error('  FAIL dist/client.js is missing — run `npm run build`')
  } else {
    const text = readFileSync(out, 'utf8')
    check('registers through window.__ModuleLoader__', text.startsWith('window.__ModuleLoader__.load({'))
    check('declares the package id', text.includes('id: "dsh-model-selector"'))
    check('returns module.exports from the factory', text.includes('return module.exports;'))
    check('keeps react external', !text.includes('react.production.min.js'))
    check('registers the composer model seat', text.includes('"conversation.input.model"'))
    // 样式表的花括号必须配平：多一个 `}` 会把后面的规则整块吞掉，
    // 结果是「清单永远不显示」而不是「样式报错」——很难一眼看出。
    const css = text.match(/var CSS = `([\s\S]*?)`/) ?? text.match(/CSS = "([\s\S]*?)"/)
    if (css === null) {
      check('the stylesheet is present in the bundle', false)
    } else {
      const body = css[1]
      const open = (body.match(/\{/g) ?? []).length
      const close = (body.match(/\}/g) ?? []).length
      check('the stylesheet braces balance', open === close)
      check('the stylesheet has no empty rule', !/\{\s*\}/.test(body))
      check('the balance slot survived', body.includes('.ms-picker-group-balance'))
    }
  }
}

// 字典：zh 与 en 的键集必须一致。
console.log('locale dictionaries stay in step')
{
  const idx = readFileSync(join(root, 'client', 'src', 'index.tsx'), 'utf8')
  const parts = idx.split(/\n *en: \{/)
  // 键里可以有连字符（sweep.no-gateway），正则不能漏掉它们。
  const keysOf = (text) => new Set([...text.matchAll(/'([a-z][a-zA-Z0-9_.-]+)':/g)].map((m) => m[1]))
  const zhKeys = keysOf(parts[0])
  const enKeys = keysOf(parts[1] || '')
  const onlyZh = [...zhKeys].filter((k) => !enKeys.has(k))
  const onlyEn = [...enKeys].filter((k) => !zhKeys.has(k))
  check('zh and en carry the same keys', onlyZh.length === 0 && onlyEn.length === 0)
  if (onlyZh.length > 0) console.error('    only in zh: ' + onlyZh.join(', '))
  if (onlyEn.length > 0) console.error('    only in en: ' + onlyEn.join(', '))

  // 每个用到的键都要在字典里——漏一个就是界面上一个裸露的 key。
  const sources = ['picker.tsx', 'verdict-copy.ts', 'use-model-selector.ts']
  const used = new Set()
  for (const name of sources) {
    const src = readFileSync(join(root, 'client', 'src', name), 'utf8')
    for (const m of src.matchAll(/t\('([a-z][a-zA-Z0-9_.-]+)'/g)) used.add(m[1])
    for (const m of src.matchAll(/t\(`([a-z][a-zA-Z0-9_.]+)\$\{/g)) {
      for (const suffix of ['no-gateway', 'no-gateway-key', 'sweep-request-failed']) {
        used.add(`${m[1].replace(/\.$/, '')}.${suffix}`)
      }
    }
  }
  const missing = [...used].filter((k) => !zhKeys.has(k))
  check('every key the picker asks for is in the dictionary', missing.length === 0)
  if (missing.length > 0) console.error('    missing: ' + missing.join(', '))
}

// 宿主半边能被 node 解析。
console.log('host half parses')
{
  const { readdirSync } = await import('node:fs')
  const files = readdirSync(join(root, 'src'))
  for (const file of files) {
    let ok = true
    try {
      await import(join(root, 'src', file))
    } catch (error) {
      ok = /Cannot find module/.test(String(error?.message ?? ''))
    }
    check(`src/${file} parses`, ok)
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
