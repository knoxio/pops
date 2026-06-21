//! RFC 3339 / ISO 8601 UTC timestamp formatting, byte-for-byte matching the
//! TS pillars' `new Date().toISOString()` (millisecond precision, `Z` offset).
//!
//! Implemented against `std` via Howard Hinnant's civil-from-days algorithm so
//! the reference pillar carries no chrono/time dependency just to stamp a
//! timestamp. Shared by `/health` and the entities `last_edited_time` bump so
//! every stored/served instant has the identical shape.

use std::time::{SystemTime, UNIX_EPOCH};

/// Current UTC time as an RFC 3339 / ISO 8601 string with millisecond
/// precision and a `Z` offset, e.g. `2026-06-21T09:24:33.482Z`.
pub fn now_rfc3339() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format_rfc3339_millis(now.as_secs() as i64, now.subsec_millis())
}

/// Format `unix_secs` (seconds since the Unix epoch, UTC) plus `millis` as an
/// RFC 3339 UTC string. Split out from [`now_rfc3339`] so it is
/// deterministically testable.
pub fn format_rfc3339_millis(unix_secs: i64, millis: u32) -> String {
    let days = unix_secs.div_euclid(86_400);
    let secs_of_day = unix_secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

/// Convert a count of days since the Unix epoch (1970-01-01) to a proleptic
/// Gregorian `(year, month, day)`. Howard Hinnant's `civil_from_days`
/// algorithm — exact for the full range of representable dates.
fn civil_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_known_instants_as_iso8601_utc() {
        assert_eq!(
            format_rfc3339_millis(1_782_466_473, 482),
            "2026-06-26T09:34:33.482Z"
        );
        assert_eq!(
            format_rfc3339_millis(1_750_000_000, 0),
            "2025-06-15T15:06:40.000Z"
        );
    }

    #[test]
    fn formats_the_epoch() {
        assert_eq!(format_rfc3339_millis(0, 0), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn handles_a_leap_day() {
        assert_eq!(
            format_rfc3339_millis(1_709_208_000, 0),
            "2024-02-29T12:00:00.000Z"
        );
    }

    #[test]
    fn now_is_well_formed_and_zulu() {
        let ts = now_rfc3339();
        assert!(ts.ends_with('Z'), "timestamp is UTC (Z offset): {ts}");
        assert_eq!(ts.len(), "1970-01-01T00:00:00.000Z".len());
        assert_eq!(&ts[4..5], "-");
        assert_eq!(&ts[10..11], "T");
    }
}
