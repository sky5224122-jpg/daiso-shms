"""승인 PDF 중 기존 doc-bodies.js에 없거나 복합 연결된 본문을 JSON으로 추출한다."""

from __future__ import annotations

import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "docs" / "documents"
OUTPUT = ROOT / "docs" / "seed" / "document_body_supplements.json"

SOURCE_FILES = {
    "AAD-HSHT-P-2022-007": "AAD-HSHT-P-2022-007(4)_기록관리 절차서_26_0827.pdf",
    "AAD-HSHT-P-2022-015": "AAD-HSHT-P-2022-015(3)_부적합사항 시정조치 절차서_26_0827.pdf",
    "AAD-HSHT-P-2026-010": "AAD-HSHT-P-2026-010(2)_도급용역위탁_안전보건_평가기준_및_관리_절차서.pdf",
    "AAD-HSHT-P-2026-025": "AAD-HSHT-P-2026-025(1)_건강진단_및_유해요인_관리_절차서.pdf",
    "AAD-HSHT-G-2026-014": "AAD-HSHT-G-2026-014(1)_직무스트레스_및_감정노동_보호_지침서.pdf",
    "AAD-HSHT-G-2026-020": "AAD-HSHT-G-2026-020(1)_지게차등_운반기계_안전_지침서.pdf",
    "AAD-HSHT-G-2026-024": "AAD-HSHT-G-2026-024(1)_화기전기고소작업_안전지침서.pdf",
}


def extract_text(path: Path) -> str:
    reader = PdfReader(str(path))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    # 앱 내 담당자 표기는 사용자가 확정한 최신 이름을 우선한다.
    text = re.sub(r"허\s*대\s*욱", "유준하", text)
    text = re.sub(r"류\s*은\s*아", "박윤하, 윤정인", text)
    text = "\n".join(line.rstrip() for line in text.splitlines())
    text = re.sub(r"\n{4,}", "\n\n\n", text).strip()
    return text


def main() -> None:
    result = {}
    for company_no, filename in SOURCE_FILES.items():
        path = PDF_DIR / filename
        if not path.is_file():
            raise FileNotFoundError(path)
        result[company_no] = {"file": filename, "body": extract_text(path)}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT} ({len(result)} documents)")


if __name__ == "__main__":
    main()
