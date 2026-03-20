// Global error handling middleware for SAMVAD API
// Ensures JSON response shapes and prevents uncaught errors from crashing the server.

function errorHandler(err, req, res, next) {
  console.error("Unhandled server error:", err)

  const statusCode = err.statusCode || err.status || 500
  const message = err.message || "Internal Server Error"

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === "production" ? undefined : err.stack,
  })
}

module.exports = errorHandler
