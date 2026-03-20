---
title: Flashcards
order: 12
---

# Flashcards

Noteriv includes a spaced repetition flashcard system built directly into your notes. Define question-and-answer pairs or cloze deletions in any Markdown file, and Noteriv will schedule them for review using the SM-2 algorithm. No separate app or export step required -- your flashcards live in the same files as the rest of your knowledge.

## Defining Flashcards

Flashcards are extracted from your note content using two syntaxes.

### Q:/A: Pairs

Write a question on a line starting with `Q:` and the answer on the immediately following line starting with `A:`:

```markdown
Q: What is the capital of France?
A: Paris

Q: What does HTTP stand for?
A: HyperText Transfer Protocol
```

Rules for Q:/A: pairs:

- The `Q:` and `A:` prefixes are case-insensitive (`q:`, `Q:`, `a:`, `A:` all work).
- The question and answer must be on consecutive lines -- no blank line between them.
- Everything after the prefix (trimmed) becomes the question or answer text.
- You can have multiple Q:/A: pairs in a single file, interspersed with regular content.

### Cloze Deletions

Wrap a word or phrase in double curly braces to create a cloze deletion:

```markdown
The mitochondria is the {{powerhouse}} of the cell.
```

When this card is shown during review:

- **Question:** "The mitochondria is the [...] of the cell."
- **Answer:** "powerhouse"

Noteriv replaces all `{{...}}` on the line with `[...]` to form the question, and uses the text inside the braces as the answer. Each `{{...}}` instance on a line creates a separate card.

Cloze deletions work well for factual recall embedded in prose. You can mix them freely with regular text:

```markdown
Rust was first released in {{2015}} and is maintained by {{Mozilla}}.
```

This produces two flashcards from a single line.

## Reviewing Flashcards

### Starting a Review

Open the flashcard review from the command palette (`Ctrl+Shift+P`, search for "Flashcard Review"). The review screen opens as a full-screen overlay.

### Scanning the Vault

When the review screen opens, Noteriv scans every `.md` and `.markdown` file in the vault for flashcard definitions. This happens in the background, and a loading message is shown while scanning. The scan typically completes in seconds, even for large vaults.

### Review Interface

The review interface shows one card at a time:

1. **Stats header.** Displays three numbers:
   - Total cards in the vault.
   - Cards due for review today.
   - Cards reviewed in this session.

2. **Question card.** A dark panel showing the question text, centered.

3. **Show Answer button.** Click it or press `Space`/`Enter` to reveal the answer.

4. **Answer card.** Appears below the question after revealing, showing the answer in green text.

5. **Grade buttons.** Five buttons for rating your recall:

   | Button | Grade | Keyboard | Effect |
   |---|---|---|---|
   | Again | 1 | `1` | Reset interval to 1 day, reset repetitions |
   | Hard | 2 | `2` | Reset interval to 1 day, reset repetitions |
   | OK | 3 | `3` | Correct but difficult; shorter interval |
   | Good | 4 | `4` | Correct with normal recall |
   | Easy | 5 | `5` | Very easy; increase ease factor and interval |

6. **Source link.** At the bottom, a small link shows which file the card came from. Click it to open that file and close the review.

7. **Progress bar.** A thin bar at the bottom shows how many of the due cards you have reviewed.

### Completion

When all due cards have been reviewed, the screen shows a "All caught up!" message with the number of cards reviewed and a note to come back tomorrow. If no flashcards exist in the vault at all, a message explains how to add them.

### Keyboard Navigation

| Key | Action |
|---|---|
| `Space` or `Enter` | Show the answer |
| `1` through `5` | Grade the card (only when answer is shown) |
| `Esc` | Close the review |

## The SM-2 Algorithm

Noteriv uses the SM-2 (SuperMemo 2) spaced repetition algorithm to schedule reviews. SM-2 is a well-established algorithm that adjusts the review interval based on how well you recall each card.

### How It Works

Each card tracks three values:

- **Ease factor** (starts at 2.5). A multiplier that determines how quickly intervals grow. Easier cards have higher ease factors.
- **Interval** (in days). The number of days until the next review.
- **Repetitions.** How many consecutive correct reviews the card has had.

When you grade a card:

- **Grade >= 3 (correct):**
  - First correct answer: interval = 1 day.
  - Second correct answer: interval = 6 days.
  - Subsequent: interval = previous interval * ease factor.
  - Ease factor adjusted: `ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)`.

- **Grade < 3 (incorrect):**
  - Repetitions reset to 0.
  - Interval reset to 1 day.

- Ease factor has a minimum floor of 1.3 to prevent intervals from shrinking too aggressively.

The next review date is calculated by adding the interval to today's date.

### Due Cards

A card is due for review if:

- It has never been reviewed (new card), or
- Today's date is on or after the card's next review date.

## Progress Storage

Review progress is saved in `.noteriv/flashcard-reviews.json` inside your vault:

```json
{
  "fc-a1b2c3": {
    "cardId": "fc-a1b2c3",
    "ease": 2.6,
    "interval": 6,
    "repetitions": 2,
    "nextReview": "2025-11-09",
    "lastReview": "2025-11-03"
  }
}
```

Each card has a unique ID generated from a hash of its question text and source file path. Progress is saved immediately after each grade, so closing the review mid-session does not lose data.

The `.noteriv/` directory is created automatically if it does not exist.

## Card Identification

Cards are identified by a hash of their question text combined with their source file path. This means:

- Moving a card to a different file creates a new card ID (review progress resets).
- Editing the question text creates a new card ID.
- Editing only the answer text does not change the ID.

Keep question text stable once you start reviewing to preserve your progress.

## Use Cases

### Language Learning

```markdown
Q: How do you say "hello" in Japanese?
A: Konnichiwa

Q: What is the German word for "library"?
A: Bibliothek
```

### Technical Study

```markdown
The time complexity of binary search is {{O(log n)}}.

Q: What is the difference between TCP and UDP?
A: TCP is connection-oriented with guaranteed delivery; UDP is connectionless with no delivery guarantee.
```

### Exam Preparation

```markdown
Q: What year was the Treaty of Westphalia signed?
A: 1648

The {{Krebs cycle}} produces {{2 ATP}} per glucose molecule.
```

## Tips

- **Embed flashcards in context.** Put Q:/A: pairs next to the relevant notes rather than in a separate file. This way the flashcard and the explanation live together.
- **Use cloze for facts, Q:/A: for concepts.** Cloze works best for single facts embedded in sentences. Q:/A: works better for questions that require explanatory answers.
- **Review daily.** Spaced repetition works best with consistent daily reviews. Even 5 minutes a day is effective.
- **Grade honestly.** The algorithm depends on accurate self-assessment. If you had to think hard, grade "OK" (3), not "Easy" (5).
- **Keep cards atomic.** Each card should test one piece of knowledge. "What are the three branches of government?" is too broad -- make three separate cards.
- **Add `.noteriv/` to `.gitignore`** if you do not want review progress synced across devices. Or leave it tracked if you do want cross-device consistency.
