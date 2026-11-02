/** HTTP errors that carry no internals to the client. */

export class HttpError extends Error {
  constructor(status, message, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message, code = 'invalid') => new HttpError(400, message, code);
export const unauthorized = (message = 'Unauthorized') => new HttpError(401, message, 'unauthorized');
export const forbidden = (message = 'Forbidden') => new HttpError(403, message, 'forbidden');
export const notFound = (message = 'Not found') => new HttpError(404, message, 'not_found');
export const tooMany = (message = 'Too many requests') => new HttpError(429, message, 'rate_limited');

export function jsonError(error) {
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }
  // Never leak a stack, a SQL fragment or a secret to the client.
  return { status: 500, body: { error: 'Something went wrong', code: 'internal' } };
}