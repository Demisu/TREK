import { Ellipsis, History, Lightbulb, LightbulbOff, Plus, Settings, Trash2, X } from 'lucide-react';
import { type HTMLAttributes, type MouseEvent, useState } from 'react';
import { useNavigate } from 'react-router';

import { useTranslation } from '../../i18n';
import { PopoverItem } from '../Packing/PackingPopover';
import ConfirmDialog from '../shared/ConfirmDialog';
import { NEUTRAL_TINT } from '../shared/DialogShell';
import { ContextMenu, useContextMenu } from '../shared/ContextMenu';
import Tooltip from '../shared/Tooltip';
import { PopoverListPanel } from '../shared/dialogParts';
import { usePopoverList } from '../shared/usePopoverList';
import { AI_SETTINGS_PATH } from './assistantParts';
import { useAssistantHintsSetting } from './useAssistantHints';
import type { useAssistantThread } from './useAssistantThread';

// The round, raised buttons of TREK's dialog heads.
const ICON_BUTTON =
  'grid h-7 w-7 place-items-center rounded-full bg-surface-card text-content-muted shadow-sm transition-colors hover:text-content';

interface AssistantHeaderProps {
  thread: ReturnType<typeof useAssistantThread>;
  tripTitle: string;
  onClose: () => void;
  /** Moves the window: spread on the title, which is the part of the header to grab. */
  dragProps: HTMLAttributes<HTMLElement>;
}

/**
 * The window's head, in the look of TREK's dialog heads: a tinted band with
 * a small line naming the assistant over the conversation's name; the band is where the window is
 * grabbed to move it. On the end side the recent chats (a new chat starts at
 * the top of that list), more and close, as round raised buttons. Closing
 * keeps the conversation, and an answer being written goes on. The model is not picked here;
 * that lives in the settings.
 */
export default function AssistantHeader({ thread, tripTitle, onClose, dragProps }: AssistantHeaderProps) {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const menu = useContextMenu();
  const [confirming, setConfirming] = useState(false);
  const threads = thread.threads ?? [];
  const history = usePopoverList(threads.findIndex((th) => th.id === thread.threadId) + 1);
  const hints = useAssistantHintsSetting();

  const openHistory = () => {
    if (!history.open) thread.refreshThreads();
    history.toggle();
  };

  const pick = (run: () => void) => {
    history.close();
    run();
  };

  const openMenu = (e: MouseEvent) =>
    menu.open(
      e,
      [
        {
          label: t('assistant.history.new'),
          icon: Plus,
          disabled: thread.threadId === null && !thread.isRunning,
          onClick: thread.newThread,
        },
        {
          label: t(hints.on ? 'assistant.hint.menuOff' : 'assistant.hint.menuOn'),
          icon: hints.on ? LightbulbOff : Lightbulb,
          onClick: hints.toggle,
        },
        { label: t('assistant.window.settings'), icon: Settings, onClick: () => void navigate(AI_SETTINGS_PATH) },
        {
          label: t('assistant.window.deleteThread'),
          icon: Trash2,
          danger: true,
          disabled: thread.threadId === null || thread.isRunning,
          onClick: () => setConfirming(true),
        },
      ],
      true
    );

  return (
    <header
      className="flex flex-shrink-0 items-center gap-2 border-b border-edge-faint py-2.5 pe-2.5 ps-4"
      style={{ background: NEUTRAL_TINT }}
    >
      <div
        {...dragProps}
        className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center active:cursor-grabbing"
      >
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate font-geist text-caption font-bold uppercase tracking-[.08em] text-content-muted">
            {t('assistant.launcher.tooltip')}
          </p>
          <h2 className="m-0 truncate text-body font-bold tracking-[-0.01em] text-content">
            <bdi>{thread.title ?? tripTitle}</bdi>
          </h2>
        </div>
      </div>
      {/* Buttons are no place to start a drag from. */}
      <div
        className="flex flex-shrink-0 items-center gap-1"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Tooltip label={t('assistant.history.open')}>
          <button
            ref={history.triggerRef}
            type="button"
            onClick={openHistory}
            aria-label={t('assistant.history.open')}
            aria-expanded={history.open}
            aria-controls={history.open ? history.listId : undefined}
            className={ICON_BUTTON}
          >
            <History size={13} aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip label={t('assistant.window.menu')}>
          <button
            type="button"
            onClick={openMenu}
            aria-label={t('assistant.window.menu')}
            aria-haspopup="menu"
            className={ICON_BUTTON}
          >
            <Ellipsis size={14} aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip label={t('common.close')}>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className={ICON_BUTTON}>
            <X size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      <PopoverListPanel list={history} label={t('assistant.history.open')} className="w-72">
        <PopoverItem
          icon={<Plus size={14} />}
          label={t('assistant.history.new')}
          onClick={() => pick(thread.newThread)}
        />
        {threads.length === 0 ? (
          <p className="m-0 px-2.5 py-2 text-caption text-content-muted">{t('assistant.history.empty')}</p>
        ) : (
          threads.map((th) => (
            <PopoverItem
              key={th.id}
              icon={null}
              label={th.title}
              active={th.id === thread.threadId}
              onClick={() => pick(() => thread.openThread(th.id))}
              trailing={
                <span className="flex-shrink-0 text-caption text-content-faint">
                  {new Date(th.lastMessageAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                </span>
              }
            />
          ))
        )}
        {thread.retentionNote && (
          <p className="m-0 border-t border-edge-faint px-2.5 pb-1 pt-2 text-caption text-content-faint">
            {thread.retentionNote}
          </p>
        )}
      </PopoverListPanel>

      <ContextMenu menu={menu.menu} onClose={menu.close} />
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void thread.removeThread();
        }}
        title={t('assistant.window.deleteThread')}
        message={t('assistant.window.deleteConfirm')}
        confirmLabel={t('common.delete')}
      />
    </header>
  );
}
