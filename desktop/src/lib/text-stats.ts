/**
 * Counting words the way a reader would: runs of letters and digits, with
 * each Chinese, Japanese or Korean character counted as a word of its own,
 * since those scripts do not put spaces between words.
 */

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/u;
const LETTER = /[\p{L}\p{N}]/u;
// Joins the letters around it into one word ("well-known", "isn't"), but a
// dash or underscore on its own, such as a list marker, is not a word.
const JOINER = /['’_-]/;

export function countWords(text: string): number {
  let words = 0;
  let inWord = false;
  for (const ch of text) {
    if (CJK.test(ch)) {
      words++;
      inWord = false;
    } else if (LETTER.test(ch)) {
      if (!inWord) words++;
      inWord = true;
    } else if (!(inWord && JOINER.test(ch))) {
      inWord = false;
    }
  }
  return words;
}

/** "1 word", "2 words": the status bar's wording. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
