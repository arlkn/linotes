//! Library workflow tests against a real temporary notes folder.

use super::note_file::NoteFile;
use super::*;
use crate::error::AppError;
use crate::search::{SearchQuery, SearchScope};
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

struct Fixture {
    dir: TempDir,
    lib: Library,
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let (lib, _) = Library::open_with_memory_index(dir.path()).unwrap();
        Fixture { dir, lib }
    }

    fn root(&self) -> PathBuf {
        self.dir.path().canonicalize().unwrap()
    }

    fn path(&self, rel: &str) -> PathBuf {
        self.root().join(rel)
    }

    fn read(&self, rel: &str) -> String {
        fs::read_to_string(self.path(rel)).unwrap()
    }

    fn files(&self, dir: &str) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(self.path(dir))
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| !n.starts_with('.'))
            .collect();
        names.sort();
        names
    }

    fn save(&mut self, note: &Note, title: &str, content: &str) -> SavedNote {
        self.lib
            .save_note(SaveNoteInput {
                id: note.summary.id.clone(),
                title: title.into(),
                content: content.into(),
                expected_rev: note.rev.clone(),
                force: false,
            })
            .unwrap()
    }

    /// Simulate a restart: reopen the same folder with a fresh index.
    fn reopen(&mut self) {
        let (lib, _) = Library::open_with_memory_index(self.dir.path()).unwrap();
        self.lib = lib;
    }
}

fn search(lib: &Library, text: &str) -> Vec<String> {
    lib.search(&SearchQuery { text: text.into(), scope: SearchScope::All, folder: None })
        .unwrap()
        .into_iter()
        .map(|h| h.note.id)
        .collect()
}

#[test]
fn create_edit_save_and_reopen() {
    let mut fx = Fixture::new();
    let note = fx.lib.create_note("", "Shopping", "").unwrap();
    assert_eq!(note.summary.title, "Shopping");
    assert_eq!(fx.files(""), vec!["Shopping.md"]);

    let body = "# Weekend\n\n- [ ] Milk\n- [x] Bread\n\n**Don't** forget the `coffee`.\n";
    let saved = fx.save(&note, "Shopping", body);
    assert_ne!(saved.rev, note.rev);

    fx.reopen();
    let loaded = fx.lib.read_note(&note.summary.id).unwrap();
    assert_eq!(loaded.content, body);
    assert_eq!(loaded.summary.title, "Shopping");
    assert_eq!(loaded.rev, saved.rev);
    let meta = NoteFile::parse(&fx.read("Shopping.md")).meta();
    assert_eq!(meta.id.as_deref(), Some(note.summary.id.as_str()));
    assert!(meta.created.is_some() && meta.updated.is_some());
}

#[test]
fn saving_a_new_title_renames_the_file() {
    let mut fx = Fixture::new();
    let a = fx.lib.create_note("", "", "").unwrap();
    assert_eq!(fx.files(""), vec!["Untitled.md"]);
    let b = fx.lib.create_note("", "", "").unwrap();
    assert_eq!(fx.files(""), vec!["Untitled 2.md", "Untitled.md"]);

    let a2 = fx.save(&a, "Plans: 2026/Q1?", "text");
    assert_eq!(fx.files(""), vec!["Plans- 2026-Q1.md", "Untitled 2.md"]);
    assert_eq!(a2.summary.title, "Plans: 2026/Q1?", "the title keeps characters the file name can't");

    // Colliding title gets a numbered file name; case-only rename works.
    fx.save(&b, "plans- 2026-q1", "");
    assert!(fx.files("").contains(&"plans- 2026-q1 2.md".to_string()));
    let a = fx.lib.read_note(&a.summary.id).unwrap();
    fx.save(&a, "PLANS: 2026/Q1?", "text");
    assert!(fx.files("").contains(&"PLANS- 2026-Q1.md".to_string()));
}

#[test]
fn autosave_repeatedly_keeps_one_file() {
    let mut fx = Fixture::new();
    let mut note = fx.lib.create_note("", "Draft", "").unwrap();
    for i in 0..20 {
        let saved = fx.save(&note, "Draft", &format!("version {i}"));
        note.rev = saved.rev;
    }
    assert_eq!(fx.files(""), vec!["Draft.md"]);
    assert!(fx.read("Draft.md").ends_with("version 19\n"));
}

