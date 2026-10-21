import { useTranslation } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../shared/Toast';

/**
 * Whether the trip map follows the assistant: pans to where it searches and
 * frames the places it suggests. On unless switched off. Behind the switch in
 * both AI settings shells, the desktop section and the phone card.
 */
export function useAssistantMapFollow(): { on: boolean; set: (on: boolean) => Promise<void> } {
  const on = useSettingsStore((s) => s.settings.assistant_map_follow) !== false;
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const { t } = useTranslation();
  const toast = useToast();

  const set = async (next: boolean) => {
    try {
      await updateSetting('assistant_map_follow', next);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('common.error'));
    }
  };

  return { on, set };
}
