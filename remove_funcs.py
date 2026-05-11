#!/usr/bin/env python3
"""Robust removal of unused functions from studioClient.ts - handles multi-line"""

import re

studio_path = '/home/etherman/Projects/hermes_shell/apps/desktop-studio/src/api/studioClient.ts'
with open(studio_path, 'r') as f:
    content = f.read()

original_len = len(content)

# Functions to remove
functions_to_remove = [
    'checkAdapterHealth',
    'getCheckpoint',
    'getCronJob',
    'getRun',
    'getToolPack',
    'patchConfig',
]

for fn in functions_to_remove:
    # Find export async function fn(
    pattern = rf'\nexport\s+async\s+function\s+{fn}\s*\('
    match = re.search(pattern, content)
    if not match:
        # Try export function fn(
        pattern = rf'\nexport\s+function\s+{fn}\s*\('
        match = re.search(pattern, content)
    
    if not match:
        print(f"  WARNING: function {fn} not found")
        continue
    
    start = match.start()
    # Find the function body - find first { and matching }
    brace_start = content.find('{', start)
    if brace_start == -1:
        print(f"  WARNING: no opening brace for {fn}")
        continue
    
    depth = 1
    pos = brace_start + 1
    while pos < len(content) and depth > 0:
        if content[pos] == '{':
            depth += 1
        elif content[pos] == '}':
            depth -= 1
        pos += 1
    
    end = pos
    # Go back to beginning of line
    line_start = content.rfind('\n', 0, start) + 1
    
    removed = content[line_start:end]
    content = content[:line_start] + content[end:]
    print(f"  Removed function {fn} ({len(removed)} chars)")

print(f"\nTotal removed: {original_len - len(content)} chars")
print(f"Final length: {len(content)}")

with open(studio_path, 'w') as f:
    f.write(content)

print("Written to file!")