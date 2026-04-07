fn main() {
    // Bake the absolute path to the backend directory into the binary at
    // compile time.  When the built .app is launched from Finder (or via
    // autostart) its cwd is "/" and relative path discovery fails.  By
    // embedding the path we know at build time the app can always find the
    // backend on the same machine where it was compiled.
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let backend_path = manifest_dir
        .join("../backend")
        .canonicalize()
        .unwrap_or_else(|_| manifest_dir.join("../backend"));
    println!(
        "cargo:rustc-env=FWUBBO_BACKEND_PATH={}",
        backend_path.display()
    );
    println!("cargo:rerun-if-changed=../backend/main.py");

    tauri_build::build()
}
