---
title: Swipe Navigation
order: 4
---

# Swipe Navigation

Swipe navigation lets you move between notes in the same folder by swiping left and right on the editor screen. It is one of the most natural ways to browse through a collection of related notes on a phone, and it works in both the editor and the preview.

## How It Works

When you open a note, the app determines all sibling notes in the same folder. These are all `.md` and `.markdown` files in the directory that contains the current note, sorted in the same order as the file browser (alphabetical by default).

- **Swipe right** to go to the previous note in the list.
- **Swipe left** to go to the next note in the list.

The swipe gesture requires a minimum horizontal translation of 80 pixels and a minimum velocity of 300 pixels per second. This threshold prevents accidental navigation when you are scrolling vertically or tapping the screen. The gesture also has a vertical fail offset of 10 pixels, meaning that if your finger moves more than 10 pixels vertically, the swipe is cancelled and treated as a scroll instead.

## Stats Bar

When swipe navigation is active, a position indicator appears in the status area at the bottom of the editor screen. It shows your current position within the folder:

```
3/12  <-- swipe -->
```

This tells you that you are viewing the 3rd note out of 12 in the current folder, with arrows indicating that swiping is available in both directions. If you are on the first note, only the right arrow appears. If you are on the last note, only the left arrow appears.

## Auto-Save Before Switching

Before navigating to the next or previous note, the app checks whether the current note has unsaved changes. If it does, the changes are automatically saved to disk before the navigation occurs. This means you never lose work when swiping between notes, even if you were mid-edit.

The save is synchronous and completes before the navigation begins, so there is no risk of a race condition between saving and loading the new note.

## Gesture Details

The swipe gesture is implemented using React Native Gesture Handler's `Pan` gesture recognizer with the following configuration:

- **Active offset X**: [-30, 30] -- The gesture becomes active after 30 pixels of horizontal movement.
- **Fail offset Y**: [-10, 10] -- The gesture fails (and defers to vertical scrolling) if vertical movement exceeds 10 pixels.
- **Minimum velocity**: 300 px/s -- Slow, deliberate drags do not trigger navigation.
- **Minimum translation**: 80 px -- Short swipes are ignored.

These thresholds are tuned to avoid conflicts with vertical scrolling in the editor and preview. You can swipe quickly and confidently without worrying about accidental navigation.

## Which Notes Are Included

The swipe list includes all markdown files (`.md` and `.markdown`) in the current note's folder. It does not recurse into subfolders. Directories and non-markdown files are excluded.

The list is computed once when the editor screen loads and is based on the current file list from the app context. If you create or delete a note in the current folder while editing, the list updates on the next navigation.

## Interaction with Board View

If the current note has `board: true` in its frontmatter and is displayed as a Kanban board, swipe navigation is still available. Swiping on the board view navigates to the adjacent note, just as it does in the editor. The board view itself does not use horizontal swipe gestures, so there is no conflict.

## Interaction with Focus Mode

Focus mode works normally during swipe navigation. If you have focus mode enabled, it remains enabled when you swipe to the next note. The focus mode state is global and does not reset when changing notes.

## Keyboard Navigation

On devices with a physical keyboard (such as tablets with a keyboard case), you can also navigate between notes using keyboard shortcuts. However, swipe navigation is the primary method on phones where touch is the dominant input.

## Tips

- **Quick review**: Open the first note in a folder and swipe through them all to quickly review a collection of notes.
- **Daily notes**: Navigate to your `Daily/` folder and swipe through recent daily notes to review your journal entries.
- **Study notes**: Put study materials in a folder and swipe through them like flashcards for a lightweight review session.
- **Meeting notes**: Keep meeting notes in a folder organized by date and swipe through them to find a specific discussion.

## Disabling Swipe Navigation

Swipe navigation is always active when there are sibling notes in the current folder. If a folder contains only one markdown file, the swipe gesture has no effect and no position indicator is shown.

There is no setting to disable swipe navigation globally. The gesture thresholds are high enough that accidental triggers are rare, and the auto-save behavior ensures that no work is lost even if a swipe occurs unexpectedly.

## Sort Order

The order of notes in the swipe list matches the file browser's current sort mode. By default, notes are sorted alphabetically (A-Z). If you switch the file browser to reverse alphabetical (Z-A), the swipe order changes accordingly.

To put notes in a specific swipe order, prefix filenames with numbers:

```
01-introduction.md
02-background.md
03-methodology.md
04-results.md
05-conclusion.md
```

This ensures a predictable reading order regardless of sort mode.

## How Navigation Is Performed

When a swipe is detected, the app performs the following steps in order:

1. **Check for dirty state**: If the current note has unsaved changes, save them to disk.
2. **Clear the current file**: The current file reference is set to `null` to prevent stale content from flashing on screen.
3. **Replace the route**: The Expo Router `replace` function is called with the new note's path. This replaces the current editor screen in the navigation stack rather than pushing a new one, so the back button still returns to the file browser.
4. **Load the new note**: The editor screen's `useEffect` hook detects the new path and loads the file content.

The `replace` navigation method is important. If `push` were used instead, each swipe would add a new entry to the navigation stack, and the user would have to press back multiple times to return to the file browser.

## Performance

Swipe navigation is designed to be fast. The sibling note list is computed using `useMemo` and only recalculates when the file list changes. The current index lookup is also memoized. The gesture handler runs on the JavaScript thread (via `runOnJS(true)`) to ensure it can safely call async save operations before navigation.

For vaults with many files in a single folder (hundreds of notes), the sibling list computation is still fast because it only filters the flat file list for markdown extensions. No file I/O is performed during the swipe gesture itself.

## Relationship to the File Browser

The file browser and swipe navigation share the same file list from `AppContext`. When you navigate into a subfolder in the file browser, the files shown are the files available for swiping. If you open a note from search results or a wiki-link, the swipe list is based on the file browser's current directory, not the target note's directory.
