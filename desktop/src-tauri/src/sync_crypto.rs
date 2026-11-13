//! Encryption for synced files.
//!
//! When a vault is synced with end-to-end encryption, every file is encrypted
//! on this machine before it leaves and decrypted after it comes back. The
//! server or the synced folder only ever holds encrypted contents.
//!
//! The key comes from a password. A small key file sits on the remote next to
//! the notes. It holds what is needed to turn the password into the key again
//! on another device (a random salt and the cost settings), and a short check
//! value that tells a right password from a wrong one without reading any
//! note. The key file holds nothing secret.
//!
//! What this does not hide or prevent:
//!
//! - File and folder names stay readable. Only contents are encrypted.
//! - File sizes stay visible. An encrypted file is 45 bytes longer than the
//!   original.
//! - A file is not tied to its name or to a point in time. Whoever controls
//!   the remote can put one encrypted file in the place of another, or bring
//!   back an older copy, and it will still decrypt. They cannot read a file
//!   or change what is inside one.
//! - There is no way to recover a forgotten password.
//!
//! The pieces are standard ones, used as their authors intend:
//!
//! - Argon2id (version 1.3) turns the password into a 32-byte key.
//! - XChaCha20-Poly1305 encrypts each file with a fresh random 24-byte nonce.
//!
//! An encrypted file is laid out as:
//!
//! ```text
//! "NRVE"   4 bytes   marks an encrypted file
//! version  1 byte    1
//! nonce    24 bytes  random, new for every encryption
//! data     n bytes   the encrypted contents
//! tag      16 bytes  proves the file is whole and the key is right
//! ```
//!
//! The first five bytes are covered by the tag as well, so they cannot be
//! changed without the file being refused.

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chacha20poly1305::aead::{Aead, Payload};
use chacha20poly1305::{AeadInOut, KeyInit, XChaCha20Poly1305, XNonce};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

// ============================================================
// Format
// ============================================================

/// The first bytes of every encrypted file.
const FILE_MAGIC: [u8; MAGIC_LEN] = *b"NRVE";
/// The first bytes of the check value inside a key file. It is different from
/// `FILE_MAGIC` so the check value can never be passed off as a note.
const CHECK_MAGIC: [u8; MAGIC_LEN] = *b"NRVK";
/// The only layout there is so far.
const FORMAT_VERSION: u8 = 1;

const MAGIC_LEN: usize = 4;
const HEADER_LEN: usize = MAGIC_LEN + 1;
const NONCE_LEN: usize = 24;
const TAG_LEN: usize = 16;
const KEY_LEN: usize = 32;
const SALT_LEN: usize = 16;

/// What the check value in a key file decrypts to.
const CHECK_TEXT: &[u8] = b"noteriv sync key check";

const KEY_FILE_VERSION: u32 = 1;
const KDF_NAME: &str = "argon2id";

// ============================================================
// Password cost
// ============================================================

// How much work it takes to turn a password into a key. A new key file gets
// these values: 64 MiB of memory, 3 passes, 1 lane. This is the lower-memory
// of the two settings RFC 9106 recommends, with one lane in place of four.
// The library used here works through lanes one after another, so more lanes
// would add no speed, and one lane is the easiest for another app to match.
//
// It takes about a tenth of a second in a release build on a fast desktop
// (around two seconds in a debug build) and happens once per unlock, not
// once per file. Each password guess costs an attacker the same 64 MiB and
// the same work.
const DEFAULT_MEMORY_KIB: u32 = 64 * 1024;
const DEFAULT_ITERATIONS: u32 = 3;
const DEFAULT_PARALLELISM: u32 = 1;

// The most a key file may ask for. A key file comes from the remote, so it
// could have been written by anyone. Without these limits one that asked for
// 4000 GiB of memory or four billion passes would hang or crash the app.
// The limits leave room for settings much stronger than the defaults. A key
// file that asks for all three at once keeps 1 GiB busy for some seconds
// (seven on the same desktop) and then fails the check. That is slow, but
// it ends.
//
// There is no lower limit beyond what Argon2 itself needs (at least 1 pass,
// 1 lane and 8 KiB per lane). A key file with weak settings is no use to an
// attacker: the check value in it only passes for someone who already knew
// the password when the file was made.
const MAX_MEMORY_KIB: u32 = 1024 * 1024;
const MAX_ITERATIONS: u32 = 10;
const MAX_PARALLELISM: u32 = 16;

