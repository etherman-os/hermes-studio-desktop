#!/usr/bin/env python3
with open('/home/etherman/Projects/hermes_shell/apps/desktop-studio/src/api/studioClient.ts', 'r') as f:
    c = f.read()
print('RunResponse references:', c.count('RunResponse'))
print('getRun references:', c.count('getRun'))
print('getSessions references:', c.count('getSessions'))
print('SessionsResponse references:', c.count('SessionsResponse'))
print('SessionDetail references:', c.count('SessionDetail'))
print('Total lines:', len(c.split('\n')))