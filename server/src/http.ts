import type { ErrorRequestHandler, Request } from 'express';
import { ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string): HttpError => new HttpError(400, msg);
export const notFound = (msg = 'Not found'): HttpError => new HttpError(404, msg);
export const forbidden = (msg = 'You do not have access to this'): HttpError => new HttpError(403, msg);

export function parse<T>(schema: ZodType<T>, input: unknown): T {
  return schema.parse(input);
}

export function idParam(req: Request, name = 'id'): number {
  const raw = req.params[name];
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  return id;
}

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    res.status(400).json({ error: `${where}${first?.message ?? 'Invalid input'}`, issues: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  process.stderr.write(`Unhandled error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
};
