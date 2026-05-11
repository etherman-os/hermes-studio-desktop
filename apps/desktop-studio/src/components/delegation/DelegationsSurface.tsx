import React from "react";
import { useRunLedgerStore, type RunRecord } from "../../stores/runLedgerStore";
import { useDelegationStore } from "../../stores/delegationStore";
import { useLayoutStore } from "../../stores/layoutStore";

export interface DelegationNode {
  id: string;
  parentRun: RunRecord;
  childRuns: RunRecord[];
  expanded: boolean;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function runTitle(run: RunRecord) {
  return run.prompt || run.runId.slice(0, 16);
}

function buildDelegationTree(
  runs: RunRecord[],
  delegations: { parent_run_id: string; child_run_id: string }[]
): DelegationNode[] {
  const childMap = new Map<string, string[]>();
  for (const d of delegations) {
    const existing = childMap.get(d.parent_run_id) ?? [];
    if (!existing.includes(d.child_run_id)) existing.push(d.child_run_id);
    childMap.set(d.parent_run_id, existing);
  }

  const nodes: DelegationNode[] = [];
  const processed = new Set<string>();

  for (const run of runs) {
    const childIds = childMap.get(run.runId);
    if (!childIds || childIds.length === 0) continue;
    if (processed.has(run.runId)) continue;
    processed.add(run.runId);

    const childRuns = runs.filter((r) => childIds.includes(r.runId));
    if (childRuns.length === 0) continue;

    nodes.push({
      id: run.runId,
      parentRun: run,
      childRuns,
      expanded: true,
    });
  }

  return nodes;
}

function StatusDot({ status }: { status: string }) {
  return <span className={`status-dot status-${status}`} aria-hidden="true" />;
}

function RunNode({
  run,
  depth,
  isLast,
  onSelect,
  isSelected,
}: {
  run: RunRecord;
  depth: number;
  isLast: boolean;
  onSelect: () => void;
  isSelected: boolean;
}) {
  return (
    <button
      className={`delegation-run-node ${isSelected ? "active" : ""}`}
      onClick={onSelect}
      style={{ paddingLeft: `${depth * 20 + 8}px` }}
    >
      <span className="delegation-tree-connector" aria-hidden="true">
        {!isLast && <span className="connector-line" />}
        <span className="connector-branch" />
      </span>
      <StatusDot status={run.status} />
      <span className="delegation-run-title">{runTitle(run)}</span>
      <span className="delegation-run-meta">
        {run.status} · {formatDuration(run.durationMs)}
      </span>
      <span className="delegation-run-time">{formatTime(run.startedAt)}</span>
    </button>
  );
}

function DelegationNodeView({
  node,
  selectedRunId,
  onSelectRun,
  onToggleExpand,
}: {
  node: DelegationNode;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onToggleExpand: (nodeId: string) => void;
}) {
  const isSelected = selectedRunId === node.parentRun.runId;

  return (
    <div className="delegation-tree-node">
      <div className="delegation-parent-row">
        <button
          className={`delegation-parent-button ${isSelected ? "active" : ""}`}
          onClick={() => onSelectRun(node.parentRun.runId)}
        >
          <span
            className={`delegation-expand-toggle ${node.expanded ? "expanded" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
            aria-label={node.expanded ? "Collapse children" : "Expand children"}
          >
            {node.childRuns.length > 0 ? (node.expanded ? "▼" : "▶") : "·"}
          </span>
          <StatusDot status={node.parentRun.status} />
          <span className="delegation-parent-title">{runTitle(node.parentRun)}</span>
          <span className="delegation-parent-meta">
            {formatDuration(node.parentRun.durationMs)} · {node.childRuns.length} child
            {node.childRuns.length !== 1 ? "ren" : ""}
          </span>
          <span className="delegation-parent-time">{formatTime(node.parentRun.startedAt)}</span>
        </button>
      </div>

      {node.expanded && node.childRuns.length > 0 && (
        <div className="delegation-children">
          {node.childRuns.map((child, idx) => (
            <RunNode
              key={child.runId}
              run={child}
              depth={1}
              isLast={idx === node.childRuns.length - 1}
              onSelect={() => onSelectRun(child.runId)}
              isSelected={selectedRunId === child.runId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DelegationsSurface() {
  const runs = useRunLedgerStore((s) => s.runs);
  const selectedRunId = useRunLedgerStore((s) => s.selectedRunId);
  const selectRun = useRunLedgerStore((s) => s.selectRun);
  const loadRecentRuns = useRunLedgerStore((s) => s.loadRecentRuns);
  const delegations = useDelegationStore((s) => s.delegations);
  const loadDelegations = useDelegationStore((s) => s.loadDelegations);
  const loading = useDelegationStore((s) => s.loading);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);

  const [showOnlyDelegations, setShowOnlyDelegations] = React.useState(true);

  const tree = React.useMemo(
    () => buildDelegationTree(runs, delegations.map((d) => ({ parent_run_id: d.parent_run_id, child_run_id: d.child_run_id }))),
    [runs, delegations]
  );

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const node of tree) initial[node.id] = true;
    return initial;
  });

  React.useEffect(() => {
    void loadDelegations({ limit: 100 });
    void loadRecentRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleToggleExpand(nodeId: string) {
    setExpanded((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  }

  function handleSelectRun(runId: string) {
    selectRun(runId);
    setActiveTab("runs");
  }

  const totalRuns = showOnlyDelegations ? tree.length : runs.length;
  const displayedNodes = showOnlyDelegations ? tree : runs.map((run) => ({
    id: run.runId,
    parentRun: run,
    childRuns: [] as RunRecord[],
    expanded: false,
  }));

  return (
    <div className="delegations-surface">
      <div className="delegations-surface-header">
        <div className="delegations-heading">
          <div className="workbench-eyebrow">CODE Mode</div>
          <h2>Delegation Tree</h2>
        </div>
        <div className="delegations-controls">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={showOnlyDelegations}
              onChange={(e) => setShowOnlyDelegations(e.target.checked)}
            />
            Show only delegations
          </label>
          <button
            className="tool-button"
            onClick={() => void loadRecentRuns()}
            disabled={loading}
            aria-label="Refresh runs"
          >
            {loading ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="delegations-tree-container">
        {displayedNodes.length === 0 && (
          <div className="delegations-empty">
            <div className="delegations-empty-icon" aria-hidden="true">&#x26A1;</div>
            <div className="delegations-empty-title">
              {showOnlyDelegations
                ? "No delegations found"
                : "No runs captured yet"}
            </div>
            <div className="delegations-empty-copy">
              {showOnlyDelegations
                ? "Sub-agent delegations will appear here when a run spawns child tasks."
                : "Start a prompt from Chat to begin capturing runs."}
            </div>
          </div>
        )}

        {showOnlyDelegations ? (
          <div className="delegation-tree-list">
            {displayedNodes.map((node) => (
              <DelegationNodeView
                key={node.id}
                node={{ ...node, expanded: expanded[node.id] ?? true }}
                selectedRunId={selectedRunId}
                onSelectRun={handleSelectRun}
                onToggleExpand={handleToggleExpand}
              />
            ))}
          </div>
        ) : (
          <div className="delegation-flat-list">
            {runs.map((run, idx) => (
              <RunNode
                key={run.runId}
                run={run}
                depth={0}
                isLast={idx === runs.length - 1}
                onSelect={() => handleSelectRun(run.runId)}
                isSelected={selectedRunId === run.runId}
              />
            ))}
          </div>
        )}
      </div>

      <div className="delegations-surface-footer">
        <span>
          {totalRuns} run{totalRuns !== 1 ? "s" : ""}
          {showOnlyDelegations && tree.length > 0
            ? ` · ${tree.reduce((acc, n) => acc + n.childRuns.length, 0)} child runs`
            : ""}
        </span>
        <span className="delegations-footer-note">
          Click a run to view in Run Ledger
        </span>
      </div>
    </div>
  );
}