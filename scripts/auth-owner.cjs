#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function loadAuthStore() {
  const filename = path.join(root, 'src/lib/auth-store.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(require, loaded, loaded.exports);
  return loaded.exports;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    process.stdout.write('Usage : node scripts/auth-owner.cjs [--reset]\nInstalle le compte propriétaire local. --reset remplace son mot de passe et révoque ses sessions.\n');
    return;
  }
  if (args.some(arg => arg !== '--reset')) throw new Error('Seule l’option --reset est acceptée. Aucun identifiant ne doit être passé en argument.');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Exécutez cette commande dans un terminal interactif pour saisir le mot de passe sans l’afficher.');
  const auth = loadAuthStore();
  const current = await auth.getOwner();
  const reset = args.includes('--reset');
  if (current && !reset) throw new Error('Un compte existe déjà. Utilisez --reset pour changer le mot de passe et révoquer les sessions.');

  let hidden = false;
  const mutedOutput = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk, encoding); callback(); } });
  const prompt = readline.createInterface({ input: process.stdin, output: mutedOutput, terminal: true });
  async function question(label, secret = false) {
    if (!secret) return prompt.question(label);
    process.stdout.write(label);
    hidden = true;
    try { return await prompt.question(''); }
    finally { hidden = false; process.stdout.write('\n'); }
  }
  const interrupt = () => { prompt.close(); process.stdout.write('\nInstallation annulée.\n'); process.exit(130); };
  prompt.on('SIGINT', interrupt);
  try {
    const nameInput = await question(current ? `Nom [${current.name}] : ` : 'Nom : ');
    const emailInput = await question(current ? `Adresse e-mail [${current.email}] : ` : 'Adresse e-mail : ');
    const password = await question('Mot de passe (15 à 128 caractères, saisie masquée) : ', true);
    const confirmation = await question('Confirmer le mot de passe : ', true);
    if (password !== confirmation) throw new Error('Les mots de passe ne correspondent pas. Aucun changement enregistré.');
    await auth.setupOwner({ name: nameInput.trim() || current?.name || '', email: emailInput.trim() || current?.email || '', password }, { reset });
    process.stdout.write(reset && current ? 'Mot de passe mis à jour. Toutes les sessions ont été révoquées.\n' : 'Compte propriétaire créé. Vous pouvez maintenant vous connecter.\n');
  } finally { prompt.close(); }
}

main().catch(error => {
  // Only our validation/storage messages are printed; never the supplied secrets.
  const safeMessage = error && typeof error.message === 'string' ? error.message : 'Installation impossible.';
  process.stderr.write(`${safeMessage}\n`);
  process.exitCode = 1;
});
