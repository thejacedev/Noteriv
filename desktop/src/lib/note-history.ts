/** Types and utilities for note version history via git */

export interface HistoryEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
}

/**
 * Get the git commit history for a specific file.
 * Calls git log --follow via electronAPI.
 */
export async function getFileHistory(
  vaultPath: string,
  filePath: string
): Promise<HistoryEntry[]> {
  if (!window.electronAPI?.gitFileLog) return [];
  try {
    const entries = await window.electronAPI.gitFileLog(vaultPath, filePath);
    return entries || [];
  } catch {
    return [];
  }
}

/**
 * Get the content of a file at a specific git commit.
 */
export async function getFileAtCommit(
  vaultPath: string,
  filePath: string,
  commitHash: string
): Promise<string | null> {
  if (!window.electronAPI?.gitShowFile) return null;
  try {
    return await window.electronAPI.gitShowFile(vaultPath, filePath, commitHash);
  } catch {
    return null;
  }
}

/**
 * Simple line-based diff between two strings.
 * Returns an array of DiffLine objects.
 */
export function diffStrings(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "same", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "add", text: newLines[j - 1] });
      j--;
    } else {
      stack.push({ type: "remove", text: oldLines[i - 1] });
      i--;
    }
  }

  // Reverse since we built it backwards
  for (let k = stack.length - 1; k >= 0; k--) {
    result.push(stack[k]);
  }

  return result;
}
