# Server files

Use `/files` to open the exported-share browser. Expand folders, select a file
or directory, then use Upload, Download, Rename, Edit, Move, Delete or New
directory. The server exposes only configured shares beneath `/`; physical
paths are not available. Accounts require share read/write privileges.

Edit saves UTF-8 text back to the server; it does not apply configuration to the
browser or server automatically. Edit is limited to 1 MiB, deletion of folders
requires them to be empty, and moves across filesystems report an error.
Uploads are committed atomically and do not overwrite existing files; editor
saves explicitly replace their source. Downloads use disk streaming where the
browser supports it, otherwise a Blob limited to 256 MiB. Linked share metadata
requires a direct owner-server connection for file operations.

The authoritative configuration and protocol documentation is
`rustyrig-fw/doc/file-shares.md`. Native parity:
`rrclient/files.c`, `rrclient/gtk/gtk.files.c`, and `gtk.editcfg.c`.
