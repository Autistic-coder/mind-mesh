# Dataset workflow

MindMesh keeps the browser review step separate from the saved dataset. The browser preview helps
the user choose a file and worksheet. The FastAPI parser is authoritative: it reads the complete
selected dataset again, validates it, calculates the saved summary, and only then creates the
database record.

## Supported files and limits

| Rule            | Limit or behavior                        |
| --------------- | ---------------------------------------- |
| Formats         | UTF-8 CSV and XLSX                       |
| Uploaded bytes  | 25 MB per file                           |
| Data rows       | 200,000, excluding the header            |
| Columns         | 10,000                                   |
| Cells inspected | 10,000,000                               |
| Stored preview  | First 25 data rows                       |
| XLSX expansion  | 160 MB and at most 2,000 archive members |

CSV supports a UTF-8 byte order mark and quoted values containing commas or newlines. Headers must
be non-empty and unique without regard to case, and each data row must have the same width as the
header. Empty and malformed files are rejected with a user-facing message.

For XLSX files with multiple worksheets, the user must select one. The server verifies that the
worksheet exists. Numbers, booleans, supported spreadsheet dates, text, and blanks are summarized.
Mixed columns are labeled `mixed`, and text such as `0012` remains text. Formula and spreadsheet
error cells are rejected. MindMesh does not calculate formulas or rely on cached formula results;
export values to CSV or replace formulas with values before uploading. Macro-enabled workbooks are
not accepted.

## Save and storage lifecycle

1. The browser builds a bounded review without modifying the source file.
2. On confirmation, it sends the original file, selected worksheet, and optional project ID.
3. The API derives the owner from the authenticated session and verifies the project belongs to
   that owner.
4. The API streams the upload to a temporary file under the private upload directory while
   enforcing the byte limit.
5. The server parses the staged file and calculates counts, inferred types, missing values, and the
   preview from the complete selected dataset.
6. The staged file is renamed to a server-generated name, and its metadata is committed to SQLite.
   A failed validation or database commit removes the staged or renamed file.

The default database is `var/mindmesh.db`; complete files are stored in `var/uploads`. Both paths
are ignored by Git and can be changed in `backend/.env.example`. Uploads are outside the frontend's
public files and are returned only by authenticated download endpoints after an ownership check.
Downloads use the retained original filename and return the original bytes.

Deletion first moves the owned file to a temporary quarantine name. The database record is then
deleted. If the transaction fails, the file is restored; after a successful commit, the quarantined
file is removed. Resetting a workspace follows the same rule for every owned dataset.

## Ownership and legacy records

Every list, details, preview, assignment, download, and deletion query includes the authenticated
user ID. IDs supplied in a URL or request body do not establish ownership. Assigning a dataset also
checks that the destination project belongs to the same account. State-changing requests require
the session's CSRF token.

Older browser workspaces contain only dataset summaries and preview rows. They are imported only
after an explicit action in Workspace settings, receive new server IDs, and are labeled
**Preview-only record**. They have no download action because the old browser format never retained
the original file. Re-upload the source to create a complete dataset.

If a database record exists but its stored file is missing, the UI keeps the saved summary visible,
labels the original as unavailable, and disables download. Restore the matching upload from backup
or upload the source again as a new dataset.
