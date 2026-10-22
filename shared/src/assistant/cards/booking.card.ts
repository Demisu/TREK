import { z } from 'zod';

/**
 * Bookings: flights, trains, stays and other reservations. Only its kind so far; the booking cards
 * give it its fields.
 */
export const bookingCardSchema = z.object({ kind: z.literal('booking') });
export type BookingCard = z.infer<typeof bookingCardSchema>;
