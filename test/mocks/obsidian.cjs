/* eslint-disable */
// Minimal stand-in for the `obsidian` module so parser code can run under Node.
// Anything not explicitly defined resolves to an empty stub class, which is
// enough for modules that only reference Obsidian classes at load time.
const moment = require('moment');
const YAML = require('yaml');

class TFile {}

const explicit = {
  __esModule: true,
  moment,
  parseYaml: (str) => YAML.parse(str),
  stringifyYaml: (obj) => YAML.stringify(obj),
  TFile,
  Platform: { isMobile: false, isDesktop: true, isDesktopApp: true },
  debounce: (fn) => fn,
  getLinkpath: (s) => s,
  normalizePath: (s) => s,
};

module.exports = new Proxy(explicit, {
  get(target, key) {
    if (key in target) return target[key];
    if (typeof key === 'symbol') return undefined;
    return class ObsidianStub {};
  },
});
