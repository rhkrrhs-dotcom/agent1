from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8000"))
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")


class Handler(SimpleHTTPRequestHandler):
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

            if not text:
                self.send_json({"error": "번역할 내용이 비어 있습니다."}, 400)
                return

            translation = translate(api_key, text, target_language, tone)
            self.send_json({"translation": translation})
        except json.JSONDecodeError:
            self.send_json({"error": "요청 형식이 올바르지 않습니다."}, 400)
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            self.send_json({"error": f"OpenAI API 오류: {detail}"}, error.code)
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


def translate(api_key, text, target_language, tone):
    instructions = (
        "You are a careful business translator. Translate the user's text into "
        f"{target_language}. Use a {tone} tone. Preserve names, dates, task intent, "
        "line breaks, and bullet structure. Return only the translated text."
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
    print(f"Work Triage Board: http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
