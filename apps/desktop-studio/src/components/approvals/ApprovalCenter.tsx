import { useRunLedgerStore } from "../../stores/runLedgerStore";

export function ApprovalCenter() {
  const runs = useRunLedgerStore((s) => s.runs);
  const approvalEvents = runs
    .flatMap((run) => run.events)
    .filter((event) => event.type === "approval.requested" || event.type === "approval.resolved")
    .slice(-5)
    .reverse();

  return (
    <div className="approval-center">
      {approvalEvents.length === 0 ? (
        <div className="panel-note">No pending approvals. Future high-risk tool requests will collect here before execution continues.</div>
      ) : (
        approvalEvents.map((event) => (
          <div key={event.id} className="approval-row">
            <span>{event.type}</span>
            <span>{String(event.payload.tool ?? event.payload.action ?? event.payload.decision ?? "")}</span>
          </div>
        ))
      )}
    </div>
  );
}
