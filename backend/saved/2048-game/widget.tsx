import React, { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = "http://localhost:9120";

interface WidgetProps {
  moduleId: string;
  data: Record<string, any> | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

// ── Types ────────────────────────────────────────────────────────
type Board = (number | null)[][];

interface GameState {
  board: Board;
  score: number;
  best: number;
  over: boolean;
  won: boolean;
}

interface SavedState extends GameState {
  history: GameState[];
}

// ── Constants ───────────────────────────────────────────────────
const SIZE = 4;
const EMPTY_BOARD: Board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

// Tile value → CSS classes (bg + text color using theme vars)
// We map tile values to a progression from subtle → accent
function tileClasses(val: number | null): string {
  if (!val) return "bg-surface-raised text-transparent border border-border-subtle";
  if (val === 2)    return "bg-surface-overlay text-text-secondary";
  if (val === 4)    return "bg-surface-overlay text-text-primary";
  if (val === 8)    return "bg-accent-primary text-surface-base";
  if (val === 16)   return "bg-accent-primary text-surface-base";
  if (val === 32)   return "bg-accent-primary text-surface-base opacity-90";
  if (val === 64)   return "bg-accent-primary text-surface-base opacity-80";
  if (val === 128)  return "bg-status-ok text-surface-base";
  if (val === 256)  return "bg-status-ok text-surface-base opacity-90";
  if (val === 512)  return "bg-status-ok text-surface-base opacity-80";
  if (val === 1024) return "bg-status-warn text-surface-base";
  if (val === 2048) return "bg-status-warn text-surface-base font-bold";
  return "bg-status-error text-surface-base";
}

function tileFontSize(val: number | null): string {
  if (!val) return "text-base";
  if (val < 100)  return "text-2xl font-bold";
  if (val < 1000) return "text-xl font-bold";
  return "text-base font-bold";
}

// ── Game Logic ──────────────────────────────────────────────────
function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function addRandomTile(board: Board): Board {
  const empty: [number, number][] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (!board[r][c]) empty.push([r, c]);
  if (!empty.length) return board;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const next = board.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function newGame(): GameState {
  let board = emptyBoard();
  board = addRandomTile(board);
  board = addRandomTile(board);
  return { board, score: 0, best: 0, over: false, won: false };
}

// Slide a single row left, return [newRow, points]
function slideRow(row: (number | null)[]): [(number | null)[], number] {
  const vals = row.filter(Boolean) as number[];
  let points = 0;
  const merged: (number | null)[] = [];
  let i = 0;
  while (i < vals.length) {
    if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
      const v = vals[i] * 2;
      merged.push(v);
      points += v;
      i += 2;
    } else {
      merged.push(vals[i]);
      i++;
    }
  }
  while (merged.length < SIZE) merged.push(null);
  return [merged, points];
}

type Direction = "left" | "right" | "up" | "down";

function moveBoard(board: Board, dir: Direction): [Board, number, boolean] {
  let next = board.map((r) => [...r]);
  let totalPoints = 0;
  let moved = false;

  const rotateLeft = (b: Board): Board =>
    b[0].map((_, c) => b.map((row) => row[c]).reverse());
  const rotateRight = (b: Board): Board =>
    b[0].map((_, c) => b.map((row) => row[SIZE - 1 - c]));

  // Normalise: always slide left, rotate in/out as needed
  if (dir === "right") next = rotateLeft(rotateLeft(next));
  if (dir === "up")    next = rotateRight(next);
  if (dir === "down")  next = rotateLeft(next);

  next = next.map((row) => {
    const [newRow, pts] = slideRow(row);
    if (newRow.some((v, i) => v !== row[i])) moved = true;
    totalPoints += pts;
    return newRow;
  });

  if (dir === "right") next = rotateLeft(rotateLeft(next));
  if (dir === "up")    next = rotateLeft(next);
  if (dir === "down")  next = rotateRight(next);

  return [next, totalPoints, moved];
}

function checkOver(board: Board): boolean {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (!board[r][c]) return false;
      if (c + 1 < SIZE && board[r][c] === board[r][c + 1]) return false;
      if (r + 1 < SIZE && board[r][c] === board[r + 1][c]) return false;
    }
  return true;
}

function checkWon(board: Board): boolean {
  return board.some((row) => row.some((v) => v === 2048));
}

// ── Component ───────────────────────────────────────────────────
export default function Widget({ moduleId }: WidgetProps) {
  const [game, setGame] = useState<GameState>(newGame);
  const [history, setHistory] = useState<GameState[]>([]);
  const [active, setActive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Persist helpers ────────────────────────────────────────────
  const saveState = useCallback((g: GameState, hist: GameState[]) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      const payload: SavedState = { ...g, history: hist };
      fetch(`${API_BASE}/api/modules/${moduleId}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 300);
  }, [moduleId]);

  // Load saved state on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/modules/${moduleId}/state`)
      .then((r) => r.json())
      .then((saved: Partial<SavedState>) => {
        if (saved?.board && saved.board.length === SIZE) {
          const { history: hist = [], ...g } = saved;
          setGame(g as GameState);
          setHistory(hist);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [moduleId]);

  // ── Keyboard handling ──────────────────────────────────────────
  useEffect(() => {
    if (!active) return;

    const DIR_MAP: Record<string, Direction> = {
      ArrowLeft: "left", ArrowRight: "right",
      ArrowUp: "up", ArrowDown: "down",
    };

    const onKey = (e: KeyboardEvent) => {
      const dir = DIR_MAP[e.key];
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation();

      setGame((prev) => {
        if (prev.over) return prev;
        const [nextBoard, pts, moved] = moveBoard(prev.board, dir);
        if (!moved) return prev;

        const withTile = addRandomTile(nextBoard);
        const won = checkWon(withTile);
        const over = checkOver(withTile);
        const newScore = prev.score + pts;
        const newBest = Math.max(prev.best, newScore);
        const next: GameState = { board: withTile, score: newScore, best: newBest, over, won };

        setHistory((h) => {
          const newHist = [...h, prev];
          saveState(next, newHist);
          return newHist;
        });
        return next;
      });
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [active, saveState]);

  // Deactivate when clicking outside
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setActive(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [active]);

  // ── Actions ────────────────────────────────────────────────────
  const handleNewGame = () => {
    const g = newGame();
    g.best = game.best;
    setGame(g);
    setHistory([]);
    saveState(g, []);
  };

  const handleUndo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    const newHist = history.slice(0, -1);
    setHistory(newHist);
    setGame(prev);
    saveState(prev, newHist);
  };

  const handleClick = () => {
    if (!active) setActive(true);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full animate-pulse">
        <div className="h-8 w-24 rounded bg-surface-raised" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full select-none cursor-pointer no-drag ${active ? "ring-1 ring-accent-primary ring-inset rounded-lg" : ""}`}
      onClick={handleClick}
    >
      {/* Score row */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
        <div className="flex gap-2">
          <ScorePill label="SCORE" value={game.score} />
          <ScorePill label="BEST" value={game.best} />
        </div>
        <div className="flex gap-1">
          <button
            className="text-xs px-2 py-1 rounded bg-surface-overlay text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors no-drag"
            onClick={(e) => { e.stopPropagation(); handleUndo(); }}
            disabled={!history.length}
            title="Undo"
          >
            ↩ {history.length > 0 ? history.length : ""}
          </button>
          <button
            className="text-xs px-2 py-1 rounded bg-surface-overlay text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors no-drag"
            onClick={(e) => { e.stopPropagation(); handleNewGame(); }}
            title="New game"
          >
            New
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 flex items-center justify-center px-2 pb-2 min-h-0">
        <div
          className="w-full aspect-square rounded-lg bg-surface-overlay p-1.5 grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, maxHeight: "100%", maxWidth: "100%" }}
        >
          {game.board.flat().map((val, i) => (
            <div
              key={i}
              className={`rounded flex items-center justify-center transition-all duration-100 ${tileClasses(val)} ${tileFontSize(val)}`}
            >
              {val ?? ""}
            </div>
          ))}
        </div>
      </div>

      {/* Overlays */}
      {!active && (
        <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none rounded-lg">
          <span className="text-[10px] text-text-muted font-body opacity-60">click to play</span>
        </div>
      )}

      {game.over && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-base bg-opacity-80 rounded-lg gap-2 no-drag">
          <span className="text-xl font-display font-bold text-text-primary">Game Over</span>
          <span className="text-sm text-text-muted">Score: {game.score}</span>
          <button
            className="mt-1 text-sm px-4 py-1.5 rounded bg-accent-primary text-surface-base hover:opacity-90 transition-opacity"
            onClick={(e) => { e.stopPropagation(); handleNewGame(); }}
          >
            Play Again
          </button>
        </div>
      )}

      {game.won && !game.over && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-base bg-opacity-80 rounded-lg gap-2 no-drag">
          <span className="text-xl font-display font-bold text-status-ok">You reached 2048!</span>
          <button
            className="text-sm px-4 py-1.5 rounded bg-accent-primary text-surface-base hover:opacity-90 transition-opacity"
            onClick={(e) => { e.stopPropagation(); setGame((g) => ({ ...g, won: false })); setActive(true); }}
          >
            Keep Going
          </button>
          <button
            className="text-sm px-3 py-1 rounded bg-surface-overlay text-text-muted hover:text-text-primary transition-colors"
            onClick={(e) => { e.stopPropagation(); handleNewGame(); }}
          >
            New Game
          </button>
        </div>
      )}
    </div>
  );
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center px-2 py-0.5 rounded bg-surface-overlay min-w-[48px]">
      <span className="text-[9px] font-mono text-text-muted leading-none">{label}</span>
      <span className="text-sm font-bold font-display text-text-primary tabular-nums">{value}</span>
    </div>
  );
}
