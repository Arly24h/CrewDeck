import { expect, test } from 'claude-code/testing'

import { EXTENSIONS, fileTypeOf, luminance, NAMES } from '../hooks/files/filetypes'

const label = (name: string) => fileTypeOf(name)[0]

test('filetypes: hundreds of extensions and named files, every badge three characters at most', () => {
  expect(Object.keys(EXTENSIONS).length).toBeGreaterThanOrEqual(400)
  expect(Object.keys(NAMES).length).toBeGreaterThanOrEqual(250)
  for (const [key, [badge]] of [...Object.entries(EXTENSIONS), ...Object.entries(NAMES)]) {
    expect([...badge].length, key).toBeGreaterThanOrEqual(1)
    expect([...badge].length, key).toBeLessThanOrEqual(3)
  }
})

test('filetypes: every badge color reads on a dark pane', () => {
  for (const [key, [, color]] of [...Object.entries(EXTENSIONS), ...Object.entries(NAMES)]) {
    expect(color, key).toMatch(/^#[0-9a-f]{6}$/i)
    expect(luminance(color), key).toBeGreaterThanOrEqual(0.3)
  }
})

test('filetypes: the files developers work with every day all have their own badge', () => {
  const everyday: Record<string, string> = {
    'app.ts': 'TS', 'App.tsx': 'TS', 'main.js': 'JS', 'index.mjs': 'JS', 'Card.vue': 'VUE', 'Page.svelte': 'SV', 'index.astro': 'AST',
    'site.css': 'CSS', 'theme.scss': 'SCS', 'index.html': 'HTM', 'data.json': '{}', 'events.jsonl': 'JSL',
    'main.py': 'PY', 'notebook.ipynb': 'NB', 'app.rb': 'RB', 'main.go': 'GO', 'lib.rs': 'RS', 'Main.java': 'JV', 'App.kt': 'KT',
    'Main.scala': 'SC', 'View.swift': 'SW', 'main.c': 'C', 'util.h': 'H', 'engine.cpp': 'C++', 'Program.cs': 'C#', 'Model.fs': 'F#',
    'index.php': 'PHP', 'script.pl': 'PL', 'init.lua': 'LUA', 'analysis.R': 'R', 'model.jl': 'JL', 'main.dart': 'DRT',
    'server.ex': 'EX', 'app.erl': 'ERL', 'Main.hs': 'HS', 'core.clj': 'CLJ', 'main.ml': 'ML', 'main.zig': 'ZIG', 'main.nim': 'NIM',
    'Token.sol': 'SOL', 'kernel.cu': 'CU', 'shader.wgsl': 'GLS', 'boot.asm': 'ASM', 'player.gd': 'GD',
    'deploy.sh': 'SH', 'config.fish': 'FSH', 'build.ps1': 'PS', 'run.bat': 'BAT',
    'ci.yml': 'YML', 'config.yaml': 'YML', 'settings.toml': 'TML', 'pom.xml': 'MVN', 'app.ini': 'INI', 'nginx.conf': 'WAR',
    'users.csv': 'CSV', 'events.parquet': 'PQT', 'app.db': 'DB', 'schema.sql': 'SQL', 'schema.prisma': 'PRI', 'schema.graphql': 'GQL',
    'api.proto': 'PB', 'main.tf': 'TF', 'flake.nix': 'NIX', 'requests.http': 'HTP', 'fix.patch': 'DIF',
    'notes.md': 'MD', 'paper.tex': 'TEX', 'doc.typ': 'TYP', 'spec.pdf': 'PDF', 'brief.docx': 'DOC', 'budget.xlsx': 'XLS', 'deck.pptx': 'PPT',
    'logo.png': 'IMG', 'photo.jpg': 'IMG', 'icon.svg': 'SVG', 'mock.psd': 'PSD', 'brand.ai': 'AI', 'ui.fig': 'FIG', 'scene.blend': 'BLD', 'model.glb': '3D',
    'intro.mp3': 'AUD', 'demo.mp4': 'VID', 'Inter.woff2': 'FNT',
    'release.zip': 'ZIP', 'app.jar': 'JAR', 'pkg.whl': 'WHL', 'app.apk': 'APK', 'setup.exe': 'EXE', 'libfoo.so': 'LIB', 'cert.pem': 'KEY', 'id.pub': 'SSH',
    'Dockerfile': 'DKR', 'Makefile': 'MK', 'CMakeLists.txt': 'CMK', 'build.gradle': 'GRD', 'Jenkinsfile': 'JNK', 'Procfile': 'PRC',
    'package.json': 'NPM', 'package-lock.json': 'NPM', 'yarn.lock': 'YRN', 'pnpm-lock.yaml': 'PNP', 'bun.lockb': 'BUN', 'tsconfig.json': 'TS',
    'Cargo.toml': 'RS', 'go.mod': 'GO', 'pyproject.toml': 'PY', 'requirements.txt': 'PY', 'Gemfile': 'RB', 'composer.json': 'PHP',
    'vite.config.ts': 'VIT', 'tailwind.config.js': 'TW', 'next.config.mjs': 'NXT', 'eslint.config.js': 'ESL', '.prettierrc': 'PRT', 'jest.config.ts': 'JES',
    'playwright.config.ts': 'PW', 'turbo.json': 'TRB', 'vercel.json': 'VCL', 'wrangler.toml': 'CF', '.gitlab-ci.yml': 'CI',
    '.gitignore': 'GIT', '.editorconfig': 'EDC', '.nvmrc': 'NVM', 'LICENSE': 'LIC', 'README.md': 'MD', 'CHANGELOG.md': 'CHG', 'CODEOWNERS': 'OWN',
    'CLAUDE.md': 'CLD', 'AGENTS.md': 'CLD', '.zshrc': 'ZSH',
  }
  for (const [name, badge] of Object.entries(everyday)) expect(label(name), name).toBe(badge)
})

test('filetypes: a whole name beats a compound suffix, which beats the extension', () => {
  // package.json is npm's, not just JSON; Cargo.toml is Rust's, not just TOML.
  expect(label('package.json')).toBe('NPM')
  expect(label('Cargo.toml')).toBe('RS')
  expect(label('index.d.ts')).toBe('DTS')
  expect(label('Button.test.tsx')).toBe('TST')
  expect(label('api_test.go')).toBe('TST')
  expect(label('user_spec.rb')).toBe('TST')
  expect(label('Card.stories.tsx')).toBe('SB')
  expect(label('vendor.min.js')).toBe('MIN')
  expect(label('styles.module.css')).toBe('CSS')
  expect(label('backup.tar.gz')).toBe('ZIP')
  expect(label('welcome.blade.php')).toBe('BLD')
  // Families of names.
  expect(label('Dockerfile.dev')).toBe('DKR')
  expect(label('api.dockerfile')).toBe('DKR')
  expect(label('docker-compose.prod.yml')).toBe('DKR')
  expect(label('.env.staging')).toBe('ENV')
  // Case never matters.
  expect(label('MAIN.PY')).toBe('PY')
  expect(label('readme')).toBe('MD')
})

test('filetypes: anything unknown still gets a sensible grey badge', () => {
  expect(fileTypeOf('data.qwerty')).toEqual(['QWE', '#9ca3af'])
  expect(fileTypeOf('.mytoolrc')).toEqual(['CFG', '#9ca3af'])
  expect(fileTypeOf('NOTES')).toEqual(['•', '#9ca3af'])
})
