const shouldWaitForDatabase = (req) => {
  if (!req?.path) {
    return true;
  }

  const isPublicPage = req.path === '/' || req.path === '/admin' || req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path === '/favicon.ico';

  if (req.path === '/api/health' || isPublicPage) {
    return false;
  }

  if (req.path === '/api/admin/login' || req.path === '/api/admin/logout') {
    return false;
  }

  if (req.path.startsWith('/api/activate/public-key')) {
    return false;
  }

  if (req.path.startsWith('/api/admin') && !req.session?.admin) {
    return false;
  }

  return true;
};

module.exports = {
  shouldWaitForDatabase
};
