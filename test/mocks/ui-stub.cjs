/* eslint-disable */
// Stand-in for browser-only UI packages that touch the DOM at import time.
// Never invoked by the parser code under test.
module.exports = new Proxy(function UiStub() {}, {
  get: (target, key) => (key === '__esModule' ? false : key === 'default' ? target : target),
});
