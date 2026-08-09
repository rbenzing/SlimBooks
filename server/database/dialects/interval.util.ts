/**
 * Guard for the one dialect input that reaches SQL unparameterised.
 *
 * MySQL cannot take an INTERVAL quantity as a placeholder — `INTERVAL ? DAY` is
 * a syntax error — so `nowMinus`/`todayMinus` interpolate their count. At least
 * one caller takes that count from a request parameter
 * (`getClientsWithRecentActivity(days)`), so it is validated here rather than
 * trusted, and both dialects share the check so neither can be the lax one.
 */
export const assertWholeCount = (count: number): void => {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Date interval count must be a non-negative whole number, got ${count}.`);
  }
};
