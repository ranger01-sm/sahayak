function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${err.message}`);
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large' });
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
}

module.exports = { errorHandler };
