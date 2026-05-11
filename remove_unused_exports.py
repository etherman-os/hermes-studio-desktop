#!/usr/bin/env python3
"""Remove unused exports from studioClient.ts"""

import re

studio_path = '/home/etherman/Projects/hermes_shell/apps/desktop-studio/src/api/studioClient.ts'
with open(studio_path, 'r') as f:
    content = f.read()

original = content

# Items to remove (functions)
remove_functions = [
    'checkAdapterHealth',
    'clearAdapterToken', 
    'getAdapterUrl',
    'getCheckpoint',
    'getConfig',
    'getCronJob',
    'getRun',
    'getToolPack',
    'patchConfig',
    'setAdapterToken',
]

# Items to remove (interfaces)
remove_interfaces = [
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

# Remove export async function name(...) { ... }
for fn in remove_functions:
    # Match export async function name or export function name
    pattern = rf'\nexport\s+(?:async\s+)?function\s+{fn}\s*\([^)]*\)\s*\{{[^}}]*\}}\n'
    content = re.sub(pattern, '\n', content)
    # Also remove plain function (not exported)
    pattern = rf'\nexport\s+(?:async\s+)?function\s+{fn}\b'
    content = re.sub(pattern, '\n', content)

# Remove interface declarations
for iface in remove_interfaces:
    # export interface Name { ... }
    pattern = rf'\nexport\s+interface\s+{iface}\s*\{{[^}}]*\}}\n'
    content = re.sub(pattern, '\n', content)

print(f"Original length: {len(original)}")
print(f"New length: {len(content)}")
print(f"Removed: {len(original) - len(content)} chars")

with open(studio_path, 'w') as f:
    f.write(content)

print("Done!")