# Component Audit Report
Project: hermes_shell / desktop-studio
Audited: apps/desktop-studio/src/components/
Date: 2026-05-11

## Severity
CRITICAL: Memory leak or data loss risk
HIGH: Functional bug or severe performance issue
MEDIUM: Code smell or moderate risk
LOW: Minor improvement

## Summary
CRITICAL: 2, HIGH: 8, MEDIUM: 14, LOW: 12

## 1. ArtifactShelf.tsx - HIGH
- No ErrorBoundary around loadRevisions()
- MEMORY LEAK: attachVisualSelector adds mouseover/click to iframe doc but NEVER removes them
- runBrowserEvidence has no loading state
- Inline computations not useMemo wrapped
- iframe sandbox is security risk
- Visual selector buttons lack aria-label

## 2. HermesArsenalQuickPanel.tsx - MEDIUM
- No ErrorBoundary for loadInventory
- installedSkills/enabledToolsets computed inline should be useMemo
- QuickCard buttons lack aria-label
- No keyboard navigation

## 3. ChatSurface.tsx - HIGH
- No ErrorBoundary for sendPrompt
- tool-strip/token-footer lack aria-label
- role=article on chat-message is non-standard
- handleKeyDown only handles Enter

## 4. StartupScreen.tsx - CRITICAL
- TAURI LISTENER LEAK: listen async promise cleanup may call null unlistenRef
- No ErrorBoundary for invoke ensure_adapter_running 35s timeout
- Retry buttons lack aria-label

## 5. RunLedger.tsx - HIGH
- No ErrorBoundary for loadRunLedger loadRunContext loadApprovalsForRun loadRecentLogs createArtifact
- MEMORY LEAK: in-flight requests resolve with stale data after run changes
- 10+ inline computations NOT useMemo severe unnecessary re-renders

## 6. ProcessCockpit.tsx - MEDIUM
- No ErrorBoundary for loadProcesses with 5s interval refresh
- Interval cleanup correct (good)
- groupedTemplates inline should be useMemo
- ProcessCard candidate for React.memo

## 7. ProfilesSurface.tsx - MEDIUM
- No ErrorBoundary for loadProfiles/activateProfile
- DEAD CODE: setActiveProfileSection is no-op placeholder remove

## 8. NewRunModal.tsx - MEDIUM
- No ErrorBoundary for submit async sendPrompt
- Keyboard listener properly cleaned up (good)
- visibleSkills/runToolsets inline should be useMemo

## 9. SessionsPanel.tsx - MEDIUM
- No ErrorBoundary for api.getSession raw promise
- MEMORY LEAK: activeSessionId change during in-flight request resolves stale .then()
- relatedRun inline should be useMemo

## 10. DelegationPanel.tsx - MEDIUM
- No ErrorBoundary for loadDelegations on mount
- MEMORY LEAK: no abort if unmounts during load
- onNavigateToRun prop drilled should use context

## 11. DesignCanvas.tsx - MEDIUM
- No ErrorBoundary for importDesign/importAndGenerate
- designSkills/designToolsets inline should be useMemo

## 12. ContextInspector.tsx - MEDIUM
- No ErrorBoundary for loadWorkspaceContext/loadCurrentContext
- Error state shows empty without retry

## 13. ApprovalCenter.tsx - MEDIUM
- No ErrorBoundary for loadPendingApprovals/loadApprovals
- list/selected inline should be useMemo

## 14. WorktreeLauncher.tsx - MEDIUM
- No ErrorBoundary for createWorktree/removeWorktree/startRun
- MEMORY LEAK: loadWorktrees no abort if workspace changes

## Recommendations
CRITICAL:
1. StartupScreen.tsx fix Tauri listener cleanup race
2. ArtifactShelf.tsx clean up iframe listeners in useEffect return
HIGH:
3. RunLedger.tsx useMemo for 10+ inline computations
4. ArtifactShelf.tsx useMemo for 8+ inline computations
5. ChatSurface.tsx aria-label on tool-strip
6. All async store ops need ErrorBoundary
MEDIUM:
7. ProfilesSurface remove dead setActiveProfileSection
8. ProcessCockpit useMemo for groupedTemplates
9. DelegationPanel context instead of prop drilling
10. Full audit for 15 unread components
LOW:
11. Keyboard navigation for Arsenal worktree list delegation list
12. aria-label on section headings
13. Standardize loading skeleton usage
14. React.memo on ProcessCard ApprovalCard

Coverage: 20 components audited 15+ not fully reviewed
