//! Settings surface errors — the Rust mirror of TS `errors.ts`.

use std::fmt;

/// Raised when a write/reset addresses a key the pillar never declared in its
/// settings manifest. Keys are a fixed declared set (no create verb), so an
/// undeclared write is a client error — the mounting pillar maps this to a 400.
/// Carries the offending keys for the response body. Mirror of TS
/// `UnknownSettingKeyError`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnknownSettingKeyError {
    pub keys: Vec<String>,
}

impl UnknownSettingKeyError {
    /// Constructs the error from the offending keys.
    pub fn new(keys: Vec<String>) -> Self {
        Self { keys }
    }
}

impl fmt::Display for UnknownSettingKeyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown setting key(s): {}", self.keys.join(", "))
    }
}

impl std::error::Error for UnknownSettingKeyError {}
