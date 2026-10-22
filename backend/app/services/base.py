from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ConversionContext:
    inputs: list[Path]
    original_names: list[str]
    options: dict[str, Any]
    workdir: Path

    @property
    def input(self) -> Path:
        return self.inputs[0]

    @property
    def original_name(self) -> str:
        return self.original_names[0] if self.original_names else self.input.name


@dataclass
class ConversionResult:
    path: Path
    filename: str
    mime: str
    warnings: list[str] = field(default_factory=list)
