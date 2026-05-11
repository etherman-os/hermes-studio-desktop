export interface RunPreset {
  id: string;
  label: string;
  description: string;
  mode: string;
  prompt: string;
  skills: string[];
  toolsets: string[];
  checkpoints: boolean;
  maxTurns: number;
  worktree?: boolean;
  passSessionId?: boolean;
}

export interface NewRunDraft {
  prompt?: string;
  mode?: string;
  skills?: string[];
  toolsets?: string[];
  checkpoints?: boolean;
  maxTurns?: number;
  worktree?: boolean;
  passSessionId?: boolean;
  linkedCard?: string;
}

export const RUN_PRESETS: RunPreset[] = [
  {
    id: "implement",
    label: "Implement",
    description: "Make a scoped code change with tests and a clean verification pass.",
    mode: "task",
    prompt: "Implement the requested change in this workspace. Inspect the existing patterns first, keep the patch scoped, run the relevant checks, and summarize changed files.",
    skills: ["test-driven-development", "codebase-inspection"],
    toolsets: ["file", "terminal", "code_execution", "todo", "skills"],
    checkpoints: true,
    maxTurns: 90,
  },
  {
    id: "review",
    label: "Review",
    description: "Inspect the workspace like a code reviewer and return concrete issues first.",
    mode: "review",
    prompt: "Review this workspace for bugs, regressions, unsafe assumptions, missing tests, and UX quality issues. Lead with findings and include file references.",
    skills: ["codebase-inspection", "requesting-code-review"],
    toolsets: ["file", "terminal", "code_execution", "skills"],
    checkpoints: false,
    maxTurns: 60,
  },
  {
    id: "debug",
    label: "Debug",
    description: "Reproduce, isolate, patch, and verify a failing behavior.",
    mode: "debug",
    prompt: "Debug the reported problem in this workspace. Reproduce it, identify the root cause, make the smallest correct fix, and run verification.",
    skills: ["systematic-debugging", "node-inspect-debugger"],
    toolsets: ["terminal", "file", "code_execution", "browser", "skills"],
    checkpoints: true,
    maxTurns: 90,
  },
  {
    id: "design",
    label: "Design Polish",
    description: "Use Hermes creative/design skills with browser and image tools.",
    mode: "design",
    prompt: "Polish the UI/UX in this workspace like a professional production studio. Improve layout, interaction states, visual hierarchy, responsive behavior, and verify the result visually.",
    skills: ["popular-web-designs", "claude-design", "excalidraw"],
    toolsets: ["file", "browser", "vision", "image_gen", "skills"],
    checkpoints: true,
    maxTurns: 110,
  },
  {
    id: "browser-verify",
    label: "Browser Verify",
    description: "Run local browser checks and return evidence-focused fixes.",
    mode: "verify",
    prompt: "Open the local app or preview target, exercise the important user flows in a browser, capture what is broken, fix the issues, and rerun the checks.",
    skills: ["systematic-debugging"],
    toolsets: ["browser", "vision", "terminal", "file", "code_execution"],
    checkpoints: true,
    maxTurns: 80,
  },
  {
    id: "orchestrate",
    label: "Multi-Agent",
    description: "Plan work and use Hermes delegation/worktree power when available.",
    mode: "orchestration",
    prompt: "Break this goal into parallelizable work, use local Hermes delegation where it helps, keep worktree changes isolated, integrate the result, and run final verification.",
    skills: ["subagent-driven-development", "plan"],
    toolsets: ["delegation", "todo", "file", "terminal", "code_execution", "skills"],
    checkpoints: true,
    maxTurns: 120,
    worktree: true,
    passSessionId: true,
  },
  {
    id: "kanban-swarm",
    label: "Kanban Swarm",
    description: "Turn a goal into Hermes Kanban tasks and coordinated local agents.",
    mode: "orchestration",
    prompt: "Create a Hermes Kanban execution plan for this goal. Break it into independently claimable tasks, define dependencies, assign suitable Hermes profiles or subagents, and return the exact next commands or Studio actions needed to dispatch and monitor the work.",
    skills: ["kanban-orchestrator", "kanban-worker", "subagent-driven-development"],
    toolsets: ["delegation", "todo", "terminal", "file", "skills"],
    checkpoints: true,
    maxTurns: 120,
    worktree: true,
    passSessionId: true,
  },
  {
    id: "video",
    label: "Video Studio",
    description: "Storyboard and generate video assets through Hermes creative/video skills.",
    mode: "video",
    prompt: "Create a production-ready video generation plan from this brief. Produce storyboard beats, shot list, asset prompts, timing, audio notes, and use available Hermes video/image generation skills or local tools where configured.",
    skills: ["manim-video", "ascii-video", "comfyui", "pixel-art"],
    toolsets: ["video", "image_gen", "vision", "file", "terminal", "skills"],
    checkpoints: true,
    maxTurns: 100,
  },
  {
    id: "self-improve",
    label: "Studio Memory",
    description: "Extract reusable design preferences and project conventions.",
    mode: "memory",
    prompt: "Analyze this workspace and recent artifacts for reusable style, architecture, testing, and workflow preferences. Produce a concise Studio memory/profile update proposal without writing secrets or changing Hermes core files.",
    skills: ["codebase-inspection", "popular-web-designs", "writing-plans"],
    toolsets: ["file", "memory", "session_search", "skills"],
    checkpoints: false,
    maxTurns: 70,
  },
];

export function presetDraft(preset: RunPreset): NewRunDraft {
  return {
    prompt: preset.prompt,
    mode: preset.mode,
    skills: preset.skills,
    toolsets: preset.toolsets,
    checkpoints: preset.checkpoints,
    maxTurns: preset.maxTurns,
    worktree: preset.worktree,
    passSessionId: preset.passSessionId,
  };
}
