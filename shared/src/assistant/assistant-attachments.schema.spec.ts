import { assistantAttachmentIdSchema, assistantReadAttachedFileArgsSchema } from './assistant-attachments.schema';

import { describe, expect, it } from 'vitest';

const ID = '0b7c2f0e-6f6d-4a8e-9b1a-3d2c1e0f9a87';

describe('assistant attachments contract', () => {
  it('takes an attachment only by a uuid, never a path or a number', () => {
    expect(assistantAttachmentIdSchema.safeParse(ID).success).toBe(true);
    for (const bad of ['../x', '42', '', 42, null]) {
      expect(assistantAttachmentIdSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('reads the model arguments of read_attached_file and drops what the server sets itself', () => {
    expect(assistantReadAttachedFileArgsSchema.parse({ attachmentId: ID, name: 'x.pdf' })).toEqual({
      attachmentId: ID,
    });
    expect(assistantReadAttachedFileArgsSchema.safeParse({}).success).toBe(false);
  });
});
