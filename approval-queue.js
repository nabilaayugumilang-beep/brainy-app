(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BrainyApprovalQueue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create() {
    let generation = 0;
    let nextId = 0;
    let entries = [];

    function enqueue(payload) {
      const entry = {
        token: `${generation}:${++nextId}`,
        payload
      };
      entries.push(entry);
      return entry.token;
    }

    function current() {
      return entries[0] || null;
    }

    function isCurrent(token) {
      return Boolean(entries[0] && entries[0].token === token);
    }

    function consume(token) {
      if (!isCurrent(token)) return false;
      entries.shift();
      return true;
    }

    function clear() {
      generation += 1;
      entries = [];
    }

    function size() {
      return entries.length;
    }

    return Object.freeze({ enqueue, current, isCurrent, consume, clear, size });
  }

  function createSafetyGate(storage, key) {
    const store = storage || null;
    const storageKey = key || 'brainy_must_interrupt';
    let required = false;
    try { required = store && store.getItem(storageKey) === '1'; } catch {}

    function requireInterrupt() {
      required = true;
      try { if (store) store.setItem(storageKey, '1'); } catch {}
    }

    function clear() {
      required = false;
      try { if (store) store.removeItem(storageKey); } catch {}
    }

    function isRequired() { return required; }

    return Object.freeze({ require: requireInterrupt, clear, isRequired });
  }

  return Object.freeze({ create, createSafetyGate });
});
