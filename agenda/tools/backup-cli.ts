import { lstat, mkdir, open, readFile, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteStore } from '../adapters/sqlite.ts';
import { exportBackup, restoreBackup } from './backup.ts';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const roots = ['.agenda-private', '.local-agenda'].map((name) => resolve(repository, name));

function privatePath(argument: string | undefined): string {
  if (!argument) throw new Error('A private path is required.');
  const path = resolve(argument);
  const comparison = process.platform === 'win32' ? path.toLowerCase() : path;
  if (
    !roots.some((root) =>
      comparison.startsWith(`${process.platform === 'win32' ? root.toLowerCase() : root}${sep}`),
    )
  ) {
    throw new Error(
      'CLI files must be inside .agenda-private/ or .local-agenda/, excluded from Git and the site build.',
    );
  }
  return path;
}

async function rejectSymlinks(path: string): Promise<void> {
  const root = roots.find((candidate) =>
    (process.platform === 'win32' ? path.toLowerCase() : path).startsWith(
      `${process.platform === 'win32' ? candidate.toLowerCase() : candidate}${sep}`,
    ),
  );
  if (!root) throw new Error('Private directory is required.');
  const components = path.slice(root.length + 1).split(sep);
  let current = root;
  for (const component of ['', ...components]) {
    if (component) current = resolve(current, component);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error('Private backup paths cannot traverse symbolic links.');
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
        return;
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const [operation, input, output, ...extra] = process.argv.slice(2);
  if (!['export', 'restore'].includes(operation ?? '') || extra.length > 0) {
    throw new Error(
      'Usage: node agenda/tools/backup-cli.ts export <private-db> <new-private-backup.json> | restore <private-backup.json> <new-private-db>',
    );
  }
  const source = privatePath(input);
  const target = privatePath(output);
  await rejectSymlinks(source);
  await rejectSymlinks(target);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  if (operation === 'export') {
    const store = new SqliteStore(source, { readOnly: true });
    try {
      const backup = await exportBackup(store);
      const file = await open(target, 'wx', 0o600);
      try {
        await file.writeFile(`${JSON.stringify(backup)}\n`, 'utf8');
      } finally {
        await file.close();
      }
    } finally {
      store.close();
    }
    console.log(
      'Private versioned backup exported. Keep it access restricted; no customer data was printed.',
    );
  } else {
    if ((await stat(source)).size > 50 * 1024 * 1024)
      throw new Error('Backup exceeds the 50 MiB offline restore limit.');
    const contents = await readFile(source, 'utf8');
    if (Buffer.byteLength(contents, 'utf8') > 50 * 1024 * 1024)
      throw new Error('Backup exceeds the 50 MiB offline restore limit.');
    const restored = await restoreBackup(JSON.parse(contents) as unknown, target);
    restored.store.close();
    console.log(
      'Backup restored and verified in a new private database. Activation remains a separate reviewed operation.',
    );
  }
}

main().catch(() => {
  console.error(
    'Backup operation rejected. Check command syntax, private paths, permissions and backup validity. No source database was replaced.',
  );
  process.exitCode = 1;
});