/// Checks the cost settings and hands them to Argon2. Nothing is allocated
/// before this has passed.
fn kdf_params(memory_kib: u32, iterations: u32, parallelism: u32) -> Result<Params, CryptoError> {
    let allowed = (1..=MAX_PARALLELISM).contains(&parallelism)
        && (1..=MAX_ITERATIONS).contains(&iterations)
        && (8 * parallelism..=MAX_MEMORY_KIB).contains(&memory_kib);
    if !allowed {
        return Err(CryptoError::BadKeyFile);
    }
    Params::new(memory_kib, iterations, parallelism, Some(KEY_LEN))
        .map_err(|_| CryptoError::BadKeyFile)
}

// ============================================================
// Errors
// ============================================================

/// Why something could not be encrypted, decrypted or unlocked. The messages
/// are written to be shown to the user as they are.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum CryptoError {
    #[error("Enter an encryption password.")]
    EmptyPassword,
    #[error("Wrong encryption password.")]
    WrongPassword,
    /// The key file or the file was written in a layout this version does
    /// not know.
    #[error("This was encrypted by a newer version of Noteriv. Update Noteriv to read it.")]
    Unsupported,
    /// The key file cannot be read, or asks for more work than is allowed.
    #[error(
        "The encryption key file is damaged, or its settings are outside what Noteriv accepts."
    )]
    BadKeyFile,
    #[error("This file is not encrypted.")]
    NotEncrypted,
    #[error("This encrypted file is damaged or incomplete.")]
    Corrupt,
    #[error("This file could not be decrypted. It was encrypted with a different password, or it is damaged.")]
    WrongKeyOrCorrupt,
    #[error("This file is too large to encrypt.")]
    TooLarge,
    /// Argon2 could not run. In practice the memory it needs was not there.
    #[error("Could not prepare the encryption key. The computer may be low on memory.")]
    KeyFailed,
    #[error("The system could not supply random numbers, so nothing was encrypted.")]
    NoRandomness,
}

// ============================================================
// Key
// ============================================================

/// The key that encrypts and decrypts files. It only exists in memory, is
/// never written anywhere by this module, and is wiped when dropped.
pub struct Key([u8; KEY_LEN]);

impl Drop for Key {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

impl std::fmt::Debug for Key {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Key(hidden)")
    }
}

/// Turns a password into a key. The password is used byte for byte as given:
/// it is not trimmed and its Unicode form is not changed.
fn derive_key(password: &str, params: Params, salt: &[u8; SALT_LEN]) -> Result<Key, CryptoError> {
    let mut key = Key([0u8; KEY_LEN]);
    // The algorithm and its version are named here and not left to the
    // library's defaults, so a library update cannot change the key.
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, &mut key.0)
        .map_err(|_| CryptoError::KeyFailed)?;
    Ok(key)
}

// ============================================================
// Key file
// ============================================================

/// The small file that sits on the remote next to the notes. See the module
/// notes for what it is for. As JSON it looks like this:
///
/// ```text
/// {
///   "version": 1,
///   "kdf": "argon2id",
///   "memoryKib": 65536,
///   "iterations": 3,
///   "parallelism": 1,
///   "salt": "16 random bytes, base64",
///   "check": "67 bytes, base64"
/// }
/// ```
///
/// `check` is laid out like an encrypted file, except that it starts with
/// "NRVK". Decrypted with the right key it reads "noteriv sync key check".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyFile {
    version: u32,
    kdf: String,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    /// 16 random bytes, base64.
    salt: String,
    /// `CHECK_TEXT` encrypted with the key, base64.
    check: String,
}

/// A key file's contents after they have been checked and decoded.
struct KeyFileParts {
    params: Params,
    salt: [u8; SALT_LEN],
    check: Vec<u8>,
}

impl KeyFile {
    /// Makes a new key file for `password`, with a fresh random salt, and the
    /// key that goes with it.
    pub fn create(password: &str) -> Result<(KeyFile, Key), CryptoError> {
        Self::create_with(
            password,
            DEFAULT_MEMORY_KIB,
            DEFAULT_ITERATIONS,
            DEFAULT_PARALLELISM,
        )
    }

    /// `create` with the cost settings spelled out. Private, so the app
    /// always gets the defaults. The tests use it with cheap settings.
    fn create_with(
        password: &str,
        memory_kib: u32,
        iterations: u32,
        parallelism: u32,
    ) -> Result<(KeyFile, Key), CryptoError> {
        if password.is_empty() {
            return Err(CryptoError::EmptyPassword);
        }
        let params = kdf_params(memory_kib, iterations, parallelism)?;
        let mut salt = [0u8; SALT_LEN];
        fill_random(&mut salt)?;
        let key = derive_key(password, params, &salt)?;
        let check = seal(&key, &CHECK_MAGIC, CHECK_TEXT)?;
        let file = KeyFile {
            version: KEY_FILE_VERSION,
            kdf: KDF_NAME.to_string(),
            memory_kib,
            iterations,
            parallelism,
            salt: B64.encode(salt),
            check: B64.encode(check),
        };
        Ok((file, key))
    }

