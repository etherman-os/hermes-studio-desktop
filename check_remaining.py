#!/usr/bin/env python3
import re

studio_path = '/home/etherman/Projects/hermes_shell/apps/desktop-studio/src/api/studioClient.ts'
with open(studio_path, 'r') as f:
    content = f.read()

# Check which unused interfaces are still present
unused_interfaces = [
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

print("Checking remaining unused interfaces...")
for iface in unused_interfaces:
    # Check if interface declaration still exists
    if re.search(rf'\nexport\s+interface\s+{iface}\s*\{{', content):
        print(f"  STILL PRESENT: {iface}")
    else:
        print(f"  REMOVED: {iface}")

# Also check if removeWorktree is still present
print("\nChecking removeWorktree...")
if 'removeWorktree' in content:
    print("  removeWorktree is present")
else:
    print("  removeWorktree was removed")

print("\nContent summary:")
print(f"  Total length: {len(content)} chars")
print(f"  Total lines: {len(content.split(chr(10)))}")