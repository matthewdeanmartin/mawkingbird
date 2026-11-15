"""Conservative tripwire; compiler deny is the primary enforcement."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1] / "src-tauri"
for path in [root / "build.rs", *sorted((root / "src").rglob("*.rs"))]:
    text = path.read_text(encoding="utf-8")
    code = "\n".join(line.split("//", 1)[0] for line in text.splitlines())
    expected = 1 if path.name == "windows_network.rs" else 0
    assert len(re.findall(r"\bunsafe\b", code)) == expected, path
    assert len(re.findall(r"allow\s*\(\s*unsafe_code\s*\)", code)) == expected, path
assert "#![deny(unsafe_code)]" in (root / "src/main.rs").read_text(encoding="utf-8")
assert "#![deny(unsafe_code)]" in (root / "src/lib.rs").read_text(encoding="utf-8")
assert "#![forbid(unsafe_code)]" in (root / "build.rs").read_text(encoding="utf-8")
print("Unsafe policy: one reviewed Windows COM boundary; zero elsewhere")
