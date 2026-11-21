// One clock for the stand-in file system and the stand-in servers, so a test
// decides which side of a sync has the newer file. Every write takes a later
// millisecond than the one before it.
export const clock = {
  now: 1_795_000_000_000,
  /** The time for the next write. */
  tick() {
    this.now += 1;
    return this.now;
  },
  /** Let time pass. */
  advance(ms) {
    this.now += ms;
  },
  reset() {
    this.now = 1_795_000_000_000;
  },
};
