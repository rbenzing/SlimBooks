/**
 * SettingsService tests.
 *
 * Every setting round-trips through JSON, and the key is namespaced on the way
 * in but not on the way out — so the read and write paths have to agree on the
 * exact key or a saved setting silently reads back as its default. That is what
 * `getSetting()` returning undefined for every key looked like from the UI.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabaseMock } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { settingsService } = await import('./SettingsService.js');

const env = { ...process.env };

beforeEach(() => db.reset());
afterEach(() => { process.env = { ...env }; });

describe('saveSetting', () => {
  it('namespaces a bare key under its category', async () => {
    await settingsService.saveSetting('invoice_prefix', 'INV', 'general');

    expect(db.queries[0].params).toEqual(['general.invoice_prefix', 'INV', 'general']);
  });

  it('leaves an already-namespaced key alone', async () => {
    await settingsService.saveSetting('company.name', 'Slimbooks', 'company');

    expect(db.queries[0].params[0]).toBe('company.name');
  });

  it('defaults the category to general', async () => {
    await settingsService.saveSetting('theme', 'dark');

    expect(db.queries[0].params).toEqual(['general.theme', 'dark', 'general']);
  });

  it('stores a string verbatim so it reads back unquoted', async () => {
    await settingsService.saveSetting('theme', 'dark');

    expect(db.queries[0].params[1]).toBe('dark');
  });

  it('serialises objects, numbers and booleans as JSON', async () => {
    await settingsService.saveSetting('currency', { code: 'USD', symbol: '$' }, 'format');
    expect(db.queries[0].params[1]).toBe('{"code":"USD","symbol":"$"}');

    db.reset();
    await settingsService.saveSetting('page_size', 25, 'general');
    expect(db.queries[0].params[1]).toBe('25');

    db.reset();
    await settingsService.saveSetting('dark_mode', true, 'general');
    expect(db.queries[0].params[1]).toBe('true');
  });

  it('replaces rather than duplicating an existing key', async () => {
    await settingsService.saveSetting('theme', 'dark');

    expect(db.queries[0].sql).toMatch(/INSERT OR REPLACE/i);
  });

  it('rejects a missing key', async () => {
    await expect(settingsService.saveSetting('', 'x')).rejects.toThrow(/key/i);
  });
});

describe('getSettingByKey', () => {
  it('parses a JSON value back into an object', async () => {
    db.getOne.mockReturnValue({ value: '{"code":"USD"}' });

    await expect(settingsService.getSettingByKey('format.currency')).resolves.toEqual({ code: 'USD' });
  });

  it('returns a plain string that was never JSON', async () => {
    db.getOne.mockReturnValue({ value: 'dark' });

    await expect(settingsService.getSettingByKey('general.theme')).resolves.toBe('dark');
  });

  it('reads back exactly the key that was written', async () => {
    // The namespacing on write must match the lookup on read.
    await settingsService.saveSetting('theme', 'dark', 'general');
    const writtenKey = db.queries[0].params[0];

    db.getOne.mockReturnValue({ value: 'dark' });
    await settingsService.getSettingByKey(writtenKey as string);

    expect(db.getOne.mock.calls[0][1]).toEqual([writtenKey]);
  });

  it('returns null for a key that has never been set', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(settingsService.getSettingByKey('general.missing')).resolves.toBeNull();
  });

  it('rejects a missing key', async () => {
    await expect(settingsService.getSettingByKey('')).rejects.toThrow(/key/i);
  });
});

describe('getAllSettings', () => {
  it('returns a keyed map with values parsed', async () => {
    db.getMany.mockReturnValue([
      { key: 'general.theme', value: 'dark' },
      { key: 'format.currency', value: '{"code":"USD"}' }
    ]);

    await expect(settingsService.getAllSettings()).resolves.toEqual({
      'general.theme': 'dark',
      'format.currency': { code: 'USD' }
    });
  });

  it('filters by category prefix when asked', async () => {
    await settingsService.getAllSettings('format');

    expect(db.getMany.mock.calls[0][1]).toEqual(['format.%']);
  });

  it('reads every setting when unfiltered', async () => {
    await settingsService.getAllSettings();

    expect(db.getMany.mock.calls[0][0]).not.toMatch(/WHERE/);
    expect(db.getMany.mock.calls[0][1]).toEqual([]);
  });

  it('returns an empty map rather than undefined on a fresh install', async () => {
    db.getMany.mockReturnValue([]);

    await expect(settingsService.getAllSettings()).resolves.toEqual({});
  });
});

describe('bulk writes', () => {
  it('writes every setting inside one transaction', async () => {
    await settingsService.saveMultipleSettings({
      theme: { value: 'dark' },
      currency: { value: { code: 'USD' }, category: 'format' }
    });

    expect(db.executeTransaction).toHaveBeenCalledTimes(1);
    expect(db.queries.map(q => q.params[0])).toEqual(['general.theme', 'format.currency']);
  });

  it('rejects a malformed entry instead of writing a partial batch', async () => {
    await expect(
      settingsService.saveMultipleSettings({ theme: null as never })
    ).rejects.toThrow(/invalid setting data/i);
  });

  it('writes format settings under the format category without renaming keys', async () => {
    await settingsService.updateFormatSettings({ date_format: 'MM/dd/yyyy', page_size: 25 });

    expect(db.queries.map(q => q.params)).toEqual([
      ['date_format', 'MM/dd/yyyy', 'format'],
      ['page_size', '25', 'format']
    ]);
  });

  it('skips an undefined format value rather than storing the string "undefined"', async () => {
    await settingsService.updateFormatSettings({ date_format: 'MM/dd/yyyy', page_size: undefined });

    expect(db.queries).toHaveLength(1);
  });

  it('rejects a non-object payload', async () => {
    await expect(settingsService.updateFormatSettings(null as never)).rejects.toThrow(/required/i);
    await expect(settingsService.saveMultipleSettings(null as never)).rejects.toThrow(/required/i);
  });
});

describe('project settings', () => {
  it('flattens nested settings into dotted keys', async () => {
    await settingsService.updateProjectSettings({
      email: { enabled: true, smtp_host: 'smtp.example.com', smtp_port: 587 } as never
    });

    const keys = db.queries.map(q => q.params[0]);
    expect(keys).toContain('email.smtp_host');
    expect(keys).toContain('email.smtp_port');
  });

  it('stores the enabled flag so switching an integration on survives', async () => {
    // It used to be lifted out of the payload and written to an `enabled`
    // column that the settings table does not have and the INSERT never
    // mentioned, so the flag was dropped and read back as false forever.
    await settingsService.updateProjectSettings({
      stripe: { enabled: true, publishable_key: 'pk_test_x' } as never
    });

    const written = new Map(db.queries.map(q => [q.params[0], q.params[1]]));
    expect(written.get('stripe.enabled')).toBe('true');
  });

  it('reads back an integration that was switched on', async () => {
    db.getMany.mockReturnValue([{ key: 'stripe.enabled', value: 'true' }]);

    const settings = await settingsService.getProjectSettings();

    expect(settings.stripe.enabled).toBe(true);
  });

  it('does not store the derived configured flag', async () => {
    // `configured` is worked out on read from whether the credentials resolve.
    // Storing the client's copy would let the UI assert it.
    await settingsService.updateProjectSettings({
      stripe: { enabled: true, publishable_key: 'pk_test_x', configured: true } as never
    });

    expect(db.queries.map(q => q.params[0])).not.toContain('stripe.configured');
  });

  it('decodes a JSON-encoded stored value rather than returning it quoted', async () => {
    // Writes go through JSON.stringify, so a string arrives back as "\"x\"".
    db.getMany.mockReturnValue([
      { key: 'stripe.publishable_key', value: JSON.stringify('pk_test_stored') }
    ]);

    const settings = await settingsService.getProjectSettings();

    expect(settings.stripe.publishable_key).toBe('pk_test_stored');
  });

  it('keeps a stored secret when the save omits it', async () => {
    // The settings screens never receive secrets back, so they post a blank
    // for anything the admin did not retype. Writing that through would wipe
    // the key on every unrelated save.
    await settingsService.updateProjectSettings({
      stripe: { enabled: true, publishable_key: 'pk_test_x', secret_key: '' } as never
    });

    expect(db.queries.map(q => q.params[0])).not.toContain('stripe.secret_key');
  });

  it('stores a secret the admin did type', async () => {
    await settingsService.updateProjectSettings({
      stripe: { enabled: true, secret_key: 'sk_test_new' } as never
    });

    const written = new Map(db.queries.map(q => [q.params[0], q.params[1]]));
    expect(written.get('stripe.secret_key')).toBe(JSON.stringify('sk_test_new'));
  });

  it('rejects a non-object payload', async () => {
    await expect(settingsService.updateProjectSettings(null as never)).rejects.toThrow(/required/i);
  });

  it('falls back to environment values when nothing is stored', async () => {
    db.getMany.mockReturnValue([]);
    process.env.SMTP_HOST = 'smtp.env.test';
    process.env.SMTP_USER = 'mailer';
    process.env.EMAIL_FROM = 'billing@example.com';

    const settings = await settingsService.getProjectSettings();

    expect(settings.email.smtp_host).toBe('smtp.env.test');
    expect(settings.email.configured).toBe(true);
  });

  it('reports an unconfigured integration rather than half-enabling it', async () => {
    db.getMany.mockReturnValue([]);
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    const settings = await settingsService.getProjectSettings();

    expect(settings.stripe.configured).toBe(false);
    expect(settings.stripe.enabled).toBe(false);
  });

  it('prefers a stored value over the environment default', async () => {
    db.getMany.mockReturnValue([
      { key: 'email.smtp_host', value: 'smtp.stored.test' },
      { key: 'email.enabled', value: 'true' }
    ]);
    process.env.SMTP_HOST = 'smtp.env.test';

    const settings = await settingsService.getProjectSettings();

    expect(settings.email.smtp_host).toBe('smtp.stored.test');
    expect(settings.email.enabled).toBe(true);
  });

  it('falls back to a safe port when the stored one is nonsense', async () => {
    db.getMany.mockReturnValue([{ key: 'email.smtp_port', value: 'not-a-port' }]);

    const settings = await settingsService.getProjectSettings();

    expect(settings.email.smtp_port).toBe(587);
  });

  it('applies password policy defaults', async () => {
    db.getMany.mockReturnValue([]);

    const settings = await settingsService.getProjectSettings();

    expect(settings.security.password_policy).toMatchObject({
      min_length: 8, require_uppercase: false, require_special: false
    });
    expect(settings.security.max_failed_login_attempts).toBe(5);
  });

  it('surfaces a database failure instead of returning half a config', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.getMany.mockImplementation(() => { throw new Error('table missing'); });

    await expect(settingsService.getProjectSettings()).rejects.toThrow(/failed to get project settings/i);
  });
});

/**
 * This endpoint answers an HTTP request. Everything it returns is disclosed, so
 * the tests below are about what must NOT be in it — this response used to
 * carry the JWT signing secret, the session secret, the Stripe secret key, the
 * SMTP password and the OAuth client secret, to any caller at all.
 */
