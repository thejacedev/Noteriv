// MD5, for one purpose: an Evernote note points at its attachments by the
// MD5 of their bytes (`<en-media hash="...">`), so finding the attachment a
// note shows means hashing each one. Nothing here is used for security.

/// How far each of the 64 steps rotates, four values per round.
const SHIFTS: [[u32; 4]; 4] = [
    [7, 12, 17, 22],
    [5, 9, 14, 20],
    [4, 11, 16, 23],
    [6, 10, 15, 21],
];

/// The whole part of 2^32 times the sine of 1 to 64, as RFC 1321 defines.
const SINES: [u32; 64] = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

fn compress(state: &mut [u32; 4], block: &[u8]) {
    let mut words = [0u32; 16];
    for (word, bytes) in words.iter_mut().zip(block.chunks_exact(4)) {
        *word = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    }
    let [mut a, mut b, mut c, mut d] = *state;
    for step in 0..64 {
        let (mixed, word) = match step / 16 {
            0 => ((b & c) | (!b & d), step),
            1 => ((d & b) | (!d & c), (5 * step + 1) % 16),
            2 => (b ^ c ^ d, (3 * step + 5) % 16),
            _ => (c ^ (b | !d), (7 * step) % 16),
        };
        let sum = a
            .wrapping_add(mixed)
            .wrapping_add(SINES[step])
            .wrapping_add(words[word]);
        a = d;
        d = c;
        c = b;
        b = b.wrapping_add(sum.rotate_left(SHIFTS[step / 16][step % 4]));
    }
    for (total, value) in state.iter_mut().zip([a, b, c, d]) {
        *total = total.wrapping_add(value);
    }
}

/// The MD5 of `data` as 32 lower-case hex digits.
pub(crate) fn hex_digest(data: &[u8]) -> String {
    let mut state: [u32; 4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    let mut blocks = data.chunks_exact(64);
    for block in &mut blocks {
        compress(&mut state, block);
    }
    // The end: a single 1 bit, zeros, and the length in bits, filling one
    // block, or two when the length does not fit in what is left of the first.
    let rest = blocks.remainder();
    let mut tail = [0u8; 128];
    tail[..rest.len()].copy_from_slice(rest);
    tail[rest.len()] = 0x80;
    let tail_len = if rest.len() < 56 { 64 } else { 128 };
    let bits = (data.len() as u64).wrapping_mul(8);
    tail[tail_len - 8..tail_len].copy_from_slice(&bits.to_le_bytes());
    for block in tail[..tail_len].chunks_exact(64) {
        compress(&mut state, block);
    }
    state
        .iter()
        .flat_map(|word| word.to_le_bytes())
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::hex_digest;

    #[test]
    fn the_digests_match_the_published_ones() {
        // The test suite of RFC 1321.
        assert_eq!(hex_digest(b""), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(hex_digest(b"a"), "0cc175b9c0f1b6a831c399e269772661");
        assert_eq!(hex_digest(b"abc"), "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(
            hex_digest(b"message digest"),
            "f96b697d7cb7938d525a2f31aaf161d0"
        );
        assert_eq!(
            hex_digest(b"abcdefghijklmnopqrstuvwxyz"),
            "c3fcd3d76192e4007dfb496cca67e13b"
        );
        assert_eq!(
            hex_digest(b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"),
            "d174ab98d277d9f5a5611c2c9f419d9f"
        );
        assert_eq!(
            hex_digest(
                b"12345678901234567890123456789012345678901234567890123456789012345678901234567890"
            ),
            "57edf4a22be3c955ac49da2e2107b67a"
        );
    }

    #[test]
    fn every_length_around_a_block_edge_is_padded_right() {
        // Checked against `md5sum`: 55, 56, 63, 64 and 65 bytes of "x" are
        // where the padding changes shape.
        let digest = |length: usize| hex_digest(&vec![b'x'; length]);
        assert_eq!(digest(55), "04364420e25c512fd958a70738aa8f72");
        assert_eq!(digest(56), "668a72d5ba17f08e62dabcafad6db14b");
        assert_eq!(digest(63), "7dc2ca208106a2f703567bdff99d8981");
        assert_eq!(digest(64), "c1bb4f81d892b2d57947682aeb252456");
        assert_eq!(digest(65), "1bc932052302d074bdec39795fe00cf6");
        assert_eq!(digest(1_000_000), "ec78dbd963d2fc01e51176ed4dec299e");
    }
}
