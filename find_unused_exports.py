import re
import os

studio_path = '/home/etherman/Projects/hermes_shell/apps/desktop-studio/src/api/studioClient.ts'
with open(studio_path, 'r') as f:
    studio_content = f.read()

src_dir = '/home/etherman/Projects/hermes_shell/apps/desktop-studio/src'

exports = {}

# export type { ... } re-exports
re_exports = re.findall(r'export\s+type\s+\{([^}]+)\}\s+from\s+', studio_content)
for group in re_exports:
    for item in group.split(','):
        item = item.strip()
        if item:
            exports[item] = ('re-export', None)

# export interface
for m in re.findall(r'export\s+interface\s+(\w+)', studio_content):
    exports[m] = ('interface', None)

# export type
for m in re.findall(r'export\s+type\s+(\w+)\s*=', studio_content):
    exports[m] = ('type-alias', None)

# export const
for m in re.findall(r'export\s+const\s+(\w+)', studio_content):
    exports[m] = ('const', None)

# export function / export async function
for m in re.findall(r'export\s+(?:async\s+)?function\s+(\w+)', studio_content):
    exports[m] = ('function', None)

def check_usage(name, src_dir):
    """Check if name is used as api.X or directly"""
    results = []
    for root, dirs, files in os.walk(src_dir):
        dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'dist']]
        for file in files:
            if file.endswith(('.ts', '.tsx')):
                filepath = os.path.join(root, file)
                if filepath.endswith('studioClient.ts'):
                    continue
                try:
                    with open(filepath, 'r') as f:
                        content = f.read()
                    # Check for api.name pattern
                    if re.search(r'\bapi\.' + re.escape(name) + r'\b', content):
                        results.append(filepath)
                    # Check for direct usage (functions used without api. prefix)
                    # Only for function types
                    elif re.search(r'\b' + re.escape(name) + r'\b', content):
                        results.append(filepath)
                except:
                    pass
    return results

unused = []
used = []

for name, (kind, _) in sorted(exports.items()):
    if kind == 're-export':
        used.append((name, kind, 're-export'))
        continue
    
    results = check_usage(name, src_dir)
    if not results:
        unused.append((name, kind))
    else:
        used.append((name, kind, results[:3]))

print(f"UNUSED EXPORTS ({len(unused)}):")
print("-" * 50)
for name, kind in unused:
    print(f"  {kind}: {name}")

print(f"\nTotal unused: {len(unused)}")
print(f"Total used: {len(used)}")