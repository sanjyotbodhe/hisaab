import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { unauthorized } from '../utils/errors.js';

const cookieOptions = () => ({
  httpOnly: true, // not readable from JavaScript, so XSS can't steal it
  secure: config.isProd, // HTTPS only in production
  sameSite: 'lax', // not sent on cross-site POSTs (CSRF protection)
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
});

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user._id.toString() }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    algorithm: 'HS256',
  });
  res.cookie(config.cookieName, token, cookieOptions());
}

export function clearSession(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(config.cookieName, opts);
}

/** Requires a valid session cookie; attaches req.user. */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[config.cookieName];
  if (!token) return next(unauthorized());
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    clearSession(res);
    return next(unauthorized('Your session has expired, please log in again'));
  }
  const user = await User.findById(payload.sub);
  if (!user) {
    clearSession(res);
    return next(unauthorized());
  }
  req.user = user;
  next();
}

/**
 * CSRF defence in depth on top of SameSite cookies: browsers will not let another
 * site send a custom header cross-origin without a CORS preflight we don't allow.
 */
export function requireCsrfHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'hisaab') {
    return next(unauthorized('Missing request header'));
  }
  next();
}
