# Frontend Build Guide

## Automatic Console Removal

The frontend is configured to **automatically remove all console statements** during production builds.

### Configuration

The `vite.config.ts` file includes terser configuration that strips out:
- ✅ `console.log()`
- ✅ `console.error()`
- ✅ `console.warn()`
- ✅ `console.info()`
- ✅ `console.debug()`
- ✅ All other console methods
- ✅ `debugger` statements

### How to Build

#### Production Build (console statements removed):
```bash
npm run build
```

This creates an optimized production build in the `build/` directory with:
- All console statements removed
- Code minified and optimized
- Ready for deployment

#### Development Mode (console statements preserved):
```bash
npm run dev
# or
npm start
```

Console statements are **preserved** in development mode for debugging.

### Verification

To verify console removal works:

1. **Build the production version:**
   ```bash
   npm run build
   ```

2. **Preview the production build:**
   ```bash
   npm run preview
   ```

3. **Open browser DevTools** and check the Console tab - no console output should appear from your code.

### Configuration Details

The removal is handled by terser in `vite.config.ts`:

```typescript
build: {
  outDir: 'build',
  minify: 'terser',
  terserOptions: {
    compress: {
      drop_console: true,    // Removes all console statements
      drop_debugger: true,   // Removes debugger statements
    },
  },
}
```

### Advanced Options

If you need to **keep specific console methods** (e.g., keep `console.error` but remove others):

```typescript
terserOptions: {
  compress: {
    pure_funcs: ['console.log', 'console.info', 'console.debug'],  // Only remove these
  },
}
```

Or to **keep console only for errors and warnings**:

```typescript
terserOptions: {
  compress: {
    pure_funcs: ['console.log', 'console.info', 'console.debug'],
    // console.error and console.warn will be preserved
  },
}
```

## Build Output

The production build outputs to the `build/` directory:
- Minified JavaScript bundles
- Optimized CSS
- Asset files with hashed names for caching
- Source maps (optional, can be disabled for security)

## Notes

- Console removal only happens in **production builds** (`npm run build`)
- Development mode (`npm run dev`) keeps all console statements for debugging
- This improves performance and reduces bundle size
- Sensitive information won't accidentally leak through console statements

