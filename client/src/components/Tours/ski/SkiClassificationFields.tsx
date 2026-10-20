import { SKI_DISCIPLINES, SKI_TECHNIQUES, type SkiDiscipline, type SkiTechnique } from '@trek/shared';
import { Info } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { LABEL, Segmented } from '../../shared/dialogParts';
import { InfoDot, TourNotice } from '../tourParts';
import { skiChoiceMissing, type SkiChoice } from './skiChoice';
import { SKI_DISCIPLINE_ICON } from './skiDiscipline';

/**
 * SKI-02: what a ski track is, chosen on purpose: the discipline, none until
 * one is picked, and for cross-country the technique, Unknown among its
 * answers. The technique stays in sight but dimmed while another discipline
 * is chosen. The info dot says what TREK does with the track. The GPX import
 * and the classification dialog share it.
 */
export function SkiClassificationFields({
  choice,
  onChange,
}: {
  choice: SkiChoice;
  onChange: (choice: SkiChoice) => void;
}) {
  const { t } = useTranslation();
  const crossCountry = choice.discipline === 'cross_country';
  const missing = skiChoiceMissing(choice);
  return (
    <div data-testid="tour-ski-fields" className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0">
        <div className="mb-[5px] flex min-h-5 min-w-0 items-center gap-1">
          <span className={`${LABEL} !mb-0 min-w-0 truncate leading-5`}>{t('tours.ski.discipline')}</span>
          <InfoDot label={t('tours.ski.infoLabel')} description={t('tours.ski.info')} />
        </div>
        <Segmented<SkiDiscipline>
          value={(choice.discipline ?? '') as SkiDiscipline}
          onChange={(discipline) => onChange({ ...choice, discipline })}
          label={t('tours.ski.discipline')}
          fill
          options={SKI_DISCIPLINES.map((discipline) => {
            const Icon = SKI_DISCIPLINE_ICON[discipline];
            return {
              value: discipline,
              label: t(`tours.ski.discipline.${discipline}`),
              icon: <Icon size={13} strokeWidth={2} aria-hidden="true" />,
            };
          })}
        />
      </div>
      <fieldset
        data-testid="tour-ski-technique"
        disabled={!crossCountry}
        className={`m-0 min-w-0 border-0 p-0 transition-opacity ${crossCountry ? '' : 'opacity-50'}`}
      >
        <span className={LABEL}>{t('tours.ski.technique')}</span>
        <Segmented<SkiTechnique>
          value={(crossCountry ? (choice.technique ?? '') : '') as SkiTechnique}
          onChange={(technique) => onChange({ ...choice, technique })}
          label={t('tours.ski.technique')}
          fill
          options={SKI_TECHNIQUES.map((technique) => ({
            value: technique,
            label: t(`tours.ski.technique.${technique}`),
          }))}
        />
      </fieldset>
      {missing && (
        <TourNotice role="status" icon={<Info size={13} strokeWidth={2} />}>
          {t(missing === 'discipline' ? 'tours.ski.chooseDiscipline' : 'tours.ski.chooseTechnique')}
        </TourNotice>
      )}
    </div>
  );
}
