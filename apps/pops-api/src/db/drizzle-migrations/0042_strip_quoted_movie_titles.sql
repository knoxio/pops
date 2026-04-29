-- Strip leading/trailing double-quote characters from movie titles stored with spurious
-- surrounding quotes (e.g. `"Wuthering Heights"` → `Wuthering Heights`).
-- SQLite TRIM(X, Y) removes all Y chars from both ends of X.
UPDATE movies
SET title = TRIM(title, '"')
WHERE title LIKE '"%' OR title LIKE '%"';
