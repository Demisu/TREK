import { ArrowRight, Clock, ExternalLink, RotateCcw } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from '../../i18n';
import {
  DialogButton,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogShell,
  DialogTile,
  FooterSpacer,
  NEUTRAL_TINT,
  PILL,
  fs,
} from '../shared/DialogShell';
import TrekIcon from '../shared/TrekIcon';
import { DEMO_FEATURES, DEMO_FULL_VERSION, DEMO_LIMITS, TREK_REPO_URL, type DemoLine } from './demoWelcomeModel';
import { useDemoWelcome } from './useDemoWelcome';

type Translate = ReturnType<typeof useTranslation>['t'];

/** The tiles: what a visitor can open right now, one card each. */
function FeatureGrid({ t }: { t: Translate }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {DEMO_FEATURES.map(({ id, icon: Icon, titleKey, bodyKey }) => (
        <div key={id} className="flex gap-3 rounded-[16px] border border-edge-faint bg-surface-secondary p-3.5">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-[12px] bg-surface-card text-content shadow-sm">
            <Icon size={17} strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-content" style={fs(13.5, 'body')}>
              {t(titleKey)}
            </div>
            <p className="m-0 mt-0.5 leading-snug text-content-muted" style={fs(12, 'body')}>
              {t(bodyKey)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A short list with an icon per line, for what the demo leaves out and what the full version adds. */
function LineList({ lines, tone, t }: { lines: readonly DemoLine[]; tone: 'muted' | 'accent'; t: Translate }) {
  const iconClass = tone === 'accent' ? 'text-success' : 'text-content-faint';
  return (
    <ul className="m-0 flex list-none flex-col gap-2 rounded-[16px] border border-edge-faint bg-surface-card p-3.5">
      {lines.map(({ icon: Icon, labelKey }) => (
        <li key={labelKey} className="flex items-center gap-2.5 text-content-secondary" style={fs(12.5, 'body')}>
          <Icon size={15} strokeWidth={2} className={`flex-none ${iconClass}`} aria-hidden />
          <span>{t(labelKey)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The welcome a demo instance opens with: what TREK is, that the demo resets
 * on the hour (with the live countdown), what to try right away, what the
 * demo leaves out and what the full version adds. Closed by the button,
 * Escape or a click on the backdrop, and shown again on the next visit.
 */
export default function DemoWelcome() {
  const { t } = useTranslation();
  const labelId = useId();
  const { open, close, countdown } = useDemoWelcome();

  return (
    <DialogShell
      open={open}
      onClose={close}
      labelledBy={labelId}
      width="wide"
      header={
        <DialogHeader
          tile={
            <DialogTile>
              <TrekIcon className="h-7 w-7 text-content" />
            </DialogTile>
          }
          tint={NEUTRAL_TINT}
          labelId={labelId}
          onClose={close}
          eyebrow={t('demo.welcome.eyebrow')}
          title={t('demo.welcome.title')}
          sub={t('demo.welcome.tagline')}
          subWraps
          pills={
            <span className={PILL}>
              <Clock size={13} strokeWidth={2.2} aria-hidden />
              {t('demo.welcome.resetIn')}
              <span className="font-geist tabular-nums" data-testid="demo-countdown">
                {countdown}
              </span>
            </span>
          }
        />
      }
      footer={
        <DialogFooter>
          <a
            href={TREK_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-content-muted no-underline hover:text-content"
            style={fs(12.5, 'body')}
          >
            <ExternalLink size={15} strokeWidth={2} aria-hidden />
            {t('demo.welcome.repo')}
          </a>
          <FooterSpacer />
          <DialogButton variant="primary" onClick={close} autoFocus icon={<ArrowRight size={15} strokeWidth={2.2} />}>
            {t('demo.welcome.start')}
          </DialogButton>
        </DialogFooter>
      }
    >
      <div className="flex items-start gap-3 rounded-[16px] bg-warning-soft px-4 py-3">
        <RotateCcw size={17} strokeWidth={2.2} className="mt-0.5 flex-none text-warning" aria-hidden />
        <div className="min-w-0">
          <div className="font-semibold text-content" style={fs(13.5, 'body')}>
            {t('demo.welcome.resetTitle')}
          </div>
          <p className="m-0 mt-0.5 leading-snug text-content-secondary" style={fs(12.5, 'body')}>
            {t('demo.welcome.resetBody')}
          </p>
        </div>
      </div>

      <DialogSection label={t('demo.welcome.tryTitle')}>
        <FeatureGrid t={t} />
      </DialogSection>

      <div className="grid gap-5 md:grid-cols-2">
        <DialogSection label={t('demo.welcome.limitsTitle')}>
          <LineList lines={DEMO_LIMITS} tone="muted" t={t} />
        </DialogSection>
        <DialogSection label={t('demo.welcome.fullTitle')}>
          <LineList lines={DEMO_FULL_VERSION} tone="accent" t={t} />
        </DialogSection>
      </div>
    </DialogShell>
  );
}
