import { z } from 'zod';

/** To-dos of the trip. Only its kind so far; the packing and to-do cards give it its fields. */
export const todoListCardSchema = z.object({ kind: z.literal('todoList') });
export type TodoListCard = z.infer<typeof todoListCardSchema>;