describe('project settings redaction', () => {
  const storedCredentials = () => {
    db.getMany.mockReturnValue([
      { key: 'stripe.enabled', value: 'true' },
      { key: 'stripe.secret_key', value: JSON.stringify('sk_live_supersecret') },
      { key: 'stripe.publishable_key', value: JSON.stringify('pk_live_public') },
      { key: 'stripe.webhook_secret', value: JSON.stringify('whsec_supersecret') },
      { key: 'google_oauth.enabled', value: 'true' },
      { key: 'google_oauth.client_id', value: JSON.stringify('client-id') },
      { key: 'google_oauth.client_secret', value: JSON.stringify('google-supersecret') },
      { key: 'email.smtp_host', value: JSON.stringify('smtp.example.com') },
      { key: 'email.smtp_user', value: JSON.stringify('mailer') },
      { key: 'email.smtp_pass', value: JSON.stringify('smtp-supersecret') },
      { key: 'email.email_from', value: JSON.stringify('billing@example.com') }
    ]);
  };

  beforeEach(() => {
    storedCredentials();
    process.env.JWT_SECRET = 'jwt-supersecret';
    process.env.SESSION_SECRET = 'session-supersecret';
  });

  it('withholds every credential from the admin view', async () => {
    const settings = await settingsService.getProjectSettings();

    expect(JSON.stringify(settings)).not.toMatch(/supersecret/);
  });

  it('withholds the JWT and session secrets', async () => {
    const settings = await settingsService.getProjectSettings();

    expect(settings.security).not.toHaveProperty('jwt_secret');
    expect(settings.security).not.toHaveProperty('session_secret');
  });

  it('still reports what is configured, so the UI can say so', async () => {
    const settings = await settingsService.getProjectSettings();

    expect(settings.stripe.configured).toBe(true);
    expect(settings.stripe.webhook_configured).toBe(true);
    expect(settings.google_oauth.configured).toBe(true);
    expect(settings.email.configured).toBe(true);
  });

  it('returns the publishable key, which is public by design', async () => {
    const settings = await settingsService.getProjectSettings();

    expect(settings.stripe.publishable_key).toBe('pk_live_public');
  });

  it('withholds every credential from the pre-login view too', async () => {
    const settings = await settingsService.getPublicProjectSettings();

    expect(JSON.stringify(settings)).not.toMatch(/supersecret/);
  });

  it('tells the login screen what it needs to offer Google sign-in', async () => {
    const settings = await settingsService.getPublicProjectSettings();

    expect(settings.google_oauth.enabled).toBe(true);
    expect(settings.google_oauth.client_id).toBe('client-id');
  });

  it('does not disclose the mail server to anyone who has not signed in', async () => {
    const settings = await settingsService.getPublicProjectSettings();

    expect(settings.email.smtp_host).toBeUndefined();
    expect(settings.stripe.publishable_key).toBe('');
  });

  it('withholds the Google client id while the integration is off', async () => {
    db.getMany.mockReturnValue([
      { key: 'google_oauth.enabled', value: 'false' },
      { key: 'google_oauth.client_id', value: JSON.stringify('client-id') }
    ]);

    const settings = await settingsService.getPublicProjectSettings();

    expect(settings.google_oauth.client_id).toBe('');
  });
});

