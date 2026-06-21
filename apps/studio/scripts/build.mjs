/**
 * Production build wrapper.
 *
 * Runs Vite's programmatic build, then force-exits. `vite build` (and the esbuild
 * service it spawns) can leave a handle open that keeps Node alive after "✓ built",
 * which hangs CI/Vercel forever (the build command never returns). Vite's build()
 * promise only resolves once all output is written to dist, so exiting here is safe.
 */
import { build } from 'vite';

try {
  await build();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
