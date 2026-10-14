// What each file is, as a badge: up to three characters and a color. Colors follow the languages'
// own (GitHub's linguist colors where a language has one), lifted where they are too dark to read
// on a dark pane. Looked up by whole name first, then by compound suffix, then by extension.

export type FileType = readonly [label: string, color: string]

const ext: Record<string, FileType> = {}
const add = (label: string, color: string, ...exts: string[]): void => {
  for (const e of exts) ext[e] = [label, color]
}

// ---- Web
add('HTM', '#e34c26', 'html', 'htm', 'xhtml', 'shtml')
add('CSS', '#663399', 'css', 'pcss', 'postcss')
add('SCS', '#c6538c', 'scss', 'sass')
add('LES', '#1d365d', 'less')
add('STY', '#ff6347', 'styl', 'stylus')
add('JS', '#f1e05a', 'js', 'mjs', 'cjs', 'jsx', 'es6')
add('TS', '#3178c6', 'ts', 'mts', 'cts', 'tsx')
add('VUE', '#41b883', 'vue')
add('SV', '#ff3e00', 'svelte')
add('AST', '#ff5a03', 'astro')
add('MDX', '#fcb32c', 'mdx')
add('{}', '#cbcb41', 'json', 'jsonc', 'json5', 'webmanifest', 'har')
add('JSL', '#cbcb41', 'jsonl', 'ndjson')
add('WSM', '#654ff0', 'wasm', 'wat')
add('HBS', '#f7931e', 'hbs', 'handlebars', 'mustache')
add('EJS', '#a91e50', 'ejs')
add('PUG', '#a86454', 'pug', 'jade')
add('LIQ', '#67b8de', 'liquid')
add('TWG', '#c1d026', 'twig')
add('NJK', '#3d8137', 'njk', 'nunjucks')
add('ERB', '#701516', 'erb')
add('RZR', '#512be4', 'cshtml', 'razor')