describe('stripe credentials', () => {
  it('resolves the stored secret key for server-side use', async () => {
    db.getMany.mockReturnValue([
      { key: 'stripe.enabled', value: 'true' },
      { key: 'stripe.secret_key', value: JSON.stringify('sk_test_stored') },
      { key: 'stripe.publishable_key', value: JSON.stringify('pk_test_stored') },
      { key: 'stripe.webhook_secret', value: JSON.stringify('whsec_stored') }
    ]);

    expect(settingsService.getStripeCredentials()).toMatchObject({
      enabled: true,
      configured: true,
      secretKey: 'sk_test_stored',
      publishableKey: 'pk_test_stored',
      webhookSecret: 'whsec_stored'
    });
  });

  it('falls back to .env when nothing is stored', async () => {
    db.getMany.mockReturnValue([]);
    process.env.STRIPE_SECRET_KEY = 'sk_test_env';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_env';

    expect(settingsService.getStripeCredentials()).toMatchObject({
      configured: true,
      secretKey: 'sk_test_env'
    });
  });

  it('prefers a key saved in settings over the one in .env', async () => {
    // The other direction would make the settings screen a lie: an admin could
    // save a key, see it accepted, and have the old one keep taking payments.
    db.getMany.mockReturnValue([
      { key: 'stripe.secret_key', value: JSON.stringify('sk_test_stored') }
    ]);
    process.env.STRIPE_SECRET_KEY = 'sk_test_env';

    expect(settingsService.getStripeCredentials().secretKey).toBe('sk_test_stored');
  });

  it('infers test mode from the key rather than trusting a stale toggle', async () => {
    db.getMany.mockReturnValue([
      { key: 'stripe.secret_key', value: JSON.stringify('sk_live_real') }
    ]);

    expect(settingsService.getStripeCredentials().testMode).toBe(false);
  });

  it('treats a test key as test mode', async () => {
    db.getMany.mockReturnValue([
      { key: 'stripe.secret_key', value: JSON.stringify('sk_test_x') }
    ]);

    expect(settingsService.getStripeCredentials().testMode).toBe(true);
  });

  it('honours an explicit test-mode setting over the inference', async () => {
    db.getMany.mockReturnValue([
      { key: 'stripe.secret_key', value: JSON.stringify('sk_live_real') },
      { key: 'stripe.test_mode', value: 'true' }
    ]);

    expect(settingsService.getStripeCredentials().testMode).toBe(true);
  });

  it('reports unconfigured when only half the pair is present', async () => {
    db.getMany.mockReturnValue([
      { key: 'stripe.publishable_key', value: JSON.stringify('pk_test_x') }
    ]);
    delete process.env.STRIPE_SECRET_KEY;

    expect(settingsService.getStripeCredentials().configured).toBe(false);
  });
});

