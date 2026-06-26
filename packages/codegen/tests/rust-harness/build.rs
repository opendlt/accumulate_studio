// Embed an application manifest declaring requestedExecutionLevel=asInvoker.
//
// Without it, Windows' Installer Detection heuristic forces UAC elevation on any
// executable whose name contains "update"/"setup"/"install" (e.g. the generated
// e2e_updatekey.exe / e2e_updatekeypage.exe / e2e_updateaccountauth.exe), so they
// fail to launch under a non-elevated test runner with WinError 740. Declaring
// asInvoker disables that heuristic.
use embed_manifest::{embed_manifest, new_manifest};

fn main() {
    if std::env::var_os("CARGO_CFG_WINDOWS").is_some() {
        embed_manifest(new_manifest("AccumulateE2EHarness"))
            .expect("unable to embed manifest");
    }
    println!("cargo:rerun-if-changed=build.rs");
}
