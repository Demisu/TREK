// FE-JRN-DAY-IMPORT-BTN-001 to FE-JRN-DAY-IMPORT-BTN-003
//
// JRN-02: the day header's way into taking a day over with its stays.
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../../tests/helpers/render';
import JourneyDayImportButton from './JourneyDayImportButton';

function renderButton(props: Partial<Parameters<typeof JourneyDayImportButton>[0]> = {}) {
  const onOpen = vi.fn();
  const view = render(
    <JourneyDayImportButton pending={0} canTakeOver needsConnection={false} onOpen={onOpen} {...props} />
  );
  return { onOpen, ...view };
}

describe('JourneyDayImportButton', () => {
  it('FE-JRN-DAY-IMPORT-BTN-001: counts the stays still waiting on the day and opens the take-over', async () => {
    const { onOpen } = renderButton({ pending: 6 });
    const button = screen.getByTestId('journey-day-import');
    expect(button).toHaveTextContent('6');
    expect(button).toHaveAccessibleName('6 stays to review');
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('FE-JRN-DAY-IMPORT-BTN-002: a day with nothing waiting still offers the take-over, without a number', () => {
    renderButton();
    const button = screen.getByTestId('journey-day-import');
    expect(button).toHaveAccessibleName('Take over this day with its stays');
    expect(button.textContent).toBe('');
  });

  it('FE-JRN-DAY-IMPORT-BTN-003: offline it stays dimmed and says why; without Dawarich or the right to edit it is not there', async () => {
    const { onOpen, unmount } = renderButton({ canTakeOver: false, needsConnection: true, pending: 2 });
    const button = screen.getByTestId('journey-day-import');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    expect(onOpen).not.toHaveBeenCalled();
    unmount();

    renderButton({ canTakeOver: false, needsConnection: false });
    expect(screen.queryByTestId('journey-day-import')).not.toBeInTheDocument();
  });
});