    /// Turns `password` into the key, using the salt and cost settings in
    /// this file, and makes sure it is the right one.
    pub fn unlock(&self, password: &str) -> Result<Key, CryptoError> {
        let parts = self.parts()?;
        if password.is_empty() {
            return Err(CryptoError::EmptyPassword);
        }
        let key = derive_key(password, parts.params, &parts.salt)?;
        match open(&key, &CHECK_MAGIC, &parts.check) {
            Ok(text) if text == CHECK_TEXT => Ok(key),
            // The wrong key and a tampered check value look the same from
            // here. A wrong password is by far the likelier of the two.
            Err(CryptoError::WrongKeyOrCorrupt) => Err(CryptoError::WrongPassword),
            _ => Err(CryptoError::BadKeyFile),
        }
    }

    /// The text to store on the remote.
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).expect("a key file is plain numbers and text")
    }

    /// Reads a key file. Everything `unlock` would refuse about the file is
    /// refused here already, so a bad file is caught before a password is
    /// asked for.
    pub fn from_json(json: &str) -> Result<KeyFile, CryptoError> {
        let value: serde_json::Value =
            serde_json::from_str(json).map_err(|_| CryptoError::BadKeyFile)?;
        // A later layout may not have the same fields, so the version and the
        // method are looked at before the rest is read. That way a newer file
        // is reported as newer and not as damaged.
        let version = value
            .get("version")
            .and_then(serde_json::Value::as_u64)
            .ok_or(CryptoError::BadKeyFile)?;
        let kdf = value.get("kdf").and_then(serde_json::Value::as_str);
        if version > u64::from(KEY_FILE_VERSION) || kdf.is_some_and(|name| name != KDF_NAME) {
            return Err(CryptoError::Unsupported);
        }
        let file: KeyFile = serde_json::from_value(value).map_err(|_| CryptoError::BadKeyFile)?;
        file.parts()?;
        Ok(file)
    }

    /// The one place a key file is checked. Used by both `from_json` and
    /// `unlock`, and cheap: it does not touch the password.
    fn parts(&self) -> Result<KeyFileParts, CryptoError> {
        if self.version > KEY_FILE_VERSION {
            return Err(CryptoError::Unsupported);
        }
        if self.version != KEY_FILE_VERSION {
            return Err(CryptoError::BadKeyFile);
        }
        if self.kdf != KDF_NAME {
            return Err(CryptoError::Unsupported);
        }
        let params = kdf_params(self.memory_kib, self.iterations, self.parallelism)?;
        let salt: [u8; SALT_LEN] = B64
            .decode(&self.salt)
            .ok()
            .and_then(|bytes| bytes.try_into().ok())
            .ok_or(CryptoError::BadKeyFile)?;
        let check = B64
            .decode(&self.check)
            .map_err(|_| CryptoError::BadKeyFile)?;
        if check.len() != HEADER_LEN + NONCE_LEN + CHECK_TEXT.len() + TAG_LEN {
            return Err(CryptoError::BadKeyFile);
        }
        Ok(KeyFileParts {
            params,
            salt,
            check,
        })
    }
}

// ============================================================
// Files
// ============================================================

/// Encrypts the contents of one file. Encrypting the same contents twice
/// gives two different results, because each gets its own random nonce.
pub fn encrypt(key: &Key, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    seal(key, &FILE_MAGIC, plaintext)
}

/// Decrypts what `encrypt` made. Nothing is returned unless the whole file
/// is exactly as it was written and the key is the one it was written with.
pub fn decrypt(key: &Key, data: &[u8]) -> Result<Vec<u8>, CryptoError> {
    open(key, &FILE_MAGIC, data)
}

/// Whether `data` starts the way an encrypted file does. `decrypt` answers
/// `NotEncrypted` exactly when this is false.
///
/// This only looks at the first four bytes. A plain note whose text begins
/// with "NRVE" also counts, and `decrypt` will then refuse it.
pub fn is_encrypted(data: &[u8]) -> bool {
    data.starts_with(&FILE_MAGIC)
}

fn cipher(key: &Key) -> XChaCha20Poly1305 {
    XChaCha20Poly1305::new((&key.0).into())
}

fn header(magic: &[u8; MAGIC_LEN]) -> [u8; HEADER_LEN] {
    let mut header = [FORMAT_VERSION; HEADER_LEN];
    header[..MAGIC_LEN].copy_from_slice(magic);
    header
}

fn fill_random(bytes: &mut [u8]) -> Result<(), CryptoError> {
    OsRng
        .try_fill_bytes(bytes)
        .map_err(|_| CryptoError::NoRandomness)
}

