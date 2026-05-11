#!/usr/bin/env python3
"""Remove unused exports from studioClient.ts - more robust version"""

import re

studio_path = '/home/etherman/Projects/hermes_shell/apps/desktop-studio/src/api/studioClient.ts'
with open(studio_path, 'r') as f:
    content = f.read()

original = content

# We'll apply surgical removals one at a time

def remove_function(name):
    global content
    # Match: export async function name(...) { ... }
    # Where body can contain nested { }
    pattern = rf'\nexport\s+async\s+function\s+{name}\s*\('
    idx = content.find(f'export async function {name}')
    if idx == -1:
        # Try without async
        pattern = rf'\nexport\s+function\s+{name}\s*\('
        idx = content.find(f'export function {name}')
    
    if idx == -1:
        print(f"  WARNING: function {name} not found")
        return
    
    # Find the function start
    start = idx
    # Find the opening brace
    brace_start = content.find('{', start)
    if brace_start == -1:
        print(f"  WARNING: no opening brace for {name}")
        return
    
    # Find matching closing brace
    depth = 1
    pos = brace_start + 1
    while pos < len(content) and depth > 0:
        if content[pos] == '{':
            depth += 1
        elif content[pos] == '}':
            depth -= 1
        pos += 1
    
    end = pos  # closing brace position
    # Remove the whole thing including newline before
    while start > 0 and content[start-1] != '\n':
        start -= 1
    
    content = content[:start] + content[end:]
    print(f"  Removed function {name}")

def remove_interface(name):
    global content
    pattern = rf'\nexport\s+interface\s+{name}\s*\{{'
    idx = content.find(f'export interface {name}')
    if idx == -1:
        print(f"  WARNING: interface {name} not found")
        return
    
    start = idx
    brace_start = content.find('{', start)
    if brace_start == -1:
        print(f"  WARNING: no opening brace for {name}")
        return
    
    depth = 1
    pos = brace_start + 1
    while pos < len(content) and depth > 0:
        if content[pos] == '{':
            depth += 1
        elif content[pos] == '}':
            depth -= 1
        pos += 1
    
    end = pos
    while start > 0 and content[start-1] != '\n':
        start -= 1
    
    content = content[:start] + content[end:]
    print(f"  Removed interface {name}")

# Functions to remove
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

# Interfaces to remove
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

print("Removing functions...")
for fn in remove_functions:
    remove_function(fn)

print("Removing interfaces...")
for iface in remove_interfaces:
    remove_interface(iface)

print(f"\nOriginal length: {len(original)}")
print(f"New length: {len(content)}")
print(f"Removed: {len(original) - len(content)} chars")

with open(studio_path, 'w') as f:
    f.write(content)

print("Done!")