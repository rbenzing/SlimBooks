/**
 * Payment display helper tests.
 *
 * These switches were written against a payment vocabulary the app does not
 * use ('completed', 'cancelled', 'stripe') while omitting 'received' — the
 * default status in the schema and the only one present in the database. Every
 * real payment therefore fell through to the `default` branch and rendered a
 * raw lowercase status in a grey badge.
 */

import { describe, it, expect } from 'vitest';
import {
  getPaymentStatusDisplayName,
  getPaymentStatusColor,
  getPaymentMethodDisplayName,
  getPaymentMethodIcon
} from '@/utils/business/payment.util';
import { PAYMENT_STATUSES, PAYMENT_METHODS } from '@/types';

describe('getPaymentStatusDisplayName', () => {
  it('labels a received payment', () => {
    expect(getPaymentStatusDisplayName('received')).toBe('Received');
  });

  it('gives every supported status a human label', () => {
    for (const status of PAYMENT_STATUSES) {
      const label = getPaymentStatusDisplayName(status);
      expect(label).not.toBe(status);
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });
});

describe('getPaymentStatusColor', () => {
  it('shows a received payment as successful, not unknown', () => {
    expect(getPaymentStatusColor('received')).toBe('green');
  });

  it('assigns a distinct colour per status', () => {
    const colors = PAYMENT_STATUSES.map(getPaymentStatusColor);
    expect(new Set(colors).size).toBe(PAYMENT_STATUSES.length);
  });
});

describe('getPaymentMethodDisplayName', () => {
  it('gives every supported method a human label', () => {
    for (const method of PAYMENT_METHODS) {
      const label = getPaymentMethodDisplayName(method);
      expect(label).not.toBe(method);
    }
  });

  it('labels the method used by seeded payments', () => {
    expect(getPaymentMethodDisplayName('bank_transfer')).toBe('Bank Transfer');
  });
});

describe('getPaymentMethodIcon', () => {
  it('maps every supported method to a named icon', () => {
    for (const method of PAYMENT_METHODS) {
      expect(getPaymentMethodIcon(method)).toMatch(/^[A-Z]/);
    }
  });
});
