import type { FormEvent } from 'react'
import type { AdminConfig } from '../../../shared/types'
import { Field, btnClass, btnSecondary, inputClass } from '../../catalogUi'
import { strings } from '../../strings'

type SettingsPage = 'list' | 'ai' | 'log'

/** Settings: list, AI form, and log. */
export function AdminSettings(props: {
  page: SettingsPage
  config: AdminConfig
  apiKey: string
  logLines: string[]
  onPage: (page: SettingsPage) => void
  onApiKey: (value: string) => void
  onPatchAi: (patch: Partial<AdminConfig['ai']>) => void
  onLogLevel: (logLevel: AdminConfig['logLevel']) => void
  onSaveAi: (e: FormEvent) => void
  onSaveLogLevel: (e: FormEvent) => void
}) {
  if (props.page === 'list') {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">{strings.settingsSection}</h2>
        <ul className="overflow-auto rounded border border-slate-700">
          <li>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-800"
              onClick={() => props.onPage('ai')}
            >
              <span className="block font-medium">{strings.adminTabAi}</span>
              <span className="block text-xs text-slate-400">{strings.settingsAiHint}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-800"
              onClick={() => props.onPage('log')}
            >
              <span className="block font-medium">{strings.adminTabLog}</span>
              <span className="block text-xs text-slate-400">{strings.settingsLogHint}</span>
            </button>
          </li>
        </ul>
      </div>
    )
  }

  if (props.page === 'ai') {
    const ai = props.config.ai
    return (
      <form className="flex max-w-xl flex-col gap-4" onSubmit={props.onSaveAi}>
        <button
          type="button"
          className={`${btnSecondary} self-start`}
          onClick={() => props.onPage('list')}
        >
          {strings.adminBack}
        </button>
        <h2 className="text-lg font-medium">{strings.aiSection}</h2>
        <Field label={strings.aiBaseUrl}>
          <input
            className={inputClass}
            value={ai.baseURL}
            onChange={(e) => props.onPatchAi({ baseURL: e.target.value })}
          />
        </Field>
        <Field
          label={strings.aiApiKey}
          hint={ai.apiKeySet ? strings.aiApiKeySet : strings.aiApiKeyMissing}
        >
          <input
            className={inputClass}
            type="password"
            autoComplete="off"
            value={props.apiKey}
            placeholder={ai.apiKeySet ? '••••••••' : ''}
            onChange={(e) => props.onApiKey(e.target.value)}
          />
        </Field>
        <Field label={strings.aiModel}>
          <input
            className={inputClass}
            value={ai.model}
            onChange={(e) => props.onPatchAi({ model: e.target.value })}
          />
        </Field>
        <Field label={strings.aiTimeout}>
          <input
            className={inputClass}
            type="number"
            min={5000}
            step={1000}
            value={ai.timeoutMs}
            onChange={(e) => props.onPatchAi({ timeoutMs: Number(e.target.value) })}
          />
        </Field>
        <Field label={strings.aiTemperature}>
          <input
            className={inputClass}
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={ai.temperature}
            onChange={(e) => props.onPatchAi({ temperature: Number(e.target.value) })}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={ai.thinkingEnabled}
            onChange={(e) => props.onPatchAi({ thinkingEnabled: e.target.checked })}
          />
          <span>
            {strings.aiThinking}
            <span className="mt-1 block text-xs text-slate-400">{strings.aiThinkingHint}</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={ai.fetchSourceEnabled === true}
            onChange={(e) => props.onPatchAi({ fetchSourceEnabled: e.target.checked })}
          />
          <span>
            {strings.aiFetchSource}
            <span className="mt-1 block text-xs text-slate-400">{strings.aiFetchSourceHint}</span>
          </span>
        </label>
        <button type="submit" className={`${btnClass} self-start`}>
          {strings.saveAi}
        </button>
      </form>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        className={`${btnSecondary} self-start`}
        onClick={() => props.onPage('list')}
      >
        {strings.adminBack}
      </button>
      <h2 className="text-lg font-medium">{strings.logSection}</h2>
      <form className="flex flex-col gap-3" onSubmit={props.onSaveLogLevel}>
        <Field label={strings.logLevel} hint={strings.logLevelHint}>
          <select
            className={inputClass}
            value={props.config.logLevel}
            onChange={(e) => props.onLogLevel(e.target.value as AdminConfig['logLevel'])}
          >
            <option value="error">{strings.logLevelError}</option>
            <option value="warn">{strings.logLevelWarn}</option>
            <option value="info">{strings.logLevelInfo}</option>
            <option value="debug">{strings.logLevelDebug}</option>
          </select>
        </Field>
        <button type="submit" className={`${btnClass} self-start`}>
          {strings.saveLogLevel}
        </button>
      </form>
      <pre className="max-h-64 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-300">
        {props.logLines.length ? props.logLines.join('\n') : '—'}
      </pre>
    </section>
  )
}
