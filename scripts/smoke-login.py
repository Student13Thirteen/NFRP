#!/usr/bin/env python3
from __future__ import annotations

import argparse
import http.cookiejar
import secrets
import urllib.parse
import urllib.request
from html.parser import HTMLParser


class LoginFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_form = False
        self.fields: dict[str, str] = {}
        self.action = "/login"
        self.method = "POST"
        self.enctype = "multipart/form-data"

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "form":
            self.in_form = True
            self.action = values.get("action") or "/login"
            self.method = (values.get("method") or "POST").upper()
            self.enctype = values.get("enctype") or "multipart/form-data"
            return
        if self.in_form and tag == "input":
            name = values.get("name")
            if name and values.get("type", "").lower() == "hidden":
                self.fields[name] = values.get("value") or ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "form":
            self.in_form = False


def encode_multipart(fields: dict[str, str]) -> tuple[bytes, str]:
    boundary = f"----nfrp-smoke-{secrets.token_hex(16)}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), boundary


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify the real NFRP login flow with stdlib HTTP tools.")
    parser.add_argument("base_url")
    parser.add_argument("email")
    parser.add_argument("password")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

    with opener.open(f"{base_url}/login", timeout=20) as response:
        html = response.read().decode("utf-8")

    form = LoginFormParser()
    form.feed(html)
    if not any(name.startswith("$ACTION_") for name in form.fields):
        raise SystemExit("Login Server Action fields were not found.")
    if form.method != "POST":
        raise SystemExit(f"Unexpected login form method: {form.method}")
    if not form.enctype.startswith("multipart/form-data"):
        raise SystemExit(f"Unexpected login form encoding: {form.enctype}")

    form.fields.update({"email": args.email, "password": args.password})
    body_data, boundary = encode_multipart(form.fields)
    target_url = urllib.parse.urljoin(f"{base_url}/login", form.action)
    request = urllib.request.Request(
        target_url,
        data=body_data,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body_data)),
            "User-Agent": "NFRP-Clean-Room-Smoke/1.0",
        },
    )
    with opener.open(request, timeout=30) as response:
        final_url = response.geturl()
        body = response.read().decode("utf-8")

    final_path = urllib.parse.urlparse(final_url).path
    cookie_names = sorted(cookie.name for cookie in cookie_jar)
    if not final_path.startswith("/dashboard"):
        raise SystemExit(
            f"Login did not reach the dashboard: path={final_path}; cookies={cookie_names}"
        )
    if "nfrp_portfolio_session" not in cookie_names:
        raise SystemExit("The session cookie was not stored by the HTTP client.")
    if "Dashboard" not in body and "Centro" not in body:
        raise SystemExit("Authenticated dashboard content was not returned.")

    print("Authenticated login smoke test passed.")


if __name__ == "__main__":
    main()
