#!/usr/bin/env python3
"""Robust removal of unused exports from studioClient.ts"""

import re

studio_path = '/home/etherman/Projects/hermes_shell/apps/desktop-studio/src/api/studioClient.ts'
with open(studio_path, 'r') as f:
    content = f.read()

original_len = len(content)

# I'll remove each item by constructing the exact pattern and removing it
# Start with the function removals which are simpler

# 1. checkAdapterHealth - export async function on single/multiple lines
# Find and remove this function entirely
content = re.sub(
    r'\nexport\s+async\s+function\s+checkAdapterHealth\s*\([^)]*\)\s*\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)

# 2. clearAdapterToken  
content = re.sub(
    r'\nexport\s+function\s+clearAdapterToken\s*\([^)]*\)\s*\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)

# 3. getAdapterUrl
content = re.sub(
    r'\nexport\s+function\s+getAdapterUrl\s*\([^)]*\)\s*\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)

# 4. setAdapterToken
content = re.sub(
    r'\nexport\s+function\s+setAdapterToken\s*\([^)]*\)\s*\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)

# 5. getCheckpoint
content = re.sub(
    r'\nexport\s+async\s+function\s+getCheckpoint\s*\([^)]*\)\s*\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)

# 6. getConfig
content = re.sub(
    r'\nexport\s+async\s+function\s+getConfig\s*\([^)]*\)\s*\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)

# 7. getCronJob
content = re.sub(
    r'\nexport\s+async\s+function\s+getCronJob\s*\([^)]*\)\s*\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)

# 8. getRun (need to be careful - getRunLedger also has "getRun" in it)
# This is getRun followed by (runId: string) - not getRunLedger
content = re.sub(
    r'\nexport\s+async\s+function\s+getRun\(runId:\s*string\)\s*\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)

# 9. getToolPack
content = re.sub(
    r'\nexport\s+async\s+function\s+getToolPack\s*\([^)]*\)\s*\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)

# 10. patchConfig
content = re.sub(
    r'\nexport\s+async\s+function\s+patchConfig\s*\([^)]*\)\s*\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)

print(f"After function removal: {original_len - len(content)} chars removed")

# Now remove interfaces - more complex due to nested braces
# For each interface, find the export interface line and matching closing brace

interfaces_to_remove = [
    'ActivateProfileResponse',
    'AdapterErrorEnvelope',
    'AuthBootstrapResult',
    'BootstrapResponse',
    'CheckpointListResponse',
    'ConfigResponse',
    'HealthResponse',
    'HermesDoctorCheck',
    'HermesInventoryResponse',
    'HermesToolsetConfigureResult',
    'KanbanBoardsResponse',
    'KanbanLinkRunRequest',
    'KanbanLinkSessionRequest',
    'KanbanUpdatedPayload',
    'LogEventHandlers',
    'LogsResponse',
    'ProcessLogsResponse',
    'ProcessesResponse',
    'RunEventHandlers',
    'RunResponse',
    'SessionDetail',
    'SessionSummary',
    'SessionsResponse',
    'StorageStatus',
    'ThemeReloadResponse',
    'ThemesResponse',
    'ToolPackCommand',
    'ToolPacksResponse',
    'WorktreeListResponse',
]

for iface in interfaces_to_remove:
    # Find the interface declaration
    pattern = rf'\nexport\s+interface\s+{iface}\s*\{{'
    match = re.search(pattern, content)
    if not match:
        print(f"  WARNING: interface {iface} not found")
        continue
    
    start = match.start()
    # Find the opening brace
    brace_start = match.end() - 1  # position of {
    depth = 1
    pos = brace_start + 1
    while pos < len(content) and depth > 0:
        if content[pos] == '{':
            depth += 1
        elif content[pos] == '}':
            depth -= 1
        pos += 1
    
    end = pos  # position after closing }
    
    # Remove from start (go back to beginning of line)
    line_start = content.rfind('\n', 0, start) + 1
    
    content = content[:line_start] + content[end:]
    print(f"  Removed interface {iface}")

print(f"\nTotal removed: {original_len - len(content)} chars")
print(f"Final length: {len(content)}")

with open(studio_path, 'w') as f:
    f.write(content)

print("Written to file!")