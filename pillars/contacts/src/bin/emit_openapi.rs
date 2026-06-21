//! Emit the committed OpenAPI document.
//!
//! Writes the pinned 3.0.3 spec to `openapi/contacts.openapi.json` (relative
//! to the crate root). CI runs this and `git diff --exit-code`s the result so
//! the committed document never drifts from the code — the Rust mirror of the
//! TS pillars' `generate-openapi.ts` drift gate.

use std::path::Path;

use contacts::openapi::openapi_30_json;

fn main() -> std::io::Result<()> {
    let json = openapi_30_json();
    let out = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("openapi")
        .join("contacts.openapi.json");
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&out, json)?;
    println!("wrote {}", out.display());
    Ok(())
}
