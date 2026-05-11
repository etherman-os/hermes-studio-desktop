#!/usr/bin/env python3
"""Robustly remove unused exports from studioClient.ts"""

studio_path = '/home/etherman/Projects/hermes_shell/apps/desktop-studio/src/api/studioClient.ts'
with open(studio_path, 'r') as f:
    lines = f.readlines()

original_count = len(lines)
output_lines = []

# Track what's removed
removed_functions = set()
removed_interfaces = set()

i = 0
while i < len(lines):
    line = lines[i]
    
    # Check for function removal
    func_match = None
    if 'export async function ' in line:
        m = line.match(r'export async function (\w+)')
        if m:
            func_match = ('async', m.group(1))
    elif 'export function ' in line:
        m = line.match(r'export function (\w+)')
        if m:
            func_match = ('', m.group(1))
    
    # Check for interface removal
    iface_match = None
    if 'export interface ' in line:
        m = line.match(r'export interface (\w+)')
        if m:
            iface_match = m.group(1)
    
    # Skip this line if removing
    should_skip = False
    
    # Function removal
    if 'export async function checkAdapterHealth' in line:
        removed_functions.add('checkAdapterHealth')
        should_skip = True
        # Skip until we find the closing }
    elif 'export async function clearAdapterToken' in line:
        removed_functions.add('clearAdapterToken')
        should_skip = True
    elif 'export function getAdapterUrl' in line:
        removed_functions.add('getAdapterUrl')
        should_skip = True
    elif 'export async function getCheckpoint' in line:
        removed_functions.add('getCheckpoint')
        should_skip = True
    elif 'export async function getConfig' in line:
        removed_functions.add('getConfig')
        should_skip = True
    elif 'export async function getCronJob' in line:
        removed_functions.add('getCronJob')
        should_skip = True
    elif 'export async function getRun(' in line:
        removed_functions.add('getRun')
        should_skip = True
    elif 'export async function getToolPack' in line:
        removed_functions.add('getToolPack')
        should_skip = True
    elif 'export async function patchConfig' in line:
        removed_functions.add('patchConfig')
        should_skip = True
    elif 'export function setAdapterToken' in line:
        removed_functions.add('setAdapterToken')
        should_skip = True
    
    if not should_skip:
        output_lines.append(line)
    
    i += 1

# Hmm, that approach won't work for multi-line items. Let me rewrite completely

studio_path = '/home/etherman/Projects/hermes_shell/apps/desktop-studio/src/api/studioClient.ts'
with open(studio_path, 'r') as f:
    content = f.read()

# I'll do precise string replacements for each item
# Starting with functions that we know are on single/multi lines

to_remove_funcs = [
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

to_remove_ifaces = [
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

def remove_by_exact_match(content, prefix, suffix, items):
    """Remove items by exact prefix+suffix match at line boundaries"""
    result = []
    lines = content.split('\n')
    skip_next = False
    skip_depth = 0
    
    for line in lines:
        should_remove = False
        
        # Check if this line starts an item we want to remove
        for item in items:
            pattern = prefix + item + suffix
            if pattern in line:
                # This is the start of a removal
                if '{' in line:
                    skip_depth = 1
                    skip_next = True
                    should_remove = True
                elif ';' in line or line.strip() == '':
                    should_remove = True
                break
        
        if should_remove:
            continue
        
        if skip_next:
            # Count braces on this line
            open_b = line.count('{')
            close_b = line.count('}')
            if open_b >= skip_depth:
                skip_depth += open_b
            skip_depth -= close_b
            if skip_depth <= 0:
                skip_next = False
            continue
        
        result.append(line)
    
    return '\n'.join(result)

print(f"Original lines: {len(content.split(chr(10)))}")