// ---- Languages
add('PY', '#3572a5', 'py', 'pyi', 'pyw', 'pyx', 'pxd')
add('NB', '#da5b0b', 'ipynb')
add('RB', '#cc342d', 'rb', 'rake', 'gemspec', 'ru')
add('GO', '#00add8', 'go')
add('RS', '#dea584', 'rs')
add('JV', '#b07219', 'java')
add('CLS', '#b07219', 'class')
add('KT', '#a97bff', 'kt', 'kts')
add('SC', '#c22d40', 'scala', 'sc', 'sbt')
add('GRV', '#4298b8', 'groovy', 'gvy')
add('SW', '#f05138', 'swift')
add('OC', '#438eff', 'm', 'mm')
add('C', '#a8b9cc', 'c')
add('H', '#a8b9cc', 'h')
add('C++', '#f34b7d', 'cpp', 'cc', 'cxx', 'c++', 'hpp', 'hh', 'hxx', 'h++', 'ipp', 'inl', 'ino')
add('C#', '#178600', 'cs', 'csx')
add('F#', '#b845fc', 'fs', 'fsx', 'fsi')
add('VB', '#945db7', 'vb', 'vbs', 'bas')
add('PHP', '#4f5d95', 'php', 'phtml')
add('PL', '#0298c3', 'pl', 'pm', 'pod', 't')
add('LUA', '#000080', 'lua', 'luau')
add('R', '#198ce7', 'r', 'rmd')
add('JL', '#a270ba', 'jl')
add('DRT', '#00b4ab', 'dart')
add('EX', '#6e4a7e', 'ex', 'exs', 'heex', 'leex')
add('ERL', '#b83998', 'erl', 'hrl')
add('GLM', '#ffaff3', 'gleam')
add('HS', '#5e5086', 'hs', 'lhs')
add('ELM', '#60b5cc', 'elm')
add('PS', '#012456', 'ps1', 'psm1', 'psd1')
add('CLJ', '#db5855', 'clj', 'cljs', 'cljc', 'edn')
add('LSP', '#3fb68b', 'lisp', 'lsp', 'cl', 'el', 'scm', 'ss', 'rkt')
add('ML', '#3be133', 'ml', 'mli', 'mll', 'mly')
add('RE', '#ff5847', 're', 'rei', 'res', 'resi')
add('PUR', '#1d222d', 'purs')
add('NIM', '#ffc200', 'nim', 'nims', 'nimble')
add('ZIG', '#ec915c', 'zig', 'zon')
add('V', '#4f87c4', 'v', 'vsh')
add('D', '#ba595e', 'd')
add('CR', '#000100', 'cr')
add('ODN', '#60aff1', 'odin')
add('MOJ', '#ff4c1f', 'mojo')
add('SOL', '#aa6746', 'sol')
add('MV', '#4a137a', 'move')
add('CAI', '#ff4a48', 'cairo')
add('HX', '#df7900', 'hx', 'hxml')
add('GD', '#355570', 'gd', 'gdshader', 'tscn', 'tres')
add('CU', '#3a4e3a', 'cu', 'cuh')
add('GLS', '#5686a5', 'glsl', 'vert', 'frag', 'geom', 'comp', 'hlsl', 'wgsl', 'metal', 'shader')
add('ASM', '#6e4c13', 'asm', 's', 'nasm')
add('FTN', '#4d41b1', 'f', 'f90', 'f95', 'f03', 'for')
add('COB', '#aaaaaa', 'cob', 'cbl', 'cpy')
add('PAS', '#e3f171', 'pas', 'pp', 'dpr')
add('ADA', '#02f88c', 'adb', 'ads')
add('TCL', '#e4cc98', 'tcl')
add('COF', '#244776', 'coffee', 'litcoffee')
add('VAL', '#a56de2', 'vala', 'vapi')
add('PRO', '#74283c', 'pro', 'prolog')
add('APL', '#5a8164', 'apl')
add('MAT', '#e16737', 'mat', 'mlx')
add('VHD', '#adb2cb', 'vhd', 'vhdl', 'sv', 'svh')
add('AWK', '#c30e9b', 'awk')
add('SED', '#64b970', 'sed')
add('VIM', '#199f4b', 'vim', 'vimrc')

// ---- Shells and scripts
add('SH', '#89e051', 'sh', 'bash', 'zsh', 'ksh', 'command')
add('FSH', '#4aae47', 'fish')
add('NU', '#4e9906', 'nu')
add('BAT', '#c1f12e', 'bat', 'cmd')
add('AHK', '#6594b9', 'ahk')
add('APS', '#101f1f', 'applescript', 'scpt')

// ---- Data, config and schema
add('YML', '#cb171e', 'yml', 'yaml')
add('TML', '#9c4221', 'toml')
add('XML', '#0060ac', 'xml', 'xsd', 'xsl', 'xslt', 'dtd', 'rss', 'atom', 'resx', 'xaml', 'csproj', 'fsproj', 'vbproj', 'sln', 'props', 'targets', 'plist', 'storyboard', 'xib')
add('INI', '#d1dbe0', 'ini', 'cfg', 'conf', 'cnf', 'properties', 'prefs', 'reg')
add('ENV', '#ecd53f', 'env')
add('LCK', '#9ca3af', 'lock', 'lockb')
add('CSV', '#237346', 'csv', 'tsv', 'psv')
add('PQT', '#50abf1', 'parquet', 'avro', 'orc', 'arrow', 'feather')
add('DB', '#e38c00', 'db', 'sqlite', 'sqlite3', 'db3', 'mdb', 'accdb', 'realm', 'duckdb')
add('SQL', '#e38c00', 'sql', 'psql', 'pgsql', 'mysql', 'ddl', 'dml')
add('PRI', '#5a67d8', 'prisma')
add('GQL', '#e10098', 'graphql', 'gql', 'graphqls')
add('PB', '#4a90d9', 'proto', 'pb', 'textproto')
add('TF', '#7b42bc', 'tf', 'tfvars', 'tfstate', 'hcl', 'nomad')
add('NIX', '#7e7eff', 'nix')
add('CUE', '#5886e1', 'cue')
add('DHL', '#dfafff', 'dhall')
add('JNT', '#0064bd', 'jsonnet', 'libsonnet')
add('KDL', '#ffb3b3', 'kdl')
add('RON', '#a62c00', 'ron')
add('HTP', '#005c9c', 'http', 'rest')
add('REG', '#ff6600', 'regex', 'regexp')
add('DIF', '#88dddd', 'diff', 'patch', 'rej')
add('SRT', '#9c0000', 'srt', 'vtt', 'ass')
add('ICS', '#d45d5d', 'ics', 'ical', 'vcf')

