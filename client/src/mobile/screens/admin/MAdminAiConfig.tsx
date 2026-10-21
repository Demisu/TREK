import { Check, Loader2 } from 'lucide-react';
import React from 'react';
import { POLICY_CHOICES, useAiAdminConfig } from '../../../components/Admin/addons/useAiAdminConfig';
import AiConnectPanel from '../../../components/Settings/ai/AiConnectPanel';
import { CONNECTION_STATUS } from '../../../components/Settings/ai/aiConnectModel';
import { StatusPill } from '../../../components/Settings/settingsKit';
import { NumericInput } from '../../../components/shared/NumericInput';
import { useTranslation } from '../../../i18n';
import MConfirmSheet from '../settings/MConfirmSheet';
import { MAdminButton, MAdminField, MAdminRow } from './MAdminUi';

type AiAdmin = ReturnType<typeof useAiAdminConfig>;

const SELECT =
  'h-[42px] w-full rounded-xl border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)] px-3 text-body text-m-ink outline-none';

/** Who pays, as stacked rows like the AI parsing provider list. */
function MPolicyChoice({ A }: { A: AiAdmin }) {
  const { t } = useTranslation();
  return (
    <MAdminField label={t('assistant.admin.policy')} hint={A.policyHintKey ? t(A.policyHintKey) : undefined}>
      <div role="radiogroup" aria-label={t('assistant.admin.policy')} className="space-y-[6px]">
        {POLICY_CHOICES.map((choice) => {
          const on = A.policy === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => A.setPolicy(choice.value)}
              className={`flex w-full items-center gap-2 rounded-xl border px-3 py-[10px] text-start ${on ? 'border-[color:var(--m-act)] bg-[color:var(--m-ic)]' : 'border-[color:var(--m-rowbr)]'}`}
            >
              <span className="min-w-0 flex-1 truncate text-body font-semibold text-m-ink">{t(choice.labelKey)}</span>
              {on && <Check size={15} strokeWidth={2.4} className="flex-none text-m-ink" />}
            </button>
          );
        })}
      </div>
    </MAdminField>
  );
}

/** The connection everyone runs on: the live one with its model, or the panel to set one up. */
function MInstanceConnection({ A }: { A: AiAdmin }) {
  const { t } = useTranslation();
  const {
    live,
    connection,
    provider,
    models,
    busy,
    setModel,
    replacing,
    replace,
    cancelReplace,
    askRemove,
    onConnected,
  } = A.instance;
  return (
    <MAdminField label={t('assistant.admin.connection')}>
      {live && !replacing && (
        <>
          <MAdminRow
            first
            title={provider}
            hint={live.hint ?? live.host}
            trailing={
              <StatusPill tone={CONNECTION_STATUS[live.status].tone}>
                {t(CONNECTION_STATUS[live.status].labelKey)}
              </StatusPill>
            }
          />
          {live.status === 'ok' && (
            <select
              aria-label={t('assistant.connect.model')}
              className={SELECT}
              value={live.model}
              disabled={busy}
              onChange={(e) => setModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <MAdminButton variant="ghost" disabled={busy} onClick={replace}>
              {t('common.change')}
            </MAdminButton>
            <MAdminButton variant="danger" disabled={busy} onClick={askRemove}>
              {t('assistant.admin.connectionRemove')}
            </MAdminButton>
          </div>
        </>
      )}
      {A.showPanel && (
        <div className="space-y-3">
          {!live && <p className="font-geist text-caption text-m-faint">{t('assistant.admin.connectionNone')}</p>}
          <AiConnectPanel scope="instance" onConnected={onConnected} prefill={connection?.prefill ?? null} />
          {replacing && (
            <MAdminButton variant="ghost" onClick={cancelReplace}>
              {t('common.cancel')}
            </MAdminButton>
          )}
        </div>
      )}
    </MAdminField>
  );
}

/**
 * Phone twin of components/Admin/addons/AiAdminConfig, on the same
 * useAiAdminConfig hook, in the AI parsing form's layout under its tile.
 */
export default function MAdminAiConfig(): React.ReactElement {
  const { t } = useTranslation();
  const A = useAiAdminConfig();

  if (!A.loaded) {
    return (
      <div className="grid place-items-center py-4 ps-[50px]">
        <Loader2 size={18} className="animate-spin text-m-faint" />
      </div>
    );
  }

  return (
    <div className="space-y-5 ps-[50px]">
      <MPolicyChoice A={A} />
      {A.instancePays && <MInstanceConnection A={A} />}
      {A.instancePays && (
        <MAdminField label={t('assistant.admin.dailyLimit')} hint={t('assistant.admin.dailyLimitHint')}>
          <NumericInput
            mode="integer"
            aria-label={t('assistant.admin.dailyLimit')}
            className={`${SELECT} tabular-nums`}
            value={A.dailyDraft}
            onValueChange={A.setDailyDraft}
            onBlur={A.commitDailyLimit}
          />
        </MAdminField>
      )}
      <MAdminField label={t('assistant.admin.retention')}>
        <select
          aria-label={t('assistant.admin.retention')}
          className={SELECT}
          value={A.retention}
          onChange={(e) => A.setRetention(e.target.value)}
        >
          {A.retentionOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </MAdminField>

      <MConfirmSheet
        open={A.instance.confirmingRemove}
        onClose={A.instance.cancelRemove}
        title={t('assistant.admin.connectionRemove')}
        message={t('assistant.connect.disconnectConfirm', { provider: A.instance.provider })}
        confirmLabel={t('assistant.admin.connectionRemove')}
        cancelLabel={t('common.cancel')}
        danger
        busy={A.instance.busy}
        onConfirm={A.instance.remove}
      />
    </div>
  );
}