#[test]
fn external_modification_is_never_overwritten_silently() {
    let mut fx = Fixture::new();
    let note = fx.lib.create_note("", "Shared", "").unwrap();
    let saved = fx.save(&note, "Shared", "mine v1");

    // Another program edits the file.
    let path = fx.path("Shared.md");
    let edited = fx.read("Shared.md").replace("mine v1", "theirs");
    fs::write(&path, edited).unwrap();

    let err = fx
        .lib
        .save_note(SaveNoteInput {
            id: note.summary.id.clone(),
            title: "Shared".into(),
            content: "mine v2".into(),
            expected_rev: saved.rev.clone(),
            force: false,
        })
        .unwrap_err();
    assert!(matches!(err, AppError::Conflict(_)), "got {err:?}");
    assert!(fx.read("Shared.md").contains("theirs"), "disk content must be untouched");

    // Reloading shows their version; the user may then explicitly overwrite.
    let reloaded = fx.lib.read_note(&note.summary.id).unwrap();
    assert_eq!(reloaded.content, "theirs\n");
    fx.lib
        .save_note(SaveNoteInput {
            id: note.summary.id.clone(),
            title: "Shared".into(),
            content: "mine v2".into(),
            expected_rev: saved.rev,
            force: true,
        })
        .unwrap();
    assert!(fx.read("Shared.md").contains("mine v2"));
}

#[test]
fn external_changes_are_picked_up_by_sync() {
    let mut fx = Fixture::new();
    let note = fx.lib.create_note("", "Log", "").unwrap();
    fx.save(&note, "Log", "first");
    let text = fx.read("Log.md").replace("first", "second entry with zebra");
    fs::write(fx.path("Log.md"), text).unwrap();
    // Also a brand-new file created by another program, and a deletion.
    fs::write(fx.path("From vim.md"), "# From vim\n\nplain markdown\n").unwrap();

    let report = fx.lib.sync_all(false).unwrap();
    assert_eq!(report.updated, vec![note.summary.id.clone()]);
    assert_eq!(report.added.len(), 1);
    assert_eq!(search(&fx.lib, "zebra"), vec![note.summary.id.clone()]);

    fs::remove_file(fx.path("Log.md")).unwrap();
    let report = fx.lib.sync_all(false).unwrap();
    assert_eq!(report.removed, vec![note.summary.id.clone()]);
}

#[test]
fn indexing_never_modifies_files() {
    let fx_dir = tempfile::tempdir().unwrap();
    let plain = "# Plain\n\nNo frontmatter here.\n";
    let custom = "---\ntags: [x]\n# comment\n---\nBody\n";
    fs::write(fx_dir.path().join("Plain.md"), plain).unwrap();
    fs::write(fx_dir.path().join("Custom.md"), custom).unwrap();
    let (lib, _) = Library::open_with_memory_index(fx_dir.path()).unwrap();
    assert_eq!(lib.list_notes().unwrap().len(), 2);
    assert_eq!(fs::read_to_string(fx_dir.path().join("Plain.md")).unwrap(), plain);
    assert_eq!(fs::read_to_string(fx_dir.path().join("Custom.md")).unwrap(), custom);
}

#[test]
fn plain_markdown_files_keep_identity_and_other_frontmatter() {
    let mut fx = Fixture::new();
    fs::write(fx.path("Plain.md"), "Hello\n").unwrap();
    fs::write(fx.path("Tagged.md"), "---\ntags:\n  - a\n  - b\naliases: [t]\n---\n\nTagged body\n").unwrap();
    fx.lib.sync_all(false).unwrap();
    let notes = fx.lib.list_notes().unwrap();
    let plain = notes.iter().find(|n| n.title == "Plain").unwrap().clone();
    let tagged = notes.iter().find(|n| n.title == "Tagged").unwrap().clone();

    // Id is stable across syncs and restarts.
    fx.lib.sync_all(true).unwrap();
    fx.reopen();
    assert!(fx.lib.list_notes().unwrap().iter().any(|n| n.id == plain.id));

    // Editing through Linotes adds frontmatter but keeps the other keys.
    let note = fx.lib.read_note(&tagged.id).unwrap();
    fx.save(&note, "Tagged", "New body");
    let text = fx.read("Tagged.md");
    assert!(text.contains("tags:\n  - a\n  - b\n"), "{text}");
    assert!(text.contains("aliases: [t]"));
    assert!(text.contains(&format!("id: {}", tagged.id)));
    assert!(text.ends_with("New body\n"));
}

#[test]
fn copied_files_get_distinct_ids() {
    let mut fx = Fixture::new();
    let note = fx.lib.create_note("", "Original", "").unwrap();
    fx.save(&note, "Original", "body");
    fs::copy(fx.path("Original.md"), fx.path("Copy.md")).unwrap();
    fx.lib.sync_all(false).unwrap();
    let notes = fx.lib.list_notes().unwrap();
    assert_eq!(notes.len(), 2);
    assert_ne!(notes[0].id, notes[1].id);
    let original = fx.lib.read_note(&note.summary.id).unwrap();
    assert_eq!(original.summary.id, note.summary.id);
    assert!(fx.path("Original.md").exists());
}

#[test]
fn external_rename_keeps_note_identity() {
    let mut fx = Fixture::new();
    let note = fx.lib.create_note("", "Before", "").unwrap();
    fs::rename(fx.path("Before.md"), fx.path("After.md")).unwrap();
    let report = fx.lib.sync_all(false).unwrap();
    assert!(report.removed.is_empty());
    let loaded = fx.lib.read_note(&note.summary.id).unwrap();
    assert!(loaded.path.ends_with("After.md"));
}

