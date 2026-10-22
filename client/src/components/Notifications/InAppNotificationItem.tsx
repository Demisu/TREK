import React from 'react'
import { User, Check, X, ArrowRight, Trash2, CheckCheck, Mail } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { InAppNotification } from '../../store/inAppNotificationStore'
import { compactTime, useNotificationItemActions } from './useNotificationItemActions'

function relativeTime(dateStr: string, locale: string): string {
  return compactTime(dateStr, locale === 'ar' ? 'الآن' : 'just now')
}

interface NotificationItemProps {
  notification: InAppNotification
  onClose?: () => void
}

export default function InAppNotificationItem({ notification, onClose }: NotificationItemProps): React.ReactElement {
  const { t, locale } = useTranslation()
  const { responding, handleRespond, handleNavigate, markRead, markUnread, deleteNotification } =
    useNotificationItemActions(notification, onClose)

  const titleText = t(notification.title_key, notification.title_params)
  const bodyText = t(notification.text_key, notification.text_params)
  const hasUnknownTitle = titleText === notification.title_key
  const hasUnknownBody = bodyText === notification.text_key

  return (
    <div
      className={`relative px-4 py-3 transition-colors border-b border-edge-secondary ${notification.is_read ? '' : 'bg-accent-subtle'}`}
    >

      <div className="flex gap-3 items-start">
        {/* Sender avatar */}
        <div className="flex-shrink-0 mt-0.5">
          {notification.sender_avatar ? (
            <img
              src={notification.sender_avatar}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-content-muted bg-surface-tertiary"
            >
              {notification.sender_username
                ? notification.sender_username.charAt(0).toUpperCase()
                : <User className="w-4 h-4" />
              }
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug text-content">
              {hasUnknownTitle ? notification.title_key : titleText}
            </p>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <span className="text-xs me-1 text-content-faint">
                {relativeTime(notification.created_at, locale)}
              </span>
              {notification.is_read ? (
                <button type="button"
                  onClick={() => markUnread(notification.id)}
                  title={t('notifications.markUnread')}
                  aria-label={t('notifications.markUnread')}
                  className="p-1 rounded transition-colors text-content-faint hover:bg-surface-hover hover:text-content focus-visible:bg-surface-hover focus-visible:text-content"
                >
                  <Mail className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button type="button"
                  onClick={() => markRead(notification.id)}
                  title={t('notifications.markRead')}
                  aria-label={t('notifications.markRead')}
                  className="p-1 rounded transition-colors text-content-faint hover:bg-surface-hover hover:text-content focus-visible:bg-surface-hover focus-visible:text-content"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
              )}
              <button type="button"
                onClick={() => deleteNotification(notification.id)}
                title={t('notifications.delete')}
                aria-label={t('notifications.delete')}
                className="p-1 rounded transition-colors text-content-faint hover:bg-danger-soft hover:text-danger focus-visible:bg-danger-soft focus-visible:text-danger"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <p className="text-xs mt-0.5 leading-relaxed text-content-muted">
            {hasUnknownBody ? notification.text_key : bodyText}
          </p>

          {/* Boolean actions */}
          {notification.type === 'boolean' && notification.positive_text_key && notification.negative_text_key && (
            <div className="flex gap-2 mt-2">
              <button type="button"
                onClick={() => handleRespond('positive')}
                disabled={responding || notification.response !== null}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  notification.response === 'positive'
                    ? 'bg-content text-surface'
                    : `bg-surface-tertiary ${notification.response === 'negative' ? 'text-content-faint opacity-50' : 'text-content-secondary'}`
                } ${notification.response !== null || responding ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <Check className="w-3 h-3" />
                {t(notification.positive_text_key)}
              </button>
              <button type="button"
                onClick={() => handleRespond('negative')}
                disabled={responding || notification.response !== null}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  notification.response === 'negative'
                    ? 'bg-danger text-white'
                    : `bg-surface-tertiary ${notification.response === 'positive' ? 'text-content-faint opacity-50' : 'text-content-secondary'}`
                } ${notification.response !== null || responding ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <X className="w-3 h-3" />
                {t(notification.negative_text_key)}
              </button>
            </div>
          )}

          {/* Navigate action */}
          {notification.type === 'navigate' && notification.navigate_text_key && notification.navigate_target && (
            <button type="button"
              onClick={handleNavigate}
              className="flex items-center gap-1 mt-2 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors bg-surface-tertiary text-content-secondary hover:bg-surface-hover focus-visible:bg-surface-hover"
            >
              <ArrowRight className="w-3 h-3" />
              {t(notification.navigate_text_key)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
