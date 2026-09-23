// Monorepo-aware Metro config.
//
// @assistigo/core is consumed as raw TypeScript source (its package.json "main" points at
// src/index.ts), so Metro has to watch the workspace root and be told not to resolve a second
// copy of React out of packages/*/node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so edits in packages/core trigger a reload.
config.watchFolders = [workspaceRoot];

// Resolve modules from the app first, then the hoisted workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// npm workspaces hoists, but a package that pulls its own React would produce two React
// instances and break hooks. Pin the singletons to one copy each.
//
// This deliberately does NOT use `disableHierarchicalLookup`. That flag stops Metro walking
// parent `node_modules` at all, which also breaks legitimately nested transitive deps that npm
// chose not to hoist (expo-router -> color -> color-string -> simple-swizzle -> is-arrayish).
// Pinning the few packages that must be singletons gets the same protection without blinding
// the resolver to the rest of the tree.
const singletons = ['react', 'react-dom', 'react-native'];

config.resolver.extraNodeModules = singletons.reduce(
  (acc, name) => ({
    ...acc,
    [name]: path.resolve(projectRoot, 'node_modules', name),
  }),
  {},
);

// Keep walking parent `node_modules` from whichever file is being resolved. npm does not hoist
// everything — expo-router's `is-arrayish` stays nested under simple-swizzle — and without this
// Metro only ever looks in `nodeModulesPaths` above and those packages fail to resolve.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
