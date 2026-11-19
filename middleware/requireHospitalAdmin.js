module.exports = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin' || !req.user.hospitalId) {
    return res.status(403).json({ success: false, message: 'Hospital administrator access required' });
  }
  return next();
};
