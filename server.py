from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import csv
import json
import os
import re
import ssl
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8000"))
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
SHEET_CSV_URL = os.environ.get(
    "PROJECT_SHEET_CSV_URL",
    "https://docs.google.com/spreadsheets/d/1KYXN045UPgFDPARITozRtSCrJqQzcaWadPpUSdbBtFs/gviz/tq?tqx=out:csv&gid=0",
)


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/projects":
            try:
                self.send_json({"projects": load_songon_projects()})
            except Exception as error:
                self.send_json({"error": f"프로젝트 시트를 읽지 못했습니다: {error}"}, 502)
            return

        super().do_GET()

    def do_POST(self):
        if self.path != "/api/translate":
            self.send_json({"error": "Not found"}, 404)
            return

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            self.send_json({"error": "OPENAI_API_KEY를 먼저 설정하세요."}, 500)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            body = json.loads(raw_body)
            text = str(body.get("text", "")).strip()
            target_language = str(body.get("targetLanguage", "English")).strip()
            tone = str(body.get("tone", "business")).strip()
            detail = str(body.get("detail", "brief")).strip()

            if not text:
                self.send_json({"error": "번역할 내용이 비어 있습니다."}, 400)
                return

            translation = translate(api_key, text, target_language, tone, detail)
            self.send_json({"translation": translation})
        except json.JSONDecodeError:
            self.send_json({"error": "요청 형식이 올바르지 않습니다."}, 400)
        except HTTPError as error:
            self.send_json({"error": openai_error_message(error)}, error.code)
        except URLError as error:
            self.send_json({"error": f"네트워크 오류: {error.reason}"}, 502)
        except Exception as error:
            self.send_json({"error": f"번역 실패: {error}"}, 500)

    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def openai_error_message(error):
    detail = error.read().decode("utf-8", errors="replace")
    try:
        payload = json.loads(detail)
        api_error = payload.get("error", {})
        code = api_error.get("code")
        message = api_error.get("message", detail)
    except json.JSONDecodeError:
        code = ""
        message = detail

    if code == "insufficient_quota":
        return (
            "OpenAI API 사용 가능 한도가 부족합니다. "
            "Platform의 Billing/Usage에서 결제 수단, 크레딧, 프로젝트 한도를 확인한 뒤 서버를 다시 실행하세요."
        )

    return f"OpenAI API 오류: {message}"


def load_songon_projects():
    csv_text = fetch_text(SHEET_CSV_URL)
    rows = list(csv.reader(csv_text.splitlines()))
    if len(rows) < 3:
        return []

    dates = rows[0]
    start = find_songon_row(rows)
    end = len(rows)
    for index in range(start + 1, len(rows)):
        if rows[index] and rows[index][0].strip():
            end = index
            break

    projects = []
    for row in rows[start + 1 : end]:
        for column in range(1, len(dates), 3):
            sheet_date = cell(dates, column)
            if not sheet_date:
                continue

            manager = cell(row, column)
            title = cell(row, column + 1)
            deadline = cell(row, column + 2)
            if not (manager or title or deadline):
                continue

            sheet_iso = parse_sheet_date(sheet_date)
            deadline_iso = parse_deadline(deadline, sheet_iso)
            projects.append(
                {
                    "id": f"{sheet_iso or sheet_date}-{column}-{len(projects)}",
                    "date": sheet_date,
                    "dateIso": sheet_iso,
                    "manager": manager,
                    "title": title,
                    "deadline": deadline,
                    "deadlineIso": deadline_iso,
                    "category": detect_category(title),
                }
            )

    return sorted(projects, key=lambda item: item.get("dateIso") or "")


def fetch_text(url):
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8-sig")
    except URLError:
        context = ssl._create_unverified_context()
        with urlopen(request, timeout=30, context=context) as response:
            return response.read().decode("utf-8-sig")


def find_songon_row(rows):
    for index, row in enumerate(rows):
        first_cell = cell(row, 0).lower()
        if "сонгон" in first_cell or "songon" in first_cell or "성곤" in first_cell:
            return index
    raise ValueError("성곤/Сонгон 행을 찾을 수 없습니다.")


def cell(row, index):
    return row[index].strip() if index < len(row) else ""


def parse_sheet_date(value):
    match = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", value.strip())
    if not match:
        return ""
    day, month, year = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}"


def parse_deadline(value, fallback_date):
    match = re.match(r"^(\d{1,2})\.(\d{1,2})(?:\s+\d{1,2}:\d{2})?$", value.strip())
    if not match or not fallback_date:
        return ""
    day, month = match.groups()
    year = fallback_date.split("-", 1)[0]
    return f"{year}-{int(month):02d}-{int(day):02d}"


def detect_category(title):
    match = re.search(r"\[([^\]]+)\]", title or "")
    if match:
        return match.group(1)
    return "General"


def translate(api_key, text, target_language, tone, detail):
    detail_instruction = (
        "Return only the translated text, with no extra explanation."
        if detail == "brief"
        else (
            "Return the translated text first. Then add a short '메모:' section in Korean "
            "with 2-3 notes about tone, nuance, or wording choices."
        )
    )
    instructions = (
        "You are a careful business translator. Translate the user's text into "
        f"{target_language}. Use a {tone} tone. Preserve names, dates, task intent, "
        f"line breaks, and bullet structure. {detail_instruction}"
    )
    payload = {
        "model": MODEL,
        "input": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": text},
        ],
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urlopen(request, timeout=45) as response:
        result = json.loads(response.read().decode("utf-8"))

    if "output_text" in result:
        return result["output_text"].strip()

    chunks = []
    for item in result.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"}:
                chunks.append(content.get("text", ""))
    return "\n".join(chunks).strip()


if __name__ == "__main__":
    print(f"내 업무 에이전트: http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
