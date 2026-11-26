/**
 * Build the runtime plugin bundle CloudTAK 14.2+ accepts:
 * dist/bundle/<name>-<version>.tar.gz holding manifest.json and index.js.
 *
 *   node bundle/build.mjs
 *
 * Vite and the Vue compiler come from a CloudTAK checkout with `app` dependencies
 * installed (CLOUDTAK_DIR, default ~/CloudTAK).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const app = path.join(process.env.CLOUDTAK_DIR || path.join(homedir(), 'CloudTAK'), 'app');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const slug = pkg.name.replace(/^cloudtak-plugin-/, '');
const entry = ['plugin/index.ts', 'index.ts'].map((p) => path.join(root, p)).find((p) => existsSync(p));
if (!entry) throw new Error('No plugin entry point found');

const require = createRequire(path.join(app, 'package.json'));
const load = (id) => import(pathToFileURL(require.resolve(id)).href);
const { build } = await load('vite');
const { default: vue } = await load('@vitejs/plugin-vue');

// Modules CloudTAK hands to plugins at runtime (app/src/plugin-loader.ts)
const HOST = ['vue', 'vue-router', '@tak-ps/vue-tabler'];

const work = path.join(root, 'dist', 'bundle');
const out = path.join(work, 'build');
rmSync(work, { recursive: true, force: true });

await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [
        {
            // The plugin has no node_modules of its own: resolve packages from the app
            name: 'resolve-from-cloudtak',
            enforce: 'pre',
            async resolveId(source, importer) {
                if (!importer || /^[./\0]/.test(source) || source.includes(':')) return null;
                if (HOST.includes(source) || importer.startsWith(app)) return null;
                return this.resolve(source, path.join(app, 'src', 'main.ts'), { skipSelf: true });
            }
        },
        {
            // Anything else from the app's source would be a second copy of CloudTAK
            name: 'refuse-cloudtak-source',
            enforce: 'post',
            moduleParsed({ id }) {
                if (id.startsWith(path.join(app, 'src') + path.sep)) {
                    this.error(`Bundle pulls in CloudTAK source: ${id}`);
                }
            }
        },
        vue()
    ],
    build: {
        outDir: out,
        target: 'esnext',
        lib: { entry, formats: ['iife'], name: '__plugin', fileName: () => 'index.js' },
        rolldownOptions: {
            external: HOST,
            output: {
                exports: 'default',
                globals: Object.fromEntries(HOST.map((id) => [id, `globalThis.__CLOUDTAK__[${JSON.stringify(id)}]`]))
            }
        }
    }
});

const css = readdirSync(out)
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(path.join(out, file), 'utf8'))
    .join('\n');

const style = css && `{
const style = document.createElement('style');
style.dataset.plugin = ${JSON.stringify(slug)};
style.textContent = ${JSON.stringify(css)};
document.head.appendChild(style);
}
`;

const index = `${style}${readFileSync(path.join(out, 'index.js'), 'utf8')}\nexport default __plugin;\n`;

const repository = pkg.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '');
const manifest = {
    name: pkg.cloudtak?.name || slug,
    version: pkg.version,
    description: pkg.description,
    author: pkg.author?.name || pkg.author,
    license: pkg.license,
    homepage: pkg.homepage || repository,
    sha256: createHash('sha256').update(index).digest('hex'),
    api_version: 1
};

writeFileSync(path.join(work, 'index.js'), index);
writeFileSync(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 4));
rmSync(out, { recursive: true });

const archive = path.join(work, `${slug}-${pkg.version}.tar.gz`);
execFileSync('tar', ['--no-xattrs', '-czf', archive, '-C', work, 'manifest.json', 'index.js'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' }
});
// Leave only the archive: CloudTAK's lint walks symlinked plugin directories
rmSync(path.join(work, 'index.js'));
rmSync(path.join(work, 'manifest.json'));

console.log(`ok - ${manifest.name} ${manifest.version}: ${archive} (${Math.round(index.length / 1024)} KiB)`);