/// Encrypts `plaintext` into header, nonce, data and tag.
fn seal(key: &Key, magic: &[u8; MAGIC_LEN], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let header = header(magic);
    let mut nonce = [0u8; NONCE_LEN];
    fill_random(&mut nonce)?;

    let body = HEADER_LEN + NONCE_LEN;
    let mut out = Vec::with_capacity(body + plaintext.len() + TAG_LEN);
    out.extend_from_slice(&header);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(plaintext);
    // Encrypts the contents where they already sit in `out`, so a large file
    // is not copied a second time.
    let tag = cipher(key)
        .encrypt_inout_detached(&XNonce::from(nonce), &header, (&mut out[body..]).into())
        .map_err(|_| CryptoError::TooLarge)?;
    out.extend_from_slice(tag.as_slice());
    Ok(out)
}

/// Checks and decrypts what `seal` made with the same `magic`.
fn open(key: &Key, magic: &[u8; MAGIC_LEN], data: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if !data.starts_with(magic) {
        return Err(CryptoError::NotEncrypted);
    }
    // The version comes before the length check: a later layout may be
    // shorter than this one, and should be reported as newer, not as damaged.
    let version = *data.get(MAGIC_LEN).ok_or(CryptoError::Corrupt)?;
    if version > FORMAT_VERSION {
        return Err(CryptoError::Unsupported);
    }
    if version != FORMAT_VERSION || data.len() < HEADER_LEN + NONCE_LEN + TAG_LEN {
        return Err(CryptoError::Corrupt);
    }
    let (nonce, body) = data[HEADER_LEN..].split_at(NONCE_LEN);
    let nonce: [u8; NONCE_LEN] = nonce.try_into().map_err(|_| CryptoError::Corrupt)?;
    cipher(key)
        .decrypt(
            &XNonce::from(nonce),
            Payload {
                msg: body,
                aad: &header(magic),
            },
        )
        .map_err(|_| CryptoError::WrongKeyOrCorrupt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const PASSWORD: &str = "correct horse";
    const OVERHEAD: usize = HEADER_LEN + NONCE_LEN + TAG_LEN;

    /// A key file with cost settings cheap enough that the tests do not spend
    /// their time in Argon2. `real_default_settings` alone pays full price.
    fn cheap(password: &str) -> (KeyFile, Key) {
        KeyFile::create_with(password, 64, 1, 1).expect("a key file with cheap settings")
    }

    fn test_key() -> Key {
        Key([0x42; KEY_LEN])
    }

    /// A good key file with one thing changed.
    fn edited(edit: impl FnOnce(&mut KeyFile)) -> KeyFile {
        let (mut file, _) = cheap(PASSWORD);
        edit(&mut file);
        file
    }

    fn unlock_error(file: &KeyFile) -> CryptoError {
        file.unlock(PASSWORD).expect_err("it does not unlock")
    }

    /// A good key file as JSON, for a test to change.
    fn good_json() -> serde_json::Value {
        serde_json::to_value(cheap(PASSWORD).0).unwrap()
    }

    fn json_with(field: &str, value: serde_json::Value) -> String {
        let mut json = good_json();
        json[field] = value;
        json.to_string()
    }

    fn read_error(json: &str) -> CryptoError {
        KeyFile::from_json(json).expect_err("it is refused")
    }

    // ---------- files ----------

    #[test]
    fn round_trip() {
        let key = test_key();
        let megabyte: Vec<u8> = (0..1024 * 1024).map(|i| (i % 251) as u8).collect();
        let cases: [&[u8]; 5] = [
            b"",
            b"x",
            "# A note\n\nWith text, and an em dash \u{2014} too.\n".as_bytes(),
            &[0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28, 0x00, 0xff],
            &megabyte,
        ];
        for plaintext in cases {
            let data = encrypt(&key, plaintext).expect("it encrypts");
            assert_eq!(data.len(), plaintext.len() + OVERHEAD);
            assert_eq!(&data[..HEADER_LEN], b"NRVE\x01");
            assert!(is_encrypted(&data));
            assert_eq!(decrypt(&key, &data).expect("it decrypts"), plaintext);
        }
    }

    #[test]
    fn the_contents_are_not_left_readable() {
        let plaintext = b"a line of text that must not show up in the encrypted file";
        let data = encrypt(&test_key(), plaintext).unwrap();
        let shows = |part: &[u8]| data.windows(part.len()).any(|window| window == part);
        assert!(!plaintext.windows(8).any(shows));
    }

    #[test]
    fn the_same_contents_encrypt_differently_each_time() {
        let key = test_key();
        let a = encrypt(&key, b"same").unwrap();
        let b = encrypt(&key, b"same").unwrap();
        // The nonce differs, and so does everything after it.
        let body = HEADER_LEN + NONCE_LEN;
        assert_ne!(a[HEADER_LEN..body], b[HEADER_LEN..body]);
        assert_ne!(a[body..], b[body..]);
        assert_eq!(decrypt(&key, &a).unwrap(), b"same");
        assert_eq!(decrypt(&key, &b).unwrap(), b"same");
    }

    #[test]
    fn any_changed_bit_is_refused() {
        let key = test_key();
        let data = encrypt(&key, b"a short note").unwrap();
        for index in 0..data.len() {
            for bit in 0..8 {
                let mut changed = data.clone();
                changed[index] ^= 1 << bit;
                let want = if index < MAGIC_LEN {
                    CryptoError::NotEncrypted
                } else if index == MAGIC_LEN && bit == 0 {
                    // Version 1 became version 0, which never existed.
                    CryptoError::Corrupt
                } else if index == MAGIC_LEN {
                    CryptoError::Unsupported
                } else {
                    // Nonce, contents or tag.
                    CryptoError::WrongKeyOrCorrupt
                };
                assert_eq!(
                    decrypt(&key, &changed),
                    Err(want),
                    "byte {index}, bit {bit}"
                );
            }
        }
    }

    #[test]
    fn the_header_is_covered_by_the_tag() {
        // The check above cannot show this, because a changed header is
        // refused before the tag is looked at. Here the header is swapped for
        // another one that is accepted: a check value from a key file is
        // given a note's header, and must not decrypt as a note.
        let key = test_key();
        let mut check = seal(&key, &CHECK_MAGIC, b"inside").unwrap();
        assert_eq!(decrypt(&key, &check), Err(CryptoError::NotEncrypted));
        check[..MAGIC_LEN].copy_from_slice(&FILE_MAGIC);
        assert_eq!(decrypt(&key, &check), Err(CryptoError::WrongKeyOrCorrupt));
    }

    #[test]
    fn every_truncation_is_refused() {
        let key = test_key();
        let data = encrypt(&key, b"a short note").unwrap();
        for len in 0..data.len() {
            let want = if len < MAGIC_LEN {
                CryptoError::NotEncrypted
            } else if len < OVERHEAD {
                CryptoError::Corrupt
            } else {
                CryptoError::WrongKeyOrCorrupt
            };
            assert_eq!(decrypt(&key, &data[..len]), Err(want), "cut to {len} bytes");
        }
        // A file with nothing in it is all overhead. One byte less is too short.
        let empty = encrypt(&key, b"").unwrap();
        assert_eq!(empty.len(), OVERHEAD);
        assert_eq!(
            decrypt(&key, &empty[..OVERHEAD - 1]),
            Err(CryptoError::Corrupt)
        );
        // Bytes added to the end are not ignored either.
        let longer = [data.as_slice(), b"\0"].concat();
        assert_eq!(decrypt(&key, &longer), Err(CryptoError::WrongKeyOrCorrupt));
    }

    #[test]
    fn versions_other_than_this_one() {
        let key = test_key();
        let mut data = encrypt(&key, b"note").unwrap();
        data[MAGIC_LEN] = 2;
        assert_eq!(decrypt(&key, &data), Err(CryptoError::Unsupported));
        // A newer layout is reported as newer however short it is.
        assert_eq!(decrypt(&key, b"NRVE\x02"), Err(CryptoError::Unsupported));
        assert_eq!(
            decrypt(&key, b"NRVE\xff more"),
            Err(CryptoError::Unsupported)
        );
        // Version 0 never existed.
        data[MAGIC_LEN] = 0;
        assert_eq!(decrypt(&key, &data), Err(CryptoError::Corrupt));
    }

    #[test]
    fn plain_files_are_told_apart() {
        let key = test_key();
        let plain: [&[u8]; 6] = [b"", b"N", b"NRV", b"# Title\n", b"nrve\x01", b"\0NRVE"];
        for data in plain {
            assert!(!is_encrypted(data));
            assert_eq!(decrypt(&key, data), Err(CryptoError::NotEncrypted));
        }
        // Anything that starts with the four bytes counts as encrypted, a
        // plain note that happens to begin with them included. `decrypt`
        // then refuses it for another reason.
        let marked: [&[u8]; 4] = [b"NRVE", b"NRVE\x01", b"NRVE\x01short", b"NRVE is my topic"];
        for data in marked {
            assert!(is_encrypted(data));
            let error = decrypt(&key, data).expect_err("it is not a whole file");
            assert_ne!(error, CryptoError::NotEncrypted);
        }
    }

    #[test]
    fn contents_that_start_with_the_marker_round_trip() {
        let key = test_key();
        let note = b"NRVE\x01 looks encrypted but is a note";
        let once = encrypt(&key, note).unwrap();
        assert_eq!(decrypt(&key, &once).unwrap(), note);
        // An encrypted file can itself be encrypted again and comes back whole.
        let twice = encrypt(&key, &once).unwrap();
        assert_eq!(decrypt(&key, &twice).unwrap(), once);
    }

    #[test]
    fn only_the_key_that_encrypted_decrypts() {
        let (file, key) = cheap(PASSWORD);
        let data = encrypt(&key, b"private").unwrap();
        assert_eq!(decrypt(&key, &data).unwrap(), b"private");

        let (_, other_password) = cheap("battery staple");
        assert_eq!(
            decrypt(&other_password, &data),
            Err(CryptoError::WrongKeyOrCorrupt)
        );

        // The same password in another key file is another key, because
        // every key file has its own salt.
        let (other_file, same_password) = cheap(PASSWORD);
        assert_ne!(file.salt, other_file.salt);
        assert_ne!(key.0, same_password.0);
        assert_eq!(
            decrypt(&same_password, &data),
            Err(CryptoError::WrongKeyOrCorrupt)
        );
    }

    // ---------- key ----------

    #[test]
    fn a_key_does_not_print_itself() {
        let key = Key([0xab; KEY_LEN]);
        assert_eq!(format!("{key:?}"), "Key(hidden)");
        assert_eq!(format!("{key:#?}"), "Key(hidden)");
    }

    #[test]
    fn a_key_is_wiped_when_dropped() {
        let mut slot = std::mem::MaybeUninit::new(Key([0xab; KEY_LEN]));
        // SAFETY: `slot` holds a `Key`, which is dropped here exactly once.
        // `MaybeUninit` never drops it again, and the memory stays ours to
        // read afterwards: it is a plain array of bytes on this stack frame.
        let after = unsafe {
            std::ptr::drop_in_place(slot.as_mut_ptr());
            std::ptr::addr_of!((*slot.as_ptr()).0).read()
        };
        assert_eq!(after, [0u8; KEY_LEN]);
    }

    // ---------- key file ----------

    #[test]
    fn unlock_with_the_right_and_the_wrong_password() {
        let (file, key) = cheap(PASSWORD);
        let data = encrypt(&key, b"private").unwrap();

        let again = file.unlock(PASSWORD).expect("the right password");
        assert_eq!(again.0, key.0);
        assert_eq!(decrypt(&again, &data).unwrap(), b"private");

        // Close is not good enough. The password is not trimmed either.
        for wrong in [
            "correct hors",
            "correct horse ",
            " correct horse",
            "Correct horse",
            "x",
        ] {
            let error = file.unlock(wrong).expect_err("a wrong password");
            assert_eq!(error, CryptoError::WrongPassword, "{wrong:?}");
        }
    }

    #[test]
    fn the_password_is_used_as_typed() {
        // These two spell the same word with different Unicode characters,
        // and are different passwords.
        let (file, _) = cheap("caf\u{e9}");
        assert!(file.unlock("caf\u{e9}").is_ok());
        let error = file.unlock("cafe\u{301}").expect_err("another spelling");
        assert_eq!(error, CryptoError::WrongPassword);
    }

    #[test]
    fn an_empty_password_is_refused() {
        assert_eq!(KeyFile::create("").unwrap_err(), CryptoError::EmptyPassword);
        let (file, _) = cheap(PASSWORD);
        assert_eq!(file.unlock("").unwrap_err(), CryptoError::EmptyPassword);
    }

    #[test]
    fn real_default_settings() {
        // The only test that runs Argon2 at full cost: once to create and
        // once to unlock.
        let (file, key) = KeyFile::create(PASSWORD).expect("a key file");
        assert_eq!(file.version, 1);
        assert_eq!(file.kdf, "argon2id");
        assert_eq!(file.memory_kib, 64 * 1024);
        assert_eq!(file.iterations, 3);
        assert_eq!(file.parallelism, 1);
        assert_eq!(B64.decode(&file.salt).unwrap().len(), 16);

        let read = KeyFile::from_json(&file.to_json()).expect("it reads back");
        let again = read.unlock(PASSWORD).expect("the right password");
        assert_eq!(again.0, key.0);
    }

    #[test]
    fn key_file_json_round_trip() {
        let (file, key) = cheap(PASSWORD);
        let json = file.to_json();
        assert_eq!(KeyFile::from_json(&json).expect("it reads back"), file);
        // The key is not in it.
        assert!(!json.contains(&B64.encode(key.0)));
        // A field this version does not know is left alone.
        assert!(KeyFile::from_json(&json_with("added", json!("later"))).is_ok());
    }

    // A key file and a note written out once by this module and kept. The
    // password is "correct horse". Both were also decrypted with OpenSSL's
    // Argon2id and ChaCha20-Poly1305, with no code from here, so another app
    // that follows the layout in the module notes can read them.
    const FROZEN_KEY_FILE: &str = r#"{
  "version": 1,
  "kdf": "argon2id",
  "memoryKib": 64,
  "iterations": 1,
  "parallelism": 1,
  "salt": "PpL49jak7EAtBfTWC/aR9Q==",
  "check": "TlJWSwHokLmIZ4qZuuH+h1u/pJD7Qi0518kUCQrUwm9G9SfO/X6akIyIIrGs9EUWboQhgQz6htGgi9+vzBmpCylTZg=="
}"#;
    const FROZEN_NOTE: &str = "TlJWRQG0XhJOzsrDkm4PKvVVoC4yiuEieTjgHEaB9LN4icSHlOlbqzaGoAToreFcacsyXk/hbGUc0gAUOrz0KsiEvS6UbO9J4amstDdJSI8vECR33p5e3i+au6peVQ==";

    #[test]
    fn a_key_file_and_note_from_before_still_open() {
        // If the layout, the names in the key file or a library underneath
        // ever changes what is written or read, this fails.
        let file = KeyFile::from_json(FROZEN_KEY_FILE).expect("it reads");
        assert_eq!(file.to_json(), FROZEN_KEY_FILE);
        let key = file.unlock(PASSWORD).expect("the right password");
        let note = decrypt(&key, &B64.decode(FROZEN_NOTE).unwrap()).expect("it decrypts");
        assert_eq!(
            note,
            b"# Frozen\n\nThis note was encrypted once and kept.\n"
        );
        assert_eq!(
            file.unlock("correct hors").unwrap_err(),
            CryptoError::WrongPassword
        );
    }

    #[test]
    fn a_newer_or_unknown_key_file_is_reported_as_such() {
        assert_eq!(
            read_error(&json_with("version", json!(2))),
            CryptoError::Unsupported
        );
        assert_eq!(
            read_error(&json_with("kdf", json!("scrypt"))),
            CryptoError::Unsupported
        );
        assert_eq!(
            read_error(&json_with("kdf", json!("Argon2id"))),
            CryptoError::Unsupported
        );
        // A newer file, or one made another way, need not have these fields.
        for json in [
            r#"{"version":2,"wrapping":{"method":"something new"}}"#,
            r#"{"version":1,"kdf":"scrypt","logN":15,"r":8,"p":1,"salt":"","check":""}"#,
        ] {
            assert_eq!(read_error(json), CryptoError::Unsupported, "{json}");
        }
        // `unlock` checks for itself and does not rely on `from_json`.
        assert_eq!(
            unlock_error(&edited(|f| f.version = 2)),
            CryptoError::Unsupported
        );
        assert_eq!(
            unlock_error(&edited(|f| f.kdf = "scrypt".into())),
            CryptoError::Unsupported
        );
    }

    #[test]
    fn a_hostile_or_broken_key_file_is_refused() {
        for json in ["", "not json", "[1, 2, 3]", "1", "{}", r#"{"version":1"#] {
            assert_eq!(read_error(json), CryptoError::BadKeyFile, "{json:?}");
        }
        for field in [
            "version",
            "kdf",
            "memoryKib",
            "iterations",
            "parallelism",
            "salt",
            "check",
        ] {
            let mut json = good_json();
            json.as_object_mut().unwrap().remove(field);
            assert_eq!(
                read_error(&json.to_string()),
                CryptoError::BadKeyFile,
                "no {field}"
            );
        }
        let bad = [
            ("version", json!(0)),
            ("version", json!("1")),
            ("version", json!(-1)),
            ("kdf", json!(7)),
            // More memory than is allowed, more than the field can hold, and
            // less than Argon2 can work with.
            ("memoryKib", json!(MAX_MEMORY_KIB + 1)),
            ("memoryKib", json!(u32::MAX)),
            ("memoryKib", json!(4_000_000_000_000u64)),
            ("memoryKib", json!(0)),
            ("memoryKib", json!(7)),
            ("memoryKib", json!(-65536)),
            ("memoryKib", json!(64.5)),
            ("iterations", json!(0)),
            ("iterations", json!(MAX_ITERATIONS + 1)),
            ("iterations", json!(u32::MAX)),
            ("parallelism", json!(0)),
            ("parallelism", json!(MAX_PARALLELISM + 1)),
            ("parallelism", json!(u32::MAX)),
            // Not base64, and base64 of the wrong number of bytes.
            ("salt", json!("not base64!!")),
            ("salt", json!("")),
            ("salt", json!(B64.encode([1u8; 15]))),
            ("salt", json!(B64.encode([1u8; 17]))),
            ("salt", json!(16)),
            ("check", json!("***")),
            ("check", json!("")),
            ("check", json!(B64.encode([1u8; 20]))),
            ("check", json!(B64.encode([1u8; 200]))),
        ];
        for (field, value) in bad {
            let error = read_error(&json_with(field, value.clone()));
            assert_eq!(error, CryptoError::BadKeyFile, "{field}: {value}");
        }
    }

    #[test]
    fn the_limits_sit_where_they_say() {
        // Only the settings are checked here. Nothing this large is run.
        assert!(kdf_params(MAX_MEMORY_KIB, MAX_ITERATIONS, MAX_PARALLELISM).is_ok());
        assert!(kdf_params(MAX_MEMORY_KIB + 1, 1, 1).is_err());
        assert!(kdf_params(1024, MAX_ITERATIONS + 1, 1).is_err());
        assert!(kdf_params(1024, 1, MAX_PARALLELISM + 1).is_err());
        assert!(kdf_params(1024, 0, 1).is_err());
        assert!(kdf_params(1024, 1, 0).is_err());
        assert!(kdf_params(u32::MAX, u32::MAX, u32::MAX).is_err());
        // Argon2 needs 8 KiB for every lane.
        assert!(kdf_params(8, 1, 1).is_ok());
        assert!(kdf_params(7, 1, 1).is_err());
        assert!(kdf_params(32, 1, 4).is_ok());
        assert!(kdf_params(31, 1, 4).is_err());
        // The defaults are inside the limits.
        assert!(kdf_params(DEFAULT_MEMORY_KIB, DEFAULT_ITERATIONS, DEFAULT_PARALLELISM).is_ok());
        // A new key file cannot be made outside them either.
        let error = KeyFile::create_with(PASSWORD, MAX_MEMORY_KIB + 1, 1, 1).unwrap_err();
        assert_eq!(error, CryptoError::BadKeyFile);
    }

    #[test]
    fn unlock_refuses_a_hostile_key_file_before_doing_any_work() {
        // Built by hand, so `from_json` has not looked at them first. Without
        // the limits these would ask for gigabytes or run for hours.
        let hostile = [
            edited(|f| f.memory_kib = u32::MAX),
            edited(|f| f.memory_kib = MAX_MEMORY_KIB + 1),
            edited(|f| f.memory_kib = 0),
            edited(|f| f.iterations = u32::MAX),
            edited(|f| f.iterations = 0),
            edited(|f| f.parallelism = u32::MAX),
            edited(|f| f.parallelism = 0),
            edited(|f| f.version = 0),
            edited(|f| f.salt = "not base64!!".into()),
            edited(|f| f.salt = B64.encode([1u8; 8])),
            edited(|f| f.salt = B64.encode([1u8; 32])),
            edited(|f| f.check = "***".into()),
            edited(|f| f.check.clear()),
        ];
        for file in &hostile {
            assert_eq!(unlock_error(file), CryptoError::BadKeyFile, "{file:?}");
        }
    }

    #[test]
    fn a_tampered_key_file_does_not_unlock() {
        // Another salt or another cost gives another key, so the check fails
        // the same way a wrong password does.
        let other_salt = edited(|f| f.salt = B64.encode([9u8; SALT_LEN]));
        assert_eq!(unlock_error(&other_salt), CryptoError::WrongPassword);
        let other_cost = edited(|f| f.iterations += 1);
        assert_eq!(unlock_error(&other_cost), CryptoError::WrongPassword);

        // A check value with one bit changed.
        let one_bit = edited(|f| {
            let mut check = B64.decode(&f.check).unwrap();
            *check.last_mut().unwrap() ^= 1;
            f.check = B64.encode(check);
        });
        assert_eq!(unlock_error(&one_bit), CryptoError::WrongPassword);

        // Something of the right size that is not a check value at all.
        let (file, key) = cheap(PASSWORD);
        let size = B64.decode(&file.check).unwrap().len();
        let noise = KeyFile {
            check: B64.encode(vec![7u8; size]),
            ..file.clone()
        };
        assert_eq!(unlock_error(&noise), CryptoError::BadKeyFile);

        // A note is not a check value, even one of the right size encrypted
        // with the right key.
        let note = encrypt(&key, CHECK_TEXT).unwrap();
        assert_eq!(note.len(), size);
        let swapped = KeyFile {
            check: B64.encode(note),
            ..file
        };
        assert_eq!(unlock_error(&swapped), CryptoError::BadKeyFile);
    }
}