#[test]
fn missing_file_is_reported_and_can_be_recreated() {
    let mut fx = Fixture::new();
    let note = fx.lib.create_note("", "Gone", "").unwrap();
    fs::remove_file(fx.path("Gone.md")).unwrap();
    assert!(matches!(fx.lib.read_note(&note.summary.id), Err(AppError::FileMissing(_))));
    let input = SaveNoteInput {
        id: note.summary.id.clone(),
        title: "Gone".into(),
        content: "rescued text".into(),
        expected_rev: note.rev.clone(),
        force: false,
    };
    assert!(matches!(fx.lib.save_note(input.clone()), Err(AppError::FileMissing(_))));
    fx.lib.save_note(SaveNoteInput { force: true, ..input }).unwrap();
    assert!(fx.read("Gone.md").contains("rescued text"));
}

#[test]
fn folders_create_rename_and_delete() {
    let mut fx = Fixture::new();
    let work = fx.lib.create_folder("", "Work").unwrap();
    assert_eq!(work.path, "Work");
    let sub = fx.lib.create_folder("Work", "Projects").unwrap();
    assert_eq!(sub.path, "Work/Projects");
    assert!(matches!(fx.lib.create_folder("", "work"), Err(AppError::AlreadyExists(_))));
    assert!(fx.lib.create_folder("", "../escape").is_ok_and(|f| f.path == "-escape"));
    assert!(fx.lib.create_folder("../..", "x").is_err());

    let note = fx.lib.create_note("Work/Projects", "Roadmap", "").unwrap();
    fx.save(&note, "Roadmap", "milestones");

    let renamed = fx.lib.rename_folder("Work", "Jobs").unwrap();
    assert_eq!(renamed.path, "Jobs");
    let moved = fx.lib.read_note(&note.summary.id).unwrap();
    assert_eq!(moved.summary.folder, "Jobs/Projects");
    assert_eq!(moved.content, "milestones\n");
    let folders: Vec<String> = fx.lib.list_folders().unwrap().into_iter().map(|f| f.path).collect();
    assert_eq!(folders, vec!["-escape", "Jobs", "Jobs/Projects"]);

    let report = fx.lib.delete_folder("Jobs").unwrap();
    assert_eq!(report.trashed_notes, 1);
    assert!(report.removed);
    assert!(!fx.path("Jobs").exists());
    let trashed = fx.lib.read_note(&note.summary.id).unwrap();
    assert!(trashed.summary.trashed);

    // Restoring recreates the folder the note came from.
    let restored = fx.lib.restore_note(&note.summary.id).unwrap();
    assert_eq!(restored.folder, "Jobs/Projects");
    assert!(fx.path("Jobs/Projects/Roadmap.md").exists());
}

#[test]
fn deleting_a_folder_keeps_non_note_files() {
    let mut fx = Fixture::new();
    fx.lib.create_folder("", "Media").unwrap();
    fs::write(fx.path("Media/photo.png"), [0u8, 1, 2]).unwrap();
    let report = fx.lib.delete_folder("Media").unwrap();
    assert!(!report.removed);
    assert_eq!(report.remaining_files, vec!["Media/photo.png"]);
    assert!(fx.path("Media/photo.png").exists());
}

#[test]
fn moving_notes_between_folders_preserves_content() {
    let mut fx = Fixture::new();
    fx.lib.create_folder("", "A").unwrap();
    fx.lib.create_folder("", "B").unwrap();
    let note = fx.lib.create_note("A", "Travel", "").unwrap();
    let saved = fx.save(&note, "Travel", "Passport, tickets");
    fs::write(fx.path("B/Travel.md"), "someone else's note").unwrap();
    fx.lib.sync_all(false).unwrap();

    let moved = fx.lib.move_note(&note.summary.id, "B").unwrap();
    assert_eq!(moved.folder, "B");
    assert_eq!(fx.files("B"), vec!["Travel 2.md", "Travel.md"]);
    assert_eq!(fx.read("B/Travel.md"), "someone else's note");
    let loaded = fx.lib.read_note(&note.summary.id).unwrap();
    assert_eq!(loaded.content, "Passport, tickets\n");
    assert_eq!(loaded.rev, saved.rev, "moving must not change the revision");
    assert!(fx.lib.move_note(&note.summary.id, "../outside").is_err());
    assert!(fx.lib.move_note(&note.summary.id, "Missing").is_err());
}