// ---- Writing and office
add('MD', '#519aba', 'md', 'markdown', 'mdown', 'mkd', 'mkdn')
add('QMD', '#75aadb', 'qmd')
add('RST', '#141414', 'rst')
add('ADC', '#73a0c5', 'adoc', 'asciidoc')
add('ORG', '#77aa99', 'org')
add('TEX', '#3d6117', 'tex', 'ltx', 'sty', 'bib', 'bst')
add('TYP', '#239dad', 'typ')
add('TXT', '#9ca3af', 'txt', 'text')
add('LOG', '#9ca3af', 'log', 'out')
add('PDF', '#f40f02', 'pdf')
add('DOC', '#2b579a', 'doc', 'docx', 'docm', 'dot', 'dotx', 'odt', 'rtf', 'pages', 'wpd')
add('XLS', '#217346', 'xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ods', 'numbers')
add('PPT', '#d24726', 'ppt', 'pptx', 'pptm', 'pot', 'potx', 'odp')
add('EPB', '#85b84b', 'epub', 'mobi', 'azw', 'azw3', 'fb2', 'djvu')

// ---- Images, design and 3D
add('IMG', '#a074c4', 'png', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'ico', 'icns', 'cur', 'jxl', 'raw', 'cr2', 'nef', 'dng', 'tga', 'dds', 'exr', 'hdr', 'qoi')
add('SVG', '#ffb13b', 'svg', 'svgz')
add('PSD', '#31a8ff', 'psd', 'psb')
add('AI', '#ff9a00', 'ai', 'eps')
add('XD', '#ff61f6', 'xd')
add('FIG', '#a259ff', 'fig')
add('SKT', '#fdad00', 'sketch')
add('AFF', '#7e4dd2', 'afdesign', 'afphoto', 'afpub')
add('KRA', '#3babff', 'kra', 'xcf')
add('LOT', '#00ddb3', 'lottie')
add('RIV', '#ef4b6c', 'riv')
add('BLD', '#ea7600', 'blend')
add('3D', '#f5a623', 'glb', 'gltf', 'obj', 'fbx', 'stl', 'dae', 'usd', 'usda', 'usdz', '3ds', 'ply', 'step', 'stp', 'iges', 'igs', 'max', 'ma', 'mb', 'c4d')
add('ASE', '#c17bfa', 'aseprite', 'ase')

