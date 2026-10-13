"""Semicolon CSV with a BOM, so Excel in pt-BR opens it with accents and columns right."""

import csv
import io
from collections.abc import Iterable, Sequence

from fastapi.responses import StreamingResponse

EXPORT_LIMIT = 5000


def csv_response(filename: str, columns: Sequence[str], rows: Iterable[Sequence[object]]) -> StreamingResponse:
    def stream():
        buf = io.StringIO()
        writer = csv.writer(buf, delimiter=";")
        buf.write("\ufeff")
        writer.writerow(columns)
        for row in rows:
            writer.writerow(["" if v is None else v for v in row])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)
        yield buf.getvalue()

    return StreamingResponse(
        stream(), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