#[test]
fn trash_restore_and_permanent_delete() {
    let mut fx = Fixture::new();
    fx.lib.create_folder("", "Ideas").unwrap();
    let note = fx.lib.create_note("Ideas", "Startup", "").unwrap();
    fx.save(&note, "Startup", "secret plan");

    let trashed = fx.lib.trash_note(&note.summary.id).unwrap();
    assert!(trashed.trashed && trashed.trashed_at.is_some());
    assert_eq!(trashed.folder, "Ideas");
    assert!(fx.files("Ideas").is_empty());
    assert!(fx.path(".trash/Startup.md").exists());
    assert!(fx.read(".trash/Startup.md").contains("trashed_from: Ideas"));
    assert!(search(&fx.lib, "secret").is_empty(), "trashed notes are hidden from normal search");

    // Trash state survives an index rebuild.
    fx.reopen();
    let trashed = fx.lib.read_note(&note.summary.id).unwrap();
    assert!(trashed.summary.trashed);
    assert_eq!(trashed.summary.folder, "Ideas");
    assert!(
        fx.lib
            .save_note(SaveNoteInput {
                id: note.summary.id.clone(),
                title: "x".into(),
                content: "x".into(),
                expected_rev: trashed.rev.clone(),
                force: false
            })
            .is_err()
    );

    let restored = fx.lib.restore_note(&note.summary.id).unwrap();
    assert!(!restored.trashed);
    assert_eq!(fx.files("Ideas"), vec!["Startup.md"]);
    assert!(!fx.read("Ideas/Startup.md").contains("trashed_from"));

    // Permanent deletion requires the note to be in the trash first.
    assert!(fx.lib.delete_note_permanently(&note.summary.id).is_err());
    fx.lib.trash_note(&note.summary.id).unwrap();
    fx.lib.delete_note_permanently(&note.summary.id).unwrap();
    assert!(!fx.path(".trash/Startup.md").exists());
    assert!(matches!(fx.lib.read_note(&note.summary.id), Err(AppError::NotFound(_))));
}

#[test]
fn empty_trash_deletes_only_trashed_notes() {
    let mut fx = Fixture::new();
    let keep = fx.lib.create_note("", "Keep", "").unwrap();
    let a = fx.lib.create_note("", "A", "").unwrap();
    let b = fx.lib.create_note("", "B", "").unwrap();
    fx.lib.trash_note(&a.summary.id).unwrap();
    fx.lib.trash_note(&b.summary.id).unwrap();
    assert_eq!(fx.lib.empty_trash().unwrap(), 2);
    let ids: Vec<String> = fx.lib.list_notes().unwrap().into_iter().map(|n| n.id).collect();
    assert_eq!(ids, vec![keep.summary.id]);
}

#[test]
fn favorites_are_stored_in_the_file() {
    let mut fx = Fixture::new();
    let note = fx.lib.create_note("", "Star", "").unwrap();
    let saved = fx.save(&note, "Star", "body");
    let fav = fx.lib.set_favorite(&note.summary.id, true).unwrap();
    assert!(fav.favorite);
    assert!(fx.read("Star.md").contains("favorite: true"));
    // The editor's revision stays valid after a metadata-only change.
    let resaved = fx.lib.save_note(SaveNoteInput {
        id: note.summary.id.clone(),
        title: "Star".into(),
        content: "body 2".into(),
        expected_rev: saved.rev,
        force: false,
    });
    assert!(resaved.is_ok());
    fx.reopen();
    assert!(fx.lib.read_note(&note.summary.id).unwrap().summary.favorite);
    fx.lib.set_favorite(&note.summary.id, false).unwrap();
    assert!(!fx.read("Star.md").contains("favorite"));
}

#[test]
fn search_reflects_saves() {
    let mut fx = Fixture::new();
    let note = fx.lib.create_note("", "Recipes", "").unwrap();
    assert!(search(&fx.lib, "lasagna").is_empty());
    fx.save(&note, "Recipes", "Grandma's lasagna");
    assert_eq!(search(&fx.lib, "lasag"), vec![note.summary.id.clone()]);
    assert_eq!(search(&fx.lib, "recipes"), vec![note.summary.id]);
}

#[test]
fn invalid_utf8_files_are_skipped_not_touched() {
    let mut fx = Fixture::new();
    let bytes = [b'#', b' ', 0xff, 0xfe, b'\n'];
    fs::write(fx.path("Binary.md"), bytes).unwrap();
    let report = fx.lib.sync_all(false).unwrap();
    assert_eq!(report.skipped.len(), 1);
    assert!(report.skipped[0].reason.contains("UTF-8"));
    assert_eq!(fs::read(fx.path("Binary.md")).unwrap(), bytes);
}

#[test]
fn hidden_and_temporary_files_are_ignored() {
    let mut fx = Fixture::new();
    fs::create_dir(fx.path(".git")).unwrap();
    fs::write(fx.path(".git/README.md"), "not a note").unwrap();
    fs::write(fx.path(".hidden.md"), "not a note").unwrap();
    fs::write(fx.path(".Note.md.linotes-tmp-abc"), "temp").unwrap();
    fs::write(fx.path("notes.txt"), "text file").unwrap();
    fx.lib.sync_all(false).unwrap();
    assert!(fx.lib.list_notes().unwrap().is_empty());
    assert!(fx.lib.list_folders().unwrap().is_empty());
}

