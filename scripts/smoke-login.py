#!/usr/bin/env python3
from __future__ import annotations

import argparse
import http.cookiejar
import urllib.parse
import urllib.request
from html.parser import HTMLParser


class LoginFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_form = False
        self.fields: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "form":
            self.in_form = True
            return
        if self.in_form and tag == "input":
            name = values.get("name")
            if name and values.get("type", "").lower() == "hidden":
                self.fields[name] = values.get("value") or ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "form":
            self.in_form = False


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

    form.fields.update({"email": args.email, "password": args.password})
    request = urllib.request.Request(
        f"{base_url}/login",
        data=urllib.parse.urlencode(form.fields).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with opener.open(request, timeout=30) as response:
        final_url = response.geturl()
        body = response.read().decode("utf-8")

    if not urllib.parse.urlparse(final_url).path.startswith("/dashboard"):
        raise SystemExit(f"Login did not reach the dashboard: {final_url}")
    if not any(cookie.name == "nfrp_portfolio_session" for cookie in cookie_jar):
        raise SystemExit("The session cookie was not stored by the HTTP client.")
    if "Dashboard" not in body and "Centro" not in body:
        raise SystemExit("Authenticated dashboard content was not returned.")

    print("Authenticated login smoke test passed.")


if __name__ == "__main__":
    main()
