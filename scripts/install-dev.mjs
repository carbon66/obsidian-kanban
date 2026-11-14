// Copies the built plugin (main.js, manifest.json, styles.css) into a vault.
//
//   yarn dev-install                 -> ./test-vault (created and seeded if missing)
//   yarn dev-install "<vault path>"  -> any other vault
//
// The test vault is gitignored. Open it in Obsidian with "Open folder as vault"
// to try a build on sample boards before installing it in a real vault.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const vault = path.resolve(process.argv[2] || path.join(root, 'test-vault'));
const isTestVault = vault === path.join(root, 'test-vault');

for (const f of ['main.js', 'manifest.json', 'styles.css']) {
  if (!fs.existsSync(path.join(root, f))) {
    console.error(`Missing ${f}. Run "yarn build" first.`);
    process.exit(1);
  }
}

if (!fs.existsSync(path.join(vault, '.obsidian'))) {
  if (!isTestVault) {
    console.error(`${vault} is not an Obsidian vault (no .obsidian folder).`);
    process.exit(1);
  }

  // Seed a fresh test vault with the fixture boards and the plugin enabled.
  fs.mkdirSync(path.join(vault, '.obsidian'), { recursive: true });
  fs.writeFileSync(
    path.join(vault, '.obsidian', 'community-plugins.json'),
    JSON.stringify([manifest.id], null, 2)
  );
  const fixtures = path.join(root, 'test', 'fixtures');
  for (const f of fs.readdirSync(fixtures).filter((f) => f.endsWith('.md'))) {
    fs.copyFileSync(path.join(fixtures, f), path.join(vault, f));
  }
  console.log(`Created test vault at ${vault}`);
}

const dest = path.join(vault, '.obsidian', 'plugins', manifest.id);
fs.mkdirSync(dest, { recursive: true });
for (const f of ['main.js', 'manifest.json', 'styles.css']) {
  fs.copyFileSync(path.join(root, f), path.join(dest, f));
}

console.log(`Installed ${manifest.name} ${manifest.version} -> ${dest}`);
console.log('Reload Obsidian (or toggle the plugin off/on) to pick up the new build.');
