#!/usr/bin/env python3
with open('/home/etherman/Projects/hermes_shell/apps/desktop-studio/src/api/studioClient.ts', 'r') as f:
    c = f.read()

unused_funcs = [
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

print("Checking if unused functions are still present...")
for fn in unused_funcs:
    # Check for export async function fn or export function fn
    if f'export async function {fn}' in c or f'export function {fn}' in c:
        print(f"  STILL PRESENT: {fn}")
    else:
        print(f"  REMOVED: {fn}")