describe('getSecuritySetting', () => {
  it('reads the security namespace', async () => {
    db.getOne.mockReturnValue({ value: '10' });

    await expect(settingsService.getSecuritySetting('max_failed_login_attempts')).resolves.toBe(10);
    expect(db.getOne.mock.calls[0][1]).toEqual(['security.max_failed_login_attempts']);
  });

  it('falls back to the environment when unset', async () => {
    db.getOne.mockReturnValue(undefined);
    process.env.MAX_FAILED_LOGIN_ATTEMPTS = '3';

    await expect(settingsService.getSecuritySetting('max_failed_login_attempts')).resolves.toBe(3);
  });

  it('defaults the lockout to the documented value', async () => {
    db.getOne.mockReturnValue(undefined);
    delete process.env.ACCOUNT_LOCKOUT_DURATION;

    await expect(settingsService.getSecuritySetting('account_lockout_duration')).resolves.toBe(1800000);
  });

  it('defaults email verification to off', async () => {
    db.getOne.mockReturnValue(undefined);
    delete process.env.REQUIRE_EMAIL_VERIFICATION;

    await expect(settingsService.getSecuritySetting('require_email_verification')).resolves.toBe(false);
  });

  it('returns null for a setting with no fallback', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(settingsService.getSecuritySetting('unknown_knob')).resolves.toBeNull();
  });

  it('rejects a missing name', async () => {
    await expect(settingsService.getSecuritySetting('')).rejects.toThrow(/name/i);
  });
});

describe('deletes and counts', () => {
  it('deletes one setting by key', async () => {
    await expect(settingsService.deleteSetting('general.theme')).resolves.toBe(true);
    expect(db.queries[0].params).toEqual(['general.theme']);
  });

  it('reports false when nothing was deleted', async () => {
    db.executeQuery.mockReturnValue({ changes: 0, lastInsertRowid: 0 });

    await expect(settingsService.deleteSetting('general.theme')).resolves.toBe(false);
  });

  it('deletes a whole category by prefix', async () => {
    db.executeQuery.mockReturnValue({ changes: 4, lastInsertRowid: 0 });

    await expect(settingsService.deleteSettingsByCategory('format')).resolves.toBe(4);
    expect(db.executeQuery.mock.calls[0][1]).toEqual(['format.%']);
  });

  it('resets one category without touching the rest', async () => {
    await settingsService.resetSettings('format');

    expect(db.queries[0].sql).toMatch(/WHERE key LIKE \?/);
    expect(db.queries[0].params).toEqual(['format.%']);
  });

  it('resets everything when no category is named', async () => {
    await settingsService.resetSettings();

    expect(db.queries[0].sql).not.toMatch(/WHERE/);
  });

  it('derives the category list from key prefixes', async () => {
    db.getMany.mockReturnValue([
      { key: 'general.theme' }, { key: 'format.currency' }, { key: 'general.locale' }
    ]);

    await expect(settingsService.getCategories()).resolves.toEqual(['format', 'general']);
  });

  it('counts settings in one category', async () => {
    db.getOne.mockReturnValue({ count: 7 });

    await expect(settingsService.getSettingsCount('format')).resolves.toBe(7);
    expect(db.getOne.mock.calls[0][1]).toEqual(['format.%']);
  });

  it('counts zero on an empty table', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(settingsService.getSettingsCount()).resolves.toBe(0);
  });

  it('answers false for a blank key rather than querying', async () => {
    await expect(settingsService.settingExists('')).resolves.toBe(false);
    expect(db.exists).not.toHaveBeenCalled();
  });

  it('rejects a blank key or category on delete', async () => {
    await expect(settingsService.deleteSetting('')).rejects.toThrow(/key/i);
    await expect(settingsService.deleteSettingsByCategory('')).rejects.toThrow(/category/i);
  });
});
