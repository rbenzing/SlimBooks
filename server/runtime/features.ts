// Tri-state feature toggle resolution.
//
// A feature qualifies as toggleable only if it depends on a host capability
// that is not universally available, or exposes operational surface an operator
// may want closed. Everything else is core and always on.

import { ConfigError, readToggle, type RawEnv } from './env.js';
import type { FeatureName, FeatureSet, ToggleState } from './types.js';

export const FEATURE_ENV_KEYS: Readonly<Record<FeatureName, string>> = Object.freeze({
  pdf: 'FEATURE_PDF',
  email: 'FEATURE_EMAIL',
  stripe: 'FEATURE_STRIPE',
  oauth: 'FEATURE_OAUTH',
  scheduler: 'FEATURE_SCHEDULER',
  uploads: 'FEATURE_UPLOADS',
  dbAdmin: 'FEATURE_DB_ADMIN',
  signup: 'FEATURE_SIGNUP',
  debug: 'FEATURE_DEBUG'
});

/** Whether each feature's dependency actually resolved on this host. */
export type FeatureProbes = Readonly<Record<FeatureName, boolean>>;

/**
 * Decide one feature from its toggle state and whether its dependency resolved.
 *
 * `on` throwing is the whole point: it converts a silent production
 * degradation into a startup failure an operator cannot miss.
 */
export const resolveFeature = (
  state: ToggleState,
  available: boolean,
  name: FeatureName
): boolean => {
  if (state === 'off') return false;

  if (state === 'on' && !available) {
    throw new ConfigError(
      `${FEATURE_ENV_KEYS[name]} is set to "on" but its dependency is unavailable on this host. ` +
        `Set it to "auto" to run without ${name}, or provision the dependency.`
    );
  }

  return state === 'on' ? true : available;
};

/** Decide every feature. Throws on the first required-but-missing dependency. */
export const resolveFeatures = (env: RawEnv, probes: FeatureProbes): FeatureSet => {
  const entries = (Object.keys(FEATURE_ENV_KEYS) as FeatureName[]).map(name => {
    const state = readToggle(env, FEATURE_ENV_KEYS[name]);
    return [name, resolveFeature(state, probes[name], name)] as const;
  });

  return Object.freeze(Object.fromEntries(entries)) as FeatureSet;
};
