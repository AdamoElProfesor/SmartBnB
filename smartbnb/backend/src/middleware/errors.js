/**
 * JSON 404 for unknown API routes, so they do not fall through to the SPA
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function apiNotFound(req, res) {
  res.status(404).json({ ok: false, error: "Not found" });
}

/**
 * JSON error handler for the API. Client errors (4xx, e.g. validation or a
 * malformed JSON body) keep their message; anything else is a generic 500.
 * The stack is only included outside production.
 * @param {Error & { status?: number, statusCode?: number, expose?: boolean }} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
// eslint-disable-next-line no-unused-vars
function apiErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = Number(err.status || err.statusCode);
  const isClientError = status >= 400 && status < 500;
  const code = isClientError ? status : 500;

  if (!isClientError) console.error("[api] unhandled error:", err);

  const body = {
    ok: false,
    error: isClientError && err.expose !== false ? err.message : "Internal server error",
  };
  if (process.env.NODE_ENV !== "production" && !isClientError) body.stack = err.stack;
  res.status(code).json(body);
}

module.exports = { apiNotFound, apiErrorHandler };
