import re

# Read the studioClient.ts file
with open('/home/etherman/Projects/hermes_shell/apps/desktop-studio/src/api/studioClient.ts', 'r') as f:
    content = f.read()

exports = {}

# export type { ... } re-exports
re_exports = re.findall(r'export\s+type\s+\{([^}]+)\}\s+from\s+', content)
for group in re_exports:
    for item in group.split(','):
        item = item.strip()
        if item:
            exports[item] = 're-export'

# export interface
for m in re.findall(r'export\s+interface\s+(\w+)', content):
    exports[m] = 'interface'

# export type
for m in re.findall(r'export\s+type\s+(\w+)\s*=', content):
    exports[m] = 'type'

# export const
for m in re.findall(r'export\s+const\s+(\w+)', content):
    exports[m] = 'const'

# export function / export async function
for m in re.findall(r'export\s+(?:async\s+)?function\s+(\w+)', content):
    exports[m] = 'function'

print(f"Total exports: {len(exports)}")
for k, v in sorted(exports.items()):
    print(f"  {v}: {k}")