#[test]
fn index_is_rebuilt_from_files() {
    let dir = tempfile::tempdir().unwrap();
    let index_dir = tempfile::tempdir().unwrap();
    let recovery_dir = tempfile::tempdir().unwrap();
    let (mut lib, _) = Library::open(dir.path(), true, index_dir.path(), recovery_dir.path()).unwrap();
    let note = lib.create_note("", "Durable", "").unwrap();
    lib.set_favorite(&note.summary.id, true).unwrap();
    drop(lib);

    // Destroy the index entirely.
    for entry in fs::read_dir(index_dir.path()).unwrap() {
        fs::write(entry.unwrap().path(), b"garbage").unwrap();
    }
    let (lib, report) = Library::open(dir.path(), true, index_dir.path(), recovery_dir.path()).unwrap();
    assert!(report.replaced_corrupt_index.is_some());
    let notes = lib.list_notes().unwrap();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0].id, note.summary.id);
    assert!(notes[0].favorite, "metadata lives in the file, so nothing is lost");
}

#[test]
fn unavailable_custom_folder_is_not_created() {
    let base = tempfile::tempdir().unwrap();
    let missing = base.path().join("unplugged-drive/notes");
    let result = Library::open(&missing, false, base.path(), base.path());
    assert!(matches!(result, Err(AppError::Unavailable(_))));
    assert!(!missing.exists());
}

#[test]
fn import_files_and_folders() {
    let mut fx = Fixture::new();
    let src = tempfile::tempdir().unwrap();
    let s = src.path();
    fs::create_dir_all(s.join("Project/Sub dir")).unwrap();
    fs::create_dir_all(s.join("Project/.obsidian")).unwrap();
    fs::write(s.join("Project/Readme.md"), "# Readme\n").unwrap();
    fs::write(s.join("Project/Sub dir/Deep.markdown"), "deep text").unwrap();
    fs::write(s.join("Project/Sub dir/image.png"), [1u8, 2, 3]).unwrap();
    fs::write(s.join("Project/bad.md"), [0xffu8, 0x00]).unwrap();
    fs::write(s.join("Project/.obsidian/config.md"), "hidden").unwrap();
    std::os::unix::fs::symlink("/etc/passwd", s.join("Project/link.md")).unwrap();

    let report = fx.lib.import_directory(&s.join("Project"), "").unwrap();
    assert_eq!(report.folder.as_deref(), Some("Project"));
    let mut titles: Vec<&str> = report.imported.iter().map(|n| n.title.as_str()).collect();
    titles.sort();
    assert_eq!(titles, vec!["Deep", "Readme"]);
    assert_eq!(report.failed.len(), 1, "{:?}", report.failed);
    assert!(report.failed[0].reason.contains("UTF-8"));
    let skipped: Vec<&str> = report.skipped.iter().map(|i| i.reason.as_str()).collect();
    assert_eq!(skipped.len(), 2, "{skipped:?}");
    assert!(fx.path("Project/Sub dir/Deep.md").exists());
    assert!(!fx.path("Project/.obsidian").exists());
    assert!(!fx.path("Project/link.md").exists());

    // Importing the same folder again creates a separate copy.
    let again = fx.lib.import_directory(&s.join("Project"), "").unwrap();
    assert_eq!(again.folder.as_deref(), Some("Project 2"));

    // Single files, including a duplicate id and a rejected extension.
    fx.lib.create_folder("", "Inbox").unwrap();
    let exported_id = report.imported[0].id.clone();
    let with_id = s.join("With id.md");
    fs::write(&with_id, format!("---\nid: {exported_id}\n---\nx\n")).unwrap();
    fs::write(s.join("script.sh"), "echo hi").unwrap();
    let files = fx.lib.import_files(&[with_id, s.join("script.sh"), s.join("missing.md")], "Inbox").unwrap();
    assert_eq!(files.imported.len(), 1);
    assert_ne!(files.imported[0].id, exported_id, "duplicate ids are replaced");
    assert_eq!(files.failed.len(), 2);
}

#[test]
fn import_refuses_recursive_sources() {
    let mut fx = Fixture::new();
    let root = fx.root();
    assert!(fx.lib.import_directory(&root, "").is_err());
    let parent = root.parent().unwrap().to_path_buf();
    assert!(fx.lib.import_directory(&parent, "").is_err());
}

#[test]
fn export_note_and_zip_preserve_structure() {
    let mut fx = Fixture::new();
    fx.lib.create_folder("", "Work").unwrap();
    fx.lib.create_folder("Work", "Empty").unwrap();
    let a = fx.lib.create_note("Work", "Alpha", "").unwrap();
    fx.save(&a, "Alpha", "alpha body");
    let b = fx.lib.create_note("", "Beta", "").unwrap();
    fx.lib.trash_note(&b.summary.id).unwrap();

    let out = tempfile::tempdir().unwrap();
    let single = out.path().join("alpha.md");
    fx.lib.export_note(&a.summary.id, &single).unwrap();
    assert_eq!(fs::read_to_string(&single).unwrap(), fx.read("Work/Alpha.md"));

    let zip_path = out.path().join("all.zip");
    let report = fx.lib.export_zip(None, &zip_path).unwrap();
    assert_eq!(report.files, 1, "trash is excluded");
    let names = zip_names(&zip_path);
    assert!(names.contains(&"Linotes/Work/Alpha.md".to_string()), "{names:?}");
    assert!(names.contains(&"Linotes/Work/Empty/".to_string()), "{names:?}");
    assert!(!names.iter().any(|n| n.contains(".trash")));

    let folder_zip = out.path().join("work.zip");
    fx.lib.export_zip(Some("Work"), &folder_zip).unwrap();
    let names = zip_names(&folder_zip);
    assert!(names.contains(&"Work/Alpha.md".to_string()), "{names:?}");
    let mut archive = zip::ZipArchive::new(fs::File::open(&folder_zip).unwrap()).unwrap();
    let mut entry = archive.by_name("Work/Alpha.md").unwrap();
    let mut text = String::new();
    std::io::Read::read_to_string(&mut entry, &mut text).unwrap();
    assert!(text.contains("alpha body"));
    assert!(fx.lib.export_zip(Some("../x"), &folder_zip).is_err());
    assert!(!leftover_temp_files(out.path()));
}

fn zip_names(path: &Path) -> Vec<String> {
    let archive = zip::ZipArchive::new(fs::File::open(path).unwrap()).unwrap();
    archive.file_names().map(String::from).collect()
}

fn leftover_temp_files(dir: &Path) -> bool {
    fs::read_dir(dir).unwrap().filter_map(|e| e.ok()).any(|e| crate::filesystem::atomic::is_temp_file(&e.path()))
}

/// Timings for a large library. Run with
/// `cargo test --release large_library -- --ignored --nocapture`.
#[test]
#[ignore = "benchmark"]
fn large_library_timings() {
    use std::time::Instant;
    const NOTES: usize = 5_000;
    let notes_dir = tempfile::tempdir().unwrap();
    let data_dir = tempfile::tempdir().unwrap();
    let (index, recovery) = (data_dir.path().join("index"), data_dir.path().join("recovery"));
    let paragraph = "Some **Markdown** text with a [link](https://example.com) and `code`.\n\n".repeat(20);
    for i in 0..NOTES {
        let folder = notes_dir.path().join(format!("Folder {}", i % 50));
        fs::create_dir_all(&folder).unwrap();
        let body = format!("---\ntitle: Note {i}\n---\n# Note {i}\n\n{paragraph}");
        fs::write(folder.join(format!("Note {i}.md")), body).unwrap();
    }
    let open = || Library::open(notes_dir.path(), false, &index, &recovery).unwrap().0;
    let time = |label: &str, f: &mut dyn FnMut()| {
        let start = Instant::now();
        f();
        eprintln!("{label:<40} {:>8.1} ms", start.elapsed().as_secs_f64() * 1000.0);
    };

    eprintln!("{NOTES} notes");
    time("open, first run (full index)", &mut || drop(open()));
    let mut lib = None;
    time("open, index up to date (normal start)", &mut || lib = Some(open()));
    let lib = lib.as_mut().unwrap();
    time("sync, nothing changed", &mut || assert!(!lib.sync_all(false).unwrap().has_changes()));
    let summary = lib.list_notes().unwrap().into_iter().find(|n| n.title == "Note 7").unwrap();
    let note = lib.read_note(&summary.id).unwrap();
    time("save one note", &mut || {
        lib.save_note(SaveNoteInput {
            id: note.summary.id.clone(),
            title: note.summary.title.clone(),
            content: format!("{}\nEdited.\n", note.content),
            expected_rev: note.rev.clone(),
            force: false,
        })
        .unwrap();
    });
    time("sync after Linotes' own save", &mut || drop(lib.sync_all(false).unwrap()));
    fs::write(notes_dir.path().join("Folder 3/Note 3.md"), "---\ntitle: Note 3\n---\nChanged elsewhere.\n").unwrap();
    time("sync, one file changed elsewhere", &mut || assert!(lib.sync_all(false).unwrap().has_changes()));
    time("list notes", &mut || drop(lib.list_notes().unwrap()));
    time("rebuild index", &mut || drop(lib.sync_all(true).unwrap()));
}

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR rest of a tiny image";

