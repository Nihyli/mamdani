from __future__ import annotations

from pathlib import Path

from .base import ObjectStore


class LocalFilesystemObjectStore:
    """Reads private uploads from the local UPLOAD_DIR (M1 filesystem store)."""

    name = "filesystem"

    def __init__(self, root: Path) -> None:
        self.root = root

    def resolve_local_path(self, object_key: str) -> Path:
        if ".." in object_key or object_key.startswith("/"):
            raise ValueError("Invalid object key")
        return self.root / object_key

    def exists(self, object_key: str) -> bool:
        return self.resolve_local_path(object_key).is_file()


# Protocol satisfaction helper
_: type[ObjectStore] = LocalFilesystemObjectStore  # type: ignore[misc,assignment]
