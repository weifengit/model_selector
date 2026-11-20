/**
 * Model Selector — browser half.
 *
 * Occupies one seat: the composer's model list
 * (`conversation.input.model`). The list renders what the shell's own catalog
 * offers, plus the two things only this plugin knows — each vendor's remaining
 * credit, and whether each model can answer a turn right now — and carries the
 * cleanup and probe controls at its foot.
 *
 * It adds no backend of its own beyond the state and the probe: the readings
 * come from the same two same-origin surfaces the shell already serves
 * (`/api/our-free-model/summary` and `/api/channel-pack`), and the probe runs
 * on the Host so the gateway's key never crosses into the page.
 *
 * @module client/src/index.tsx
 */

import React from 'react'
import { ComposerModelPicker } from './picker.tsx'
import { createSeatFace } from './seat-face.ts'
import { CSS } from './styles.ts'

/** The locale namespace this plugin registers its copy under. */
const NS = 'modelSelector'

/** The copy, in both languages the shell ships. */
const DICT = {
  zh: {
    'picker.menu': '模型',
    'picker.open': '选择模型',
    'picker.account': 'DeepSeek 账号',
    'picker.loading': '读取中…',
    'picker.placeholder': '选择模型',
    'picker.search': '搜索模型',
    'picker.emptyModels': '没有读到模型清单。',
    'picker.emptySearch': '没有匹配的模型。',
    'picker.untested': '未探测：可用性还不知道',
    'picker.effort': '思考强度',
    'picker.providerDefault': '跟随模型默认',
    'picker.groupFailed': '{name} 读取失败：{message}',
    'picker.failed': '切换模型失败',
    'picker.sessionInUse': '这个会话正在写入，稍后再切换模型',
    'picker.retry': '重试',
    'picker.clean': '清理不可用',
    'picker.restore': '恢复隐藏',
    'picker.refresh': '刷新',
    'picker.probe': '探测未验证',
    'probe.row': '探测这个模型',
    'probe.rowRunning': '正在探测这个模型…',
    'probe.group': '探测这家厂商的全部模型',
    'probe.groupRunning': '正在探测这家厂商…',
    'switch.on': '隐藏不可用厂商的模型，让模型清单清爽一点',
    'switch.off': '把之前隐藏的模型放回模型清单',
    'model.available': '可用',
    'model.regionBlocked': '地区限制',
    'model.unavailable': '不可用',
    'model.throttled': '限流',
    'model.noCredit': '无额度',
    'model.noCredential': '未登录',
    'model.untested': '未探测',
    'sweep.stop': '停止探测',
    'sweep.no-gateway': '本机没有可用的渠道网关，无法探测。',
    'sweep.no-gateway-key': '读不到渠道网关密钥，无法探测。',
    'sweep.sweep-request-failed': '探测请求没送出去，稍后再试。',
  },
  en: {
    'picker.menu': 'Model',
    'picker.open': 'Select a model',
    'picker.account': 'DeepSeek account',
    'picker.loading': 'Reading…',
    'picker.placeholder': 'Select a model',
    'picker.search': 'Search models',
    'picker.emptyModels': 'No model roster was read.',
    'picker.emptySearch': 'No model matches.',
    'picker.untested': 'Untested: availability is not known yet',
    'picker.effort': 'Thinking effort',
    'picker.providerDefault': 'Model default',
    'picker.groupFailed': '{name} failed to load: {message}',
    'picker.failed': 'Could not switch models',
    'picker.sessionInUse': 'This session is busy writing; try switching models in a moment',
    'picker.retry': 'Retry',
    'picker.clean': 'Clean up unusable models',
    'picker.restore': 'Restore hidden models',
    'picker.refresh': 'Refresh',
    'picker.probe': 'Probe untested models',
    'probe.row': 'Probe this model',
    'probe.rowRunning': 'Probing this model…',
    'probe.group': 'Probe every model of this vendor',
    'probe.groupRunning': 'Probing this vendor…',
    'switch.on': "Hide unusable vendors' models, so the model list gets shorter",
    'switch.off': 'Put the hidden models back into the model list',
    'model.available': 'Available',
    'model.regionBlocked': 'Region blocked',
    'model.unavailable': 'Unavailable',
    'model.throttled': 'Throttled',
    'model.noCredit': 'No credit',
    'model.noCredential': 'Not signed in',
    'model.untested': 'Untested',
    'sweep.stop': 'Stop probing',
    'sweep.no-gateway': 'No channel gateway on this host, so probing is unavailable.',
    'sweep.no-gateway-key': 'The gateway key could not be read, so probing is unavailable.',
    'sweep.sweep-request-failed': 'The probe request did not reach the Host; try again.',
  },
}

/**
 * The services this plugin's browser half needs.
 *
 * `remote` and `remote.session` are listed because the shell's
 * `modelDirectories` service reads them off *its caller's* context: a traced
 * service method resolves `this.ctx` to the registrant's own fiber, so the
 * seat's `directoryFor()` re-walk starts here. Declaring them keeps that walk
 * from dying with "cannot get property \"remote.session\" without inject",
 * which retired the seat on every page load and left the shell's own picker
 * in place — the balances, dots, cleanup and probe controls vanished on refresh.
 */
export const inject = ['slots', 'locale', 'remote', 'remote.session']

/** The browser half's entry point. */
export function apply(ctx: Record<string, any>): void {
  const t = ctx.locale.bind(NS) as (key: string, vars?: Record<string, string | number>) => string

  ctx.effect(() => ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }), 'model-selector: dictionaries')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-plugin', 'dsh-model-selector')
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'model-selector: styles')

  // The composer's model seat is a `single` slot: one occupant, and the shell's
  // own picker is the default one. Registering at a lower priority shadows it
  // with this plugin's list, which shows the same directory the shell renders
  // with each vendor's credit and each model's verdict beside it. The seat is
  // the only place the user actually picks a model, so it is the only place the
  // answer belongs.
  //
  // The slot's injected face carries the whole directory contract; the plugin
  // speaks it structurally (see domain.ts) rather than importing another
  // package's private types.
  // The nested scope re-declares `remote` and `remote.session` on purpose: the
  // `directoryFor()` call below is made through `modelDirectories`, whose
  // methods are traced back to *this* fiber's context. Without them the seat
  // renders once, crashes in its inject factory, and is abdicated — the exact
  // symptom of the features appearing and then vanishing.
  ctx.inject(['slots', 'modelDirectories', 'sessions', 'remote', 'remote.session'], (scope: Record<string, any>) => {
    const models = scope.modelDirectories
    const sessions = scope.sessions
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model',
      priority: -200,
      locale: NS,
      inject: (sessionId: string) => {
        // A subagent session cannot inspect or select a model: the shell's own
        // seat renders nothing there, and shadowing it must not change that.
        const available = sessions.subagentAddress(sessionId) === undefined
        // The directory is resolved inside this factory, but through the
        // deferred face: a session whose scope is still binding would otherwise
        // throw here, abdicate the seat, and erase every feature until reload.
        return createSeatFace({
          available,
          resolve: () => models.directoryFor(sessionId),
        })
      },
    }, ComposerModelPicker))
  })
}
