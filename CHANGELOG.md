# Changelog

Every change people can see goes under **Unreleased** in the same commit. A release retitles that section and its
notes come from it.

## Unreleased

### Added
- **Character creation, first steps (milestone 2a).** "New" in the library makes a character (or a free-text draft).
  The Character page has the core book's first steps: priorities A–E (picking a letter another category has swaps the
  two), the optional More Metahumans rule, metatype, magic (magician or physical adept; hermetic or shamanic; a core
  totem), and attributes with racial modifiers and maximums. A rules check beside the steps shows the attribute points
  and every problem with its page (SR2 pp.43–47).
- Characters change only step by step: each change is an operation the server checks with the same rules code the
  page uses, saved as a new revision. A finished character can't be rolled back to an earlier revision.
- The rules come from the Foundry system's own code (this project's copy, kept by the daily content pull request);
  a pull request that changes that code is titled "Content + RULES CODE".
- **Catalog (milestone 1).** Browse and search 1,763 items from the core book and 11 sourcebooks, each with its page.
- **App skeleton.** Invite-only accounts, a library of documents with revisions, an admin CLI, a Docker image, CI on
  SQLite, PostgreSQL, MySQL and MariaDB.
