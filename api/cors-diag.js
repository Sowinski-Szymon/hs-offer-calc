// CommonJS
module.exports = (req, res) => {
  res.status(200).json({
    originHeader: req.headers.origin || null,
    allowedOriginsEnv: process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || null,
    vercelEnv: process.env.VERCEL_ENV || null
  });
};