// ---- Audio, video and fonts
add('AUD', '#f472b6', 'mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'aiff', 'aif', 'wma', 'mid', 'midi')
add('VID', '#ec4899', 'mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'mpeg', 'mpg', '3gp', 'ogv')
add('FNT', '#e5c07b', 'ttf', 'otf', 'woff', 'woff2', 'eot', 'pfb', 'fon')

// ---- Archives, packages and binaries
add('ZIP', '#d4a72c', 'zip', 'gz', 'tgz', 'tar', 'bz2', 'tbz2', 'xz', 'txz', 'zst', 'lz', 'lz4', '7z', 'rar', 'cab', 'br')
add('JAR', '#b07219', 'jar', 'war', 'ear', 'aar')
add('WHL', '#3572a5', 'whl', 'egg')
add('GEM', '#cc342d', 'gem')
add('APK', '#3ddc84', 'apk', 'aab', 'xapk')
add('IPA', '#a2aaad', 'ipa', 'app')
add('PKG', '#8b949e', 'deb', 'rpm', 'pkg', 'msi', 'msix', 'appimage', 'snap', 'flatpak', 'nupkg', 'vsix', 'crx', 'xpi')
add('DMG', '#a2aaad', 'dmg', 'iso', 'img', 'vhdx', 'vmdk', 'qcow2', 'ova')
add('EXE', '#8b949e', 'exe', 'com', 'bin', 'elf')
add('LIB', '#8b949e', 'dll', 'so', 'dylib', 'a', 'lib', 'o', 'ko', 'sys')
add('PYC', '#3572a5', 'pyc', 'pyo', 'pyd')
add('MAP', '#9ca3af', 'map')

// ---- Keys and secrets
add('KEY', '#e5c07b', 'pem', 'crt', 'cer', 'der', 'key', 'p12', 'pfx', 'jks', 'keystore', 'csr', 'p8', 'ppk')
add('GPG', '#0093dd', 'gpg', 'pgp', 'asc', 'sig')
add('SSH', '#e5c07b', 'pub')

// ---- Build and tooling by extension
add('MK', '#427819', 'mk', 'mak')
add('CMK', '#da3434', 'cmake')
add('GRD', '#02303a', 'gradle')
add('NIN', '#9ca3af', 'ninja')
add('BZL', '#76d275', 'bzl', 'bazel')
add('DKR', '#2496ed', 'dockerfile', 'containerfile')
add('K8S', '#326ce5', 'helm')
add('TPL', '#9ca3af', 'tpl', 'tmpl', 'template', 'j2', 'jinja', 'jinja2')
add('BAK', '#6b7280', 'bak', 'old', 'orig', 'swp', 'tmp', 'temp')

// Whole names, matched without case.
const named: Record<string, FileType> = {}
const name = (label: string, color: string, ...names: string[]): void => {
  for (const n of names) named[n] = [label, color]
}
name('CLD', '#d97757', 'claude.md', 'claude.local.md', '.claude', 'agents.md')
name('GIT', '#f05032', '.gitignore', '.gitattributes', '.gitmodules', '.gitkeep', '.mailmap', '.git-blame-ignore-revs')
name('NPM', '#cb3837', 'package.json', 'package-lock.json', '.npmrc', '.npmignore', 'npm-shrinkwrap.json')
name('YRN', '#2c8ebb', 'yarn.lock', '.yarnrc', '.yarnrc.yml')
name('PNP', '#f69220', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.pnpmfile.cjs')
name('BUN', '#fbf0df', 'bun.lockb', 'bun.lock', 'bunfig.toml')
name('DNO', '#70ffaf', 'deno.json', 'deno.jsonc', 'deno.lock')
name('TS', '#3178c6', 'tsconfig.json', 'tsconfig.base.json', 'tsconfig.build.json')
name('JS', '#f1e05a', 'jsconfig.json')
name('RS', '#dea584', 'cargo.toml', 'cargo.lock', 'rust-toolchain', 'rust-toolchain.toml', 'clippy.toml', 'rustfmt.toml')
name('GO', '#00add8', 'go.mod', 'go.sum', 'go.work', 'go.work.sum')
name('PY', '#3572a5', 'pyproject.toml', 'requirements.txt', 'requirements-dev.txt', 'setup.py', 'setup.cfg', 'pipfile', 'pipfile.lock', 'poetry.lock', 'uv.lock', 'tox.ini', '.python-version', 'manage.py', 'conftest.py')
name('RB', '#cc342d', 'gemfile', 'gemfile.lock', 'rakefile', '.ruby-version', 'config.ru', 'guardfile')
name('PHP', '#4f5d95', 'composer.json', 'composer.lock', 'artisan')
name('EX', '#6e4a7e', 'mix.exs', 'mix.lock')
name('DRT', '#00b4ab', 'pubspec.yaml', 'pubspec.lock')
name('SW', '#f05138', 'package.swift', 'package.resolved')
name('POD', '#ee3322', 'podfile', 'podfile.lock')
name('GRD', '#02303a', 'build.gradle', 'settings.gradle', 'build.gradle.kts', 'settings.gradle.kts', 'gradle.properties', 'gradlew', 'gradlew.bat')
name('MVN', '#c71a36', 'pom.xml', 'mvnw', 'mvnw.cmd')
name('SBT', '#c22d40', 'build.sbt')
name('CMK', '#da3434', 'cmakelists.txt', 'cmakepresets.json')
name('MK', '#427819', 'makefile', 'gnumakefile', 'mkfile')
name('JUS', '#b5a07a', 'justfile', '.justfile')
name('TSK', '#29beb0', 'taskfile.yml', 'taskfile.yaml')
name('BZL', '#76d275', 'build', 'build.bazel', 'workspace', 'workspace.bazel', 'module.bazel', '.bazelrc', '.bazelversion')
name('DKR', '#2496ed', 'dockerfile', 'containerfile', '.dockerignore', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml')
name('K8S', '#326ce5', 'chart.yaml', 'values.yaml', 'kustomization.yaml', 'skaffold.yaml')
name('JNK', '#d24939', 'jenkinsfile')
name('VAG', '#1868f2', 'vagrantfile')
name('PRC', '#79589f', 'procfile')
name('BRW', '#fbb040', 'brewfile')
name('NIX', '#7e7eff', 'flake.nix', 'flake.lock', 'default.nix', 'shell.nix')
name('CI', '#fc6d26', '.gitlab-ci.yml', '.travis.yml', 'azure-pipelines.yml', 'bitbucket-pipelines.yml', 'appveyor.yml', '.drone.yml', 'cloudbuild.yaml', 'buildspec.yml')
name('VCL', '#e5e7eb', 'vercel.json', '.vercelignore')
name('NTL', '#00c7b7', 'netlify.toml')
name('CF', '#f38020', 'wrangler.toml', 'wrangler.json', 'wrangler.jsonc')
name('FLY', '#8b5cf6', 'fly.toml')
name('RND', '#46e3b7', 'render.yaml')
name('FB', '#ffca28', 'firebase.json', '.firebaserc', 'firestore.rules')
name('PRT', '#f7b93e', '.prettierrc', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', 'prettier.config.js', 'prettier.config.mjs', 'prettier.config.cjs', '.prettierignore')
name('ESL', '#8080f2', '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yml', '.eslintrc.yaml', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', '.eslintignore')
name('BIO', '#60a5fa', 'biome.json', 'biome.jsonc')
name('STL', '#e2e8f0', '.stylelintrc', '.stylelintrc.json', 'stylelint.config.js')
name('BBL', '#f9dc3e', '.babelrc', '.babelrc.json', 'babel.config.js', 'babel.config.json')
name('VIT', '#9499ff', 'vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts', 'vitest.config.ts', 'vitest.config.js', 'vitest.workspace.ts')
name('WPK', '#8ed6fb', 'webpack.config.js', 'webpack.config.ts', 'webpack.config.cjs')
name('RLP', '#ef3335', 'rollup.config.js', 'rollup.config.mjs', 'rollup.config.ts')
name('ESB', '#ffcf00', 'esbuild.config.js', 'esbuild.config.mjs')
name('TW', '#38bdf8', 'tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs')
name('PCS', '#dd3a0a', 'postcss.config.js', 'postcss.config.cjs', 'postcss.config.mjs', '.postcssrc')
name('NXT', '#e5e7eb', 'next.config.js', 'next.config.mjs', 'next.config.ts', 'next-env.d.ts')
name('NUX', '#00dc82', 'nuxt.config.ts', 'nuxt.config.js')
name('AST', '#ff5a03', 'astro.config.mjs', 'astro.config.ts')
name('SVK', '#ff3e00', 'svelte.config.js')
name('RMX', '#e5e7eb', 'remix.config.js')
name('JES', '#99425b', 'jest.config.js', 'jest.config.ts', 'jest.config.cjs', 'jest.config.mjs')
name('PW', '#2ead33', 'playwright.config.ts', 'playwright.config.js')
name('CY', '#69d3a7', 'cypress.config.ts', 'cypress.config.js')
name('SB', '#ff4785', '.storybook')
name('TRB', '#ef4444', 'turbo.json')
name('NX', '#94a3b8', 'nx.json', 'project.json')
name('LRN', '#9333ea', 'lerna.json')
name('RNV', '#1a1f6c', 'renovate.json', '.renovaterc')
name('DBT', '#1f6feb', 'dependabot.yml')
name('HSK', '#e5e7eb', '.husky')
name('LST', '#ff3d3d', '.lintstagedrc', 'lint-staged.config.js')
name('CMT', '#e5e7eb', 'commitlint.config.js', '.commitlintrc', '.czrc')
name('EDC', '#e5e7eb', '.editorconfig')
name('NVM', '#3c873a', '.nvmrc', '.node-version')
name('TV', '#9ca3af', '.tool-versions', '.mise.toml', 'mise.toml', '.envrc')
name('ENV', '#ecd53f', '.env', '.env.example', '.env.local', '.env.development', '.env.production', '.env.test', '.env.sample', '.env.template')
name('LIC', '#d0bf41', 'license', 'license.md', 'license.txt', 'licence', 'licence.md', 'copying', 'unlicense', 'notice')
name('MD', '#519aba', 'readme', 'readme.md', 'readme.txt', 'contributing.md', 'code_of_conduct.md', 'security.md', 'support.md', 'authors', 'authors.md')
name('CHG', '#8bc34a', 'changelog', 'changelog.md', 'changes.md', 'history.md', 'news.md', 'releases.md')
name('OWN', '#9ca3af', 'codeowners', 'owners')
name('ROB', '#9ca3af', 'robots.txt', 'humans.txt', 'security.txt')
name('ICO', '#a074c4', 'favicon.ico')
name('VSC', '#007acc', '.vscode', 'settings.json', 'extensions.json', 'launch.json', 'tasks.json')
name('IDE', '#fe315d', '.idea')
name('XCD', '#1575f9', 'project.pbxproj', 'info.plist')
name('AND', '#3ddc84', 'androidmanifest.xml')
name('ZSH', '#89e051', '.zshrc', '.zprofile', '.zshenv', '.bashrc', '.bash_profile', '.profile', '.inputrc')
name('VIM', '#199f4b', '.vimrc', '.gvimrc', 'init.vim')
name('LUA', '#000080', 'init.lua', '.luarc.json')
name('TMX', '#1bb91f', '.tmux.conf', 'tmux.conf')
name('SSH', '#e5c07b', 'id_rsa', 'id_ed25519', 'id_ecdsa', 'known_hosts', 'authorized_keys')
name('WAR', '#9ca3af', '.htaccess', 'nginx.conf', 'httpd.conf', 'caddyfile')

// Compound suffixes, longest first: what the file is beyond its last extension.
const compound: readonly (readonly [suffix: string, type: FileType])[] = [
  ['.d.ts', ['DTS', '#3178c6']],
  ['.d.mts', ['DTS', '#3178c6']],
  ['.d.cts', ['DTS', '#3178c6']],
  ['.test.ts', ['TST', '#c21325']],
  ['.test.tsx', ['TST', '#c21325']],
  ['.test.js', ['TST', '#c21325']],
  ['.test.jsx', ['TST', '#c21325']],
  ['.spec.ts', ['TST', '#c21325']],
  ['.spec.tsx', ['TST', '#c21325']],
  ['.spec.js', ['TST', '#c21325']],
  ['.spec.jsx', ['TST', '#c21325']],
  ['.test.py', ['TST', '#c21325']],
  ['_test.go', ['TST', '#c21325']],
  ['_test.py', ['TST', '#c21325']],
  ['_spec.rb', ['TST', '#c21325']],
  ['.stories.tsx', ['SB', '#ff4785']],
  ['.stories.ts', ['SB', '#ff4785']],
  ['.stories.jsx', ['SB', '#ff4785']],
  ['.stories.js', ['SB', '#ff4785']],
  ['.stories.mdx', ['SB', '#ff4785']],
  ['.min.js', ['MIN', '#f1e05a']],
  ['.min.css', ['MIN', '#663399']],
  ['.module.css', ['CSS', '#663399']],
  ['.module.scss', ['SCS', '#c6538c']],
  ['.tar.gz', ['ZIP', '#d4a72c']],
  ['.tar.bz2', ['ZIP', '#d4a72c']],
  ['.tar.xz', ['ZIP', '#d4a72c']],
  ['.tar.zst', ['ZIP', '#d4a72c']],
  ['.blade.php', ['BLD', '#f05340']],
  ['.html.erb', ['ERB', '#701516']],
  ['.gitlab-ci.yml', ['CI', '#fc6d26']],
  ['.code-workspace', ['VSC', '#007acc']],
]

// Colors readable on a dark pane: one darker than this gets mixed toward white until it is not.
const MIN_LUMINANCE = 0.32
const channel = (v: number): number => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
export const luminance = (hex: string): number => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) || 0)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
// Brighter by lightness, keeping the hue and its saturation, so a dark blue stays blue rather than greying.
const toHsl = (r: number, g: number, b: number): [number, number, number] => {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [h / 6, sat, l]
}
const fromHsl = (h: number, sat: number, l: number): string => {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = sat * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('')
}
const lift = (hex: string): string => {
  if (luminance(hex) >= MIN_LUMINANCE) return hex
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) || 0)
  const [h, sat, l] = toHsl(r, g, b)
  let out = hex
  for (let L = l; L <= 0.97 && luminance(out) < MIN_LUMINANCE; L += 0.02) out = fromHsl(h, Math.max(sat, 0.15 * (sat > 0 ? 1 : 0)), L)
  return out
}
const readable = (t: FileType): FileType => [t[0], lift(t[1])]
for (const k of Object.keys(ext)) ext[k] = readable(ext[k] as FileType)
for (const k of Object.keys(named)) named[k] = readable(named[k] as FileType)
const compoundReadable = compound.map(([s, t]) => [s, readable(t)] as const)

export const EXTENSIONS: Readonly<Record<string, FileType>> = ext
export const NAMES: Readonly<Record<string, FileType>> = named

const UNKNOWN = '#9ca3af'

/** The badge for a file name: whole name, then compound suffix, then extension, then a fallback. */
export const fileTypeOf = (fileName: string): FileType => {
  const lower = fileName.toLowerCase()
  const whole = named[lower]
  if (whole) return whole
  for (const [suffix, type] of compoundReadable) if (lower.endsWith(suffix) && lower.length > suffix.length) return type
  if (lower.startsWith('.env')) return named['.env'] ?? ['ENV', '#ecd53f']
  if (lower.startsWith('dockerfile') || lower.endsWith('.dockerfile')) return named.dockerfile ?? ['DKR', '#2496ed']
  if (/^(docker-)?compose\.[\w.-]*ya?ml$/.test(lower)) return named['compose.yml'] ?? ['DKR', '#2496ed']
  if (/^\.github$|^\.github\//.test(lower)) return ['GH', '#e5e7eb']
  const dot = lower.lastIndexOf('.')
  const e = dot > 0 ? lower.slice(dot + 1) : dot === 0 ? lower.slice(1) : ''
  const byExt = ext[e]
  if (byExt) return byExt
  // A dotfile with no known name: a config file. No extension at all: a plain file.
  if (dot === 0) return ['CFG', UNKNOWN]
  return [e ? e.slice(0, 3).toUpperCase() : '•', UNKNOWN]
}
