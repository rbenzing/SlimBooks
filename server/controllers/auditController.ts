// Audit trail read endpoint.

import { type Request, type Response } from 'express';
import { auditService, type AuditAction } from '../services/AuditService.js';
import { asyncHandler } from '../middleware/index.js';

/**
 * List audit records, newest first.
 *
 * `details` is stored as JSON text; it is parsed here so callers get structure
 * rather than a string to parse again. A record whose payload somehow is not
 * valid JSON is returned with `details: null` rather than failing the page —
 * one malformed row should not make the whole trail unreadable, which is
 * exactly when someone is trying to read it.
 */
export const listAuditLog = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { action, actorUserId, limit, offset } = req.query;

  const parsedActorId = typeof actorUserId === 'string' ? parseInt(actorUserId, 10) : NaN;
  const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : NaN;
  const parsedOffset = typeof offset === 'string' ? parseInt(offset, 10) : NaN;

  const records = await auditService.list({
    ...(typeof action === 'string' ? { action: action as AuditAction } : {}),
    ...(Number.isNaN(parsedActorId) ? {} : { actorUserId: parsedActorId }),
    ...(Number.isNaN(parsedLimit) ? {} : { limit: parsedLimit }),
    ...(Number.isNaN(parsedOffset) ? {} : { offset: parsedOffset })
  });

  res.json({
    success: true,
    data: records.map(record => ({
      ...record,
      details: parseDetails(record.details)
    }))
  });
});

const parseDetails = (details: string | null): unknown => {
  if (!details) return null;

  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
};
