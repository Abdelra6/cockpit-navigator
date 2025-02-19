#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import copy from 'esbuild-plugin-copy';

import { cleanPlugin } from './pkg/lib/esbuild-cleanup-plugin.js';
import { cockpitCompressPlugin } from './pkg/lib/esbuild-compress-plugin.js';
import { cockpitPoEsbuildPlugin } from './pkg/lib/cockpit-po-plugin.js';
import { cockpitRsyncEsbuildPlugin } from './pkg/lib/cockpit-rsync-plugin.js';
import { esbuildStylesPlugins } from './pkg/lib/esbuild-common.js';
import { eslintPlugin } from './pkg/lib/esbuild-eslint-plugin.js';
import { stylelintPlugin } from './pkg/lib/esbuild-stylelint-plugin.js';

const useWasm = os.arch() !== 'x64';
const esbuild = (await import(useWasm ? 'esbuild-wasm' : 'esbuild')).default;

const production = process.env.NODE_ENV === 'production';
// linters dominate the build time, so disable them for production builds by default, but enable in watch mode
const lintDefault = process.env.LINT ? process.env.LINT === '0' : production;
// List of directories to use when using import statements
const nodePaths = ['pkg/lib'];
const outdir = 'dist';

// Obtain package name from package.json
const packageJson = JSON.parse(fs.readFileSync('package.json'));

const parser = (await import('argparse')).default.ArgumentParser();
/* eslint-disable max-len */
parser.add_argument('-r', '--rsync', { help: "rsync bundles to ssh target after build", metavar: "HOST" });
parser.add_argument('-w', '--watch', { action: 'store_true', help: "Enable watch mode", default: process.env.ESBUILD_WATCH === "true" });
parser.add_argument('-e', '--no-eslint', { action: 'store_true', help: "Disable eslint linting", default: lintDefault });
/* eslint-enable max-len */
const args = parser.parse_args();

if (args.rsync)
    process.env.RSYNC = args.rsync;

function notifyEndPlugin() {
    return {
        name: 'notify-end',
        setup(build) {
            let startTime;

            build.onStart(() => {
                startTime = new Date();
            });

            build.onEnd(() => {
                const endTime = new Date();
                const timeStamp = endTime.toTimeString().split(' ')[0];
                console.log(`${timeStamp}: Build finished in ${endTime - startTime} ms`);
            });
        }
    };
}

const cwd = process.cwd();

// similar to fs.watch(), but recursively watches all subdirectories
function watch_dirs(dir, on_change) {
    const callback = (ev, dir, fname) => {
        // only listen for "change" events, as renames are noisy
        // ignore hidden files
        const isHidden = /^\./.test(fname);
        if (ev !== "change" || isHidden) {
            return;
        }
        on_change(path.join(dir, fname));
    };

    fs.watch(dir, {}, (ev, path) => callback(ev, dir, path));

    // watch all subdirectories in dir
    const d = fs.opendirSync(dir);
    let dirent;

    while ((dirent = d.readSync()) !== null) {
        if (dirent.isDirectory())
            watch_dirs(path.join(dir, dirent.name), on_change);
    }
    d.closeSync();
}

const context = await esbuild.context({
    ...!production ? { sourcemap: "linked" } : {},
    bundle: true,
    entryPoints: ['./src/index.js'],
    // Allow external font files which live in ../../static/fonts
    external: ['*.woff', '*.woff2', '*.jpg', '*.svg', '../../assets*'],
    // Move all legal comments to a .LEGAL.txt file
    legalComments: 'external',
    loader: { ".js": "jsx" },
    minify: production,
    nodePaths,
    outdir,
    target: ['es2020'],
    plugins: [
        cleanPlugin(),
        ...args.no_stylelint ? [] : [stylelintPlugin({ filter: new RegExp(cwd + '/src/.*\\.(css?|scss?)$') })],
        ...args.no_eslint ? [] : [eslintPlugin({ filter: new RegExp(cwd + '/src/.*\\.(jsx?|js?)$') })],
        // Esbuild will only copy assets that are explicitly imported and used
        // in the code. This is a problem for index.html and manifest.json which are not imported
        copy({
            assets: [
                { from: ['./src/manifest.json'], to: ['./manifest.json'] },
                { from: ['./src/index.html'], to: ['./index.html'] },
            ]
        }),
        ...esbuildStylesPlugins,
        cockpitPoEsbuildPlugin(),
        ...production ? [cockpitCompressPlugin()] : [],
        cockpitRsyncEsbuildPlugin({ dest: packageJson.name }),
        notifyEndPlugin(),
    ]
});

try {
    await context.rebuild();
} catch (e) {
    if (!args.watch)
        process.exit(1);
    // ignore errors in watch mode
}

if (args.watch) {
    const on_change = async path => {
        console.log("change detected:", path);
        await context.cancel();

        try {
            await context.rebuild();
        } catch (e) {} // ignore in watch mode
    };

    watch_dirs('src', on_change);

    // wait forever until Control-C
    await new Promise(() => {});
}

context.dispose();