#[test]
fn images_are_saved_in_attachments_with_relative_links() {
    let mut fx = Fixture::new();
    fx.lib.create_folder("", "Work").unwrap();
    let root_note = fx.lib.create_note("", "Root", "").unwrap();
    let work_note = fx.lib.create_note("Work", "Plan", "").unwrap();

    let first = fx.lib.save_image(&root_note.summary.id, "My Diagram.png", PNG).unwrap();
    assert_eq!(first.path, "attachments/My-Diagram.png");
    assert_eq!(first.link, "attachments/My-Diagram.png");
    let second = fx.lib.save_image(&work_note.summary.id, "My Diagram.png", PNG).unwrap();
    assert_eq!(second.path, "attachments/My-Diagram-2.png", "existing images are never overwritten");
    assert_eq!(second.link, "../attachments/My-Diagram-2.png");
    assert_eq!(fs::read(fx.path(&first.path)).unwrap(), PNG);

    let pasted = fx.lib.save_image(&root_note.summary.id, "image.png", PNG).unwrap();
    assert!(pasted.path.starts_with("attachments/image-20"), "{}", pasted.path);

    let not_image = fx.lib.save_image(&root_note.summary.id, "evil.png", b"<html><script>").unwrap_err();
    assert!(matches!(not_image, AppError::InvalidInput(_)));
    let too_big = vec![0u8; super::MAX_IMAGE_BYTES + 1];
    assert!(fx.lib.save_image(&root_note.summary.id, "big.png", &too_big).is_err());
    fx.lib.trash_note(&root_note.summary.id).unwrap();
    assert!(fx.lib.save_image(&root_note.summary.id, "x.png", PNG).is_err(), "trashed notes are read-only");

    // The images folder is not a folder of notes, and its name is reserved at the top.
    let folders: Vec<String> = fx.lib.list_folders().unwrap().into_iter().map(|f| f.path).collect();
    assert_eq!(folders, vec!["Work"]);
    assert!(fx.lib.create_folder("", "Attachments").is_err());
    assert!(fx.lib.rename_folder("Work", "attachments").is_err());
    fx.lib.create_folder("Work", "attachments").unwrap();
}

#[test]
fn only_image_files_inside_the_notes_folder_are_shown() {
    let fx = Fixture::new();
    let root = fx.root();
    fs::create_dir_all(root.join("attachments")).unwrap();
    fs::create_dir_all(root.join(".hidden")).unwrap();
    fs::write(root.join("attachments/a.png"), PNG).unwrap();
    fs::write(root.join(".hidden/b.png"), PNG).unwrap();
    fs::write(root.join("attachments/fake.png"), b"not an image").unwrap();
    fs::write(root.join("notes.md"), "# Notes").unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret.png"), PNG).unwrap();
    std::os::unix::fs::symlink(outside.path().join("secret.png"), root.join("attachments/link.png")).unwrap();

    let (kind, bytes) = super::read_image(&root, "attachments/a.png").unwrap();
    assert_eq!((kind.mime(), bytes.as_slice()), ("image/png", PNG));
    for bad in [
        "attachments/../attachments/a.png",
        ".hidden/b.png",
        "/etc/passwd",
        "notes.md",
        "attachments/fake.png",
        "attachments/link.png",
        "attachments/missing.png",
        "",
    ] {
        assert!(super::read_image(&root, bad).is_err(), "{bad:?} must not be shown");
    }
}

#[test]
fn moving_a_note_keeps_its_images_working() {
    let mut fx = Fixture::new();
    fx.lib.create_folder("", "Work").unwrap();
    fx.lib.create_folder("Work", "Projects").unwrap();
    let note = fx.lib.create_note("", "Trip", "").unwrap();
    let image = fx.lib.save_image(&note.summary.id, "map.png", PNG).unwrap();
    let body = format!("Route:\n\n![The map]({})\n\nSee https://example.com\n", image.link);
    let saved = fx.save(&note, "Trip", &body);

    fx.lib.move_note(&note.summary.id, "Work/Projects").unwrap();
    let moved = fx.lib.read_note(&note.summary.id).unwrap();
    assert_eq!(moved.content, "Route:\n\n![The map](../../attachments/map.png)\n\nSee https://example.com\n");
    assert_ne!(moved.rev, saved.rev, "the editor must reload the moved note");
    assert!(fx.read("Work/Projects/Trip.md").contains("title: Trip"), "frontmatter is kept");

    // Trash and restore don't need new links: the note returns to the same folder.
    fx.lib.trash_note(&note.summary.id).unwrap();
    fx.lib.restore_note(&note.summary.id).unwrap();
    assert_eq!(fx.lib.read_note(&note.summary.id).unwrap().content, moved.content);
}

