import { Check, Loader2 } from 'lucide-react';
import React, { useId } from 'react';
import { useTranslation } from '../../../i18n';
import AiConnectPanel, { ProviderMark } from '../../Settings/ai/AiConnectPanel';
import { CONNECTION_STATUS } from '../../Settings/ai/aiConnectModel';
import { SETTINGS_BUTTON, SETTINGS_BUTTON_DANGER, SettingsHint, StatusPill } from '../../Settings/settingsKit';
import ConfirmDialog from '../../shared/ConfirmDialog';
import CustomSelect from '../../shared/CustomSelect';
import { fs } from '../../shared/DialogShell';
import { NumericInput } from '../../shared/NumericInput';
import { EditorField, INPUT } from '../../shared/dialogParts';
import { POLICY_CHOICES, useAiAdminConfig } from './useAiAdminConfig';

type AiAdmin = ReturnType<typeof useAiAdminConfig>;

const EYEBROW = 'font-geist font-bold uppercase tracking-[.08em] text-content-faint';

/** Who pays, as three rows to pick one from: the labels are too long for a segmented track in a shelf. */
function PolicyChoice({ A }: { A: AiAdmin }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <span className={EYEBROW} style={fs(9.5)}>
        {t('assistant.admin.policy')}
      </span>
      <div role="radiogroup" aria-label={t('assistant.admin.policy')} className="flex flex-col gap-1.5">
        {POLICY_CHOICES.map((choice) => {
          const on = A.policy === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => A.setPolicy(choice.value)}
              className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-start transition-colors ${on ? 'border-[color:var(--text-primary)] bg-surface-card shadow-sm' : 'border-edge bg-surface-card hover:border-edge-secondary'}`}
            >
              <span
                className={`min-w-0 flex-1 font-medium ${on ? 'text-content' : 'text-content-muted'}`}
                style={fs(12.5, 'body')}
              >
                {t(choice.labelKey)}
              </span>
              {on && <Check size={14} strokeWidth={2.4} className="flex-none text-content" />}
            </button>
          );
        })}
      </div>
      {A.policyHintKey && <SettingsHint>{t(A.policyHintKey)}</SettingsHint>}
    </div>
  );
}

/** The connection everyone runs on, once set up: who answers, its model, and replacing or removing it. */
function LiveConnection({ A }: { A: AiAdmin }) {
  const { t } = useTranslation();
  const { live, provider, models, busy, setModel, replace, askRemove } = A.instance;
  if (!live) return null;
  const status = CONNECTION_STATUS[live.status];
  return (
    <div
      className={`flex flex-col gap-3 rounded-[12px] border border-edge-faint bg-surface-card p-3 ${busy ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2.5">
        <ProviderMark kind={live.kind} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate font-medium text-content" style={fs(13, 'body')}>
            {provider}
          </p>
          <p className="m-0 truncate font-geist text-content-faint" style={fs(11)}>
            {live.hint ?? live.host}
          </p>
        </div>
        <StatusPill tone={status.tone}>{t(status.labelKey)}</StatusPill>
      </div>
      {live.status === 'ok' && (
        <EditorField label={t('assistant.connect.model')} hint={t('assistant.connect.modelHint')}>
          <CustomSelect
            ariaLabel={t('assistant.connect.model')}
            value={live.model}
            onChange={(v) => setModel(String(v))}
            options={models}
            size="sm"
            disabled={busy}
            searchable={models.length > 8}
          />
        </EditorField>
      )}
      <div className="flex flex-wrap gap-2" style={fs(12.5, 'body')}>
        <button type="button" onClick={replace} disabled={busy} className={SETTINGS_BUTTON}>
          {t('common.change')}
        </button>
        <button type="button" onClick={askRemove} disabled={busy} className={SETTINGS_BUTTON_DANGER}>
          {t('assistant.admin.connectionRemove')}
        </button>
      </div>
    </div>
  );
}

function InstanceConnection({ A }: { A: AiAdmin }) {
  const { t } = useTranslation();
  const { live, connection, replacing, cancelReplace, onConnected } = A.instance;
  return (
    <div className="flex flex-col gap-2.5">
      <span className={EYEBROW} style={fs(9.5)}>
        {t('assistant.admin.connection')}
      </span>
      {!replacing && <LiveConnection A={A} />}
      {!live && <SettingsHint>{t('assistant.admin.connectionNone')}</SettingsHint>}
      {A.showPanel && (
        <AiConnectPanel scope="instance" onConnected={onConnected} prefill={connection?.prefill ?? null} />
      )}
      {replacing && (
        <button
          type="button"
          onClick={cancelReplace}
          className={`${SETTINGS_BUTTON} self-start`}
          style={fs(12.5, 'body')}
        >
          {t('common.cancel')}
        </button>
      )}
    </div>
  );
}

/**
 * The AI assistant's settings on its addon tile, as a form in the shelf like
 * AI parsing's: who pays, the connection for everyone, the daily limit while
 * the instance pays, and how long chats are kept. Each change saves at once.
 */
export default function AiAdminConfig(): React.ReactElement {
  const { t } = useTranslation();
  const A = useAiAdminConfig();
  const fieldId = useId();

  if (!A.loaded) {
    return (
      <li className="grid place-items-center p-4">
        <Loader2 size={18} className="animate-spin text-content-faint" />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-4 p-3">
      <PolicyChoice A={A} />
      {A.instancePays && <InstanceConnection A={A} />}
      {A.instancePays && (
        <EditorField
          label={t('assistant.admin.dailyLimit')}
          htmlFor={`${fieldId}-daily`}
          hint={t('assistant.admin.dailyLimitHint')}
        >
          <NumericInput
            id={`${fieldId}-daily`}
            mode="integer"
            className={`${INPUT} tabular-nums`}
            value={A.dailyDraft}
            onValueChange={A.setDailyDraft}
            onBlur={A.commitDailyLimit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </EditorField>
      )}
      <EditorField label={t('assistant.admin.retention')}>
        <CustomSelect
          ariaLabel={t('assistant.admin.retention')}
          value={A.retention}
          onChange={(v) => A.setRetention(String(v))}
          options={A.retentionOptions}
          size="sm"
        />
      </EditorField>

      <ConfirmDialog
        isOpen={A.instance.confirmingRemove}
        onClose={A.instance.cancelRemove}
        onConfirm={A.instance.remove}
        title={t('assistant.admin.connectionRemove')}
        message={t('assistant.connect.disconnectConfirm', { provider: A.instance.provider })}
        confirmLabel={t('assistant.admin.connectionRemove')}
        danger
      />
    </li>
  );
}
