(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrainySessionActions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  async function closeThen(rpc, liveSessionId, onClosed, next) {
    if (liveSessionId) {
      await rpc('session.close', { session_id: liveSessionId });
      onClosed();
    }
    return next();
  }

  return { closeThen };
});