#[test]
fn imported_notes_bring_their_images() {
    let mut fx = Fixture::new();
    let src = tempfile::tempdir().unwrap();
    let s = src.path().join("Vault");
    fs::create_dir_all(s.join("img")).unwrap();
    fs::create_dir_all(s.join("Daily")).unwrap();
    fs::write(s.join("img/photo one.png"), PNG).unwrap();
    fs::write(s.join("img/not-really.png"), b"text").unwrap();
    fs::write(src.path().join("outside.png"), PNG).unwrap();
    fs::write(
        s.join("Daily/Monday.md"),
        "![A photo](../img/photo%20one.png)\n![Again](<../img/photo one.png>)\n\
         ![Fake](../img/not-really.png)\n![Outside](../../outside.png)\n![Web](https://x.org/a.png)\n",
    )
    .unwrap();

    let report = fx.lib.import_directory(&s, "").unwrap();
    assert_eq!(report.imported.len(), 1);
    let skipped: Vec<&str> = report.skipped.iter().map(|i| i.source.as_str()).collect();
    assert!(skipped.iter().all(|s| !s.ends_with("photo one.png")), "copied images are not skipped: {skipped:?}");
    assert_eq!(fx.files("attachments"), vec!["photo-one.png"], "each image is copied once");
    let note = fx.lib.read_note(&report.imported[0].id).unwrap();
    assert_eq!(
        note.content,
        "![A photo](../../attachments/photo-one.png)\n![Again](<../../attachments/photo-one.png>)\n\
         ![Fake](../img/not-really.png)\n![Outside](../../outside.png)\n![Web](https://x.org/a.png)\n"
    );
}

#[test]
fn imported_files_bring_only_images_from_their_own_folder() {
    let mut fx = Fixture::new();
    let src = tempfile::tempdir().unwrap();
    let notes = src.path().join("notes");
    fs::create_dir_all(notes.join("pics")).unwrap();
    fs::write(notes.join("pics/a.png"), PNG).unwrap();
    fs::write(src.path().join("outside.png"), PNG).unwrap();
    fs::write(notes.join("Note.md"), "![a](pics/a.png) ![b](../outside.png)\n").unwrap();

    let report = fx.lib.import_files(&[notes.join("Note.md")], "").unwrap();
    let note = fx.lib.read_note(&report.imported[0].id).unwrap();
    assert_eq!(note.content, "![a](attachments/a.png) ![b](../outside.png)\n");
    assert_eq!(fx.files("attachments"), vec!["a.png"]);
}

#[test]
fn files_of_any_kind_are_attached_and_only_safe_ones_open() {
    use std::os::unix::fs::PermissionsExt;
    let mut fx = Fixture::new();
    fx.lib.create_folder("", "Work").unwrap();
    let note = fx.lib.create_note("Work", "Plan", "").unwrap();
    let id = note.summary.id.clone();
    let src = tempfile::tempdir().unwrap();
    let pdf = src.path().join("Quarterly Report.pdf");
    let photo = src.path().join("Holiday photo.jpeg");
    let readme = src.path().join("README");
    fs::write(&pdf, b"%PDF-1.7\n").unwrap();
    fs::write(&photo, [0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10]).unwrap();
    fs::write(&readme, "Read me\n").unwrap();

    let file = fx.lib.add_file(&id, &pdf).unwrap();
    assert!(!file.image);
    assert_eq!(
        (file.path.as_str(), file.link.as_str()),
        ("attachments/Quarterly-Report.pdf", "../attachments/Quarterly-Report.pdf")
    );
    assert_eq!(file.name, "Quarterly Report.pdf");
    let image = fx.lib.add_file(&id, &photo).unwrap();
    assert!(image.image);
    assert_eq!(image.path, "attachments/Holiday-photo.jpg");
    assert_eq!(fx.lib.add_file(&id, &readme).unwrap().path, "attachments/README");
    assert!(fx.lib.add_file(&id, src.path()).is_err(), "folders can't be added");

    // Linked files open in their usual app, unless they could run a program.
    assert_eq!(fx.lib.linked_file(&id, &file.link).unwrap(), super::LinkedFile::Open(fx.path(&file.path)));
    fs::write(fx.path("attachments/My File.pdf"), b"%PDF").unwrap();
    assert!(matches!(fx.lib.linked_file(&id, "../attachments/My%20File.pdf").unwrap(), super::LinkedFile::Open(_)));
    fs::write(fx.path("attachments/run.sh"), "#!/bin/sh\n").unwrap();
    fs::write(fx.path("attachments/sneaky.pdf"), b"%PDF").unwrap();
    fs::set_permissions(fx.path("attachments/sneaky.pdf"), fs::Permissions::from_mode(0o755)).unwrap();
    for shown in ["../attachments/run.sh", "../attachments/sneaky.pdf", "../attachments/README"] {
        assert!(matches!(fx.lib.linked_file(&id, shown).unwrap(), super::LinkedFile::Reveal(_)), "{shown}");
    }
    for refused in ["../../outside.pdf", "https://x.org/a.pdf", "/etc/passwd", "../attachments/missing.pdf", "#top"] {
        assert!(fx.lib.linked_file(&id, refused).is_err(), "{refused}");
    }
}
