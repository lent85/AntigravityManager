import { describe, it, expect } from 'vitest';
import {
  maskEmail,
  maskName,
  maskInitial,
  MASKED_NAME,
  MASKED_EMAIL,
  MASKED_INITIAL,
} from '@/modules/cloud-account/utils/identity-masking';

describe('identity-masking utility', () => {
  describe('maskEmail', () => {
    it('returns original email when enabled is false', () => {
      expect(maskEmail('fanxincom@gmail.com', false)).toBe('fanxincom@gmail.com');
      expect(maskEmail('user@test.org', false)).toBe('user@test.org');
    });

    it('returns masked placeholder when enabled is true', () => {
      expect(maskEmail('fanxincom@gmail.com', true)).toBe(MASKED_EMAIL);
      expect(maskEmail('sharingworld@gmail.com', true)).toBe(MASKED_EMAIL);
    });

    it('handles empty / undefined email gracefully', () => {
      expect(maskEmail('', true)).toBe('');
      expect(maskEmail(null, true)).toBe('');
      expect(maskEmail(undefined, true)).toBe('');
    });
  });

  describe('maskName', () => {
    it('returns original name when enabled is false', () => {
      expect(maskName('fan xin', false)).toBe('fan xin');
      expect(maskName('Ben Brim', false)).toBe('Ben Brim');
      expect(maskName(undefined, false, 'Default')).toBe('Default');
    });

    it('returns masked placeholder when enabled is true without exposing any characters', () => {
      expect(maskName('fan xin', true)).toBe(MASKED_NAME);
      expect(maskName('Ben Brim', true)).toBe(MASKED_NAME);
      expect(maskName('A', true)).toBe(MASKED_NAME);
    });

    it('handles empty / undefined name gracefully', () => {
      expect(maskName('', true)).toBe(MASKED_NAME);
      expect(maskName(null, true)).toBe(MASKED_NAME);
      expect(maskName(undefined, true)).toBe(MASKED_NAME);
    });
  });

  describe('maskInitial', () => {
    it('returns first character uppercase when enabled is false', () => {
      expect(maskInitial('fan xin', 'fanxincom@gmail.com', false)).toBe('F');
      expect(maskInitial(undefined, 'sharingworld@gmail.com', false)).toBe('S');
    });

    it('returns masked initial when enabled is true', () => {
      expect(maskInitial('fan xin', 'fanxincom@gmail.com', true)).toBe(MASKED_INITIAL);
      expect(maskInitial(undefined, 'sharingworld@gmail.com', true)).toBe(MASKED_INITIAL);
    });
  });
});
