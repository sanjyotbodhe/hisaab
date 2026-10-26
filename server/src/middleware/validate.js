import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

/**
 * Validates and replaces req.body / req.query / req.params with the parsed
 * (trimmed, coerced, defaulted) values. Unknown keys are stripped.
 */
export function validate(schemas) {
  return (req, res, next) => {
    for (const key of ['params', 'query', 'body']) {
      if (!schemas[key]) continue;
      const result = schemas[key].safeParse(req[key] ?? {});
      if (!result.success) return next(result.error);
      // Express 5 makes req.query a getter, so store parsed values separately.
      req.valid = { ...(req.valid || {}), [key]: result.data };
    }
    next();
  };
}
