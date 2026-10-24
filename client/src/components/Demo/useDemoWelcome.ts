import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { formatCountdown, secondsUntilReset } from './demoWelcomeModel';

/**
 * The welcome dialog's state: whether it is still open, and the live countdown
 * to the next hourly reset, ticking once a second in the server's time zone.
 */
export function useDemoWelcome() {
  const timeZone = useAuthStore((s) => s.serverTimezone);
  const [open, setOpen] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntilReset(new Date(), timeZone));

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setSecondsLeft(secondsUntilReset(new Date(), timeZone)), 1000);
    return () => clearInterval(timer);
  }, [open, timeZone]);

  return { open, close: () => setOpen(false), countdown: formatCountdown(secondsLeft) };
}
