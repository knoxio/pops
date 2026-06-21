//! Contacts pillar library surface.
//!
//! The two binaries (`contacts`, the server; `emit-openapi`, the spec
//! generator) share these modules so the served document and the committed
//! `openapi/contacts.openapi.json` are generated from one source.

pub mod api;
pub mod app;
pub mod config;
pub mod db;
pub mod entities;
pub mod health;
pub mod openapi;
pub mod search;
pub mod time;
