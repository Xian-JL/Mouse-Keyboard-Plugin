"""Validate and unpack our own local development tarball; never install a real Profile."""
from pathlib import Path, PurePosixPath
import hashlib, json, sys, tarfile

workspace = Path(__file__).resolve().parent.parent
archive = Path(sys.argv[1]).resolve()
stage = Path(sys.argv[2]).resolve()
if not archive.is_relative_to(workspace / 'artifacts') or not stage.is_relative_to(workspace / '.verification'):
    raise SystemExit('Package verification paths must stay in this project.')
if stage.exists():
    raise SystemExit('Refuse to overwrite an existing package stage.')
with tarfile.open(archive, 'r:gz') as tar:
    members = tar.getmembers()
    if len(members) > 1000 or sum(m.size for m in members) > 10 * 1024 * 1024:
        raise SystemExit('Unexpected package size.')
    names = set()
    for member in members:
        parts = PurePosixPath(member.name).parts
        if not parts or parts[0] != 'package' or any(p in ('..', '.') or ':' in p or '\\' in p for p in parts):
            raise SystemExit('Unexpected archive path.')
        if member.name in names or not (member.isfile() or member.isdir()):
            raise SystemExit('Duplicate, link, or special archive entry.')
        names.add(member.name)
        if any(p in ('node_modules', '.verification', 'tests', '.git', 'artifacts') for p in parts):
            raise SystemExit('Development or private data leaked into package.')
    development = ['lib/core.js', 'lib/contracts.js', 'lib/bridge.js', 'lib/authority.js', 'lib/client-settings.js']
    if any('package/' + name in names for name in development):
        raise SystemExit('Development test entrypoints leaked into the minimal runtime package.')
    required = ['package.json', 'lib/index.js', 'lib/client.js', 'helper/bootstrap.ps1', 'helper/Native.cs', 'helper/InputArbiter.cs', 'helper/Foreground.cs', 'helper/Server.cs', 'helper/Overlay.cs', 'assets/deepseek.svg', 'assets/deepseek.path.txt', 'assets/spec-binding.json', 'cordis.patch.yml', 'README.md']
    for name in required:
        if 'package/' + name not in names:
            raise SystemExit('Required package file missing: ' + name)
    stage.mkdir(parents=True)
    tar.extractall(stage, filter='data')
package = stage / 'package'
binding = json.loads((package / 'assets/spec-binding.json').read_text(encoding='utf-8'))
if binding['sha256'] != hashlib.sha256((workspace / 'spec.md').read_bytes()).hexdigest():
    raise SystemExit('Packaged specification binding does not match the source baseline.')
for file in package.rglob('*'):
    if file.is_file() and file.suffix in ('.js', '.cs', '.ps1', '.json', '.md', '.yml'):
        text = file.read_text(encoding='utf-8')
        if str(workspace).lower() in text.lower() or workspace.as_posix().lower() in text.lower():
            raise SystemExit('Development directory leaked into runtime package: ' + file.name)
meta = json.loads((package / 'package.json').read_text(encoding='utf-8'))
icon = hashlib.sha256((package / 'assets' / 'deepseek.svg').read_bytes()).hexdigest()
if icon != '8f9443e351b6dacce71871790201b799d92e8bf96a45ef79aeb5e9bf4db423e2':
    raise SystemExit('Packaged SVG differs from reviewed source.')
print(json.dumps({'ok': True, 'mode': 'local-tarball-inspection', 'version': meta['version'], 'private': meta['private'], 'files': len(members), 'unpackedBytes': sum(m.size for m in members), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'entry': str(package / 'lib' / 'index.js'), 'developmentEntrypointsExcluded': True, 'svgUnchanged': True, 'realDesktopProfileModified': False, 'inputSent': False, 'desktopObserved': False}))
