import fs from 'node:fs';
import path from 'node:path';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import copy from 'rollup-plugin-copy';

export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/game.js',
    format: 'cjs',
    sourcemap: false,
  },
  plugins: [
    { name: 'collision-data', transform(code, id) { if (id.endsWith('collision-overrides.json')) return { code: `export default ${code}`, map: null }; } },
    {
      name: 'prune-unused-release-images',
      buildStart() {
        const imageDir = path.resolve('dist/assets/images');
        const releaseRoot = path.resolve('dist') + path.sep;
        if (!imageDir.startsWith(releaseRoot)) throw new Error('Invalid release path');
        const keep = new Set(['house-night-merged.png', 'title-night.jpg', 'characters-runtime.png', 'girl-front.png', 'girl-side.png', 'girl-back.png', 'girl-eat-front.png', 'girl-eat-side.png', 'girl-eat-back.png', 'girl-stun-front.png', 'girl-stun-side.png', 'girl-stun-back.png', 'wish-props.png', 'parents-runtime.png']);
        if (fs.existsSync(imageDir)) for (const entry of fs.readdirSync(imageDir, { withFileTypes: true })) {
          if (entry.isFile() && !keep.has(entry.name)) fs.unlinkSync(path.join(imageDir, entry.name));
        }
        const sourceMap = path.resolve('dist/game.js.map');
        if (fs.existsSync(sourceMap)) fs.unlinkSync(sourceMap);
      }
    },
    resolve({
      extensions: ['.ts', '.js']
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json'
    }),
    copy({
      targets: [
        { src: 'game.json', dest: 'dist' },
        { src: ['assets/images/house-night-merged.png', 'assets/images/title-night.jpg', 'assets/images/characters-runtime.png', 'assets/images/girl-front.png', 'assets/images/girl-side.png', 'assets/images/girl-back.png', 'assets/images/girl-eat-front.png', 'assets/images/girl-eat-side.png', 'assets/images/girl-eat-back.png', 'assets/images/girl-stun-front.png', 'assets/images/girl-stun-side.png', 'assets/images/girl-stun-back.png', 'assets/images/wish-props.png', 'assets/images/parents-runtime.png'], dest: 'dist/assets/images' },
        { src: 'assets/audio/*.wav', dest: 'dist/assets/audio' }
      ],
      copyOnce: false,
      flatten: true,
      verbose: true,
      hook: 'writeBundle'
    })
  ]
};
