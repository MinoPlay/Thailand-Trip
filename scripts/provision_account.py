#!/usr/bin/env python3
"""Provision only the dedicated trip account, reusing Supabase CLI authentication."""

import argparse
import getpass
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request


def cli(*args):
    completed = subprocess.run(
        ["supabase", *args], check=True, capture_output=True, text=True
    )
    return json.loads(completed.stdout)


def create_account(project_ref, email, password, service_key):
    request = urllib.request.Request(
        f"https://{project_ref}.supabase.co/auth/v1/admin/users",
        data=json.dumps(
            {"email": email, "password": password, "email_confirm": True}
        ).encode(),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)["id"]
    except urllib.error.HTTPError as error:
        body = json.load(error)
        message = body.get("msg") or body.get("message") or "See Supabase Auth logs."
        raise RuntimeError(f"Account creation failed ({error.code}): {message}") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--email", required=True, help="Dedicated shared account only.")
    parser.add_argument("--password-file", type=Path)
    parser.add_argument("--remove-password-file", action="store_true")
    parser.add_argument("--public-env", type=Path, default=Path(".env.local"))
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z]{20}", args.project_ref):
        parser.error("Expected a 20-letter Supabase project reference.")
    if args.remove_password_file and not args.password_file:
        parser.error("--remove-password-file requires --password-file.")
    if args.password_file:
        if os.name == "posix" and args.password_file.stat().st_mode & 0o077:
            parser.error("The password file must be readable only by its owner (chmod 600).")
        password = args.password_file.read_text().removesuffix("\n")
    else:
        password = getpass.getpass("Shared trip password (not saved locally): ")
    if not password:
        parser.error("The password cannot be empty.")
    keys = cli("projects", "api-keys", "--project-ref", args.project_ref, "--output", "json")
    service_key = next((key["api_key"] for key in keys if key.get("name") == "service_role"), None)
    public_key = next((key["api_key"] for key in keys if key.get("name") == "anon"), None)
    if not service_key or not public_key:
        raise RuntimeError("The CLI did not return the required project API keys.")
    account_id = create_account(args.project_ref, args.email, password, service_key)
    if args.remove_password_file:
        args.password_file.unlink()
    descriptor = os.open(args.public_env, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as env:
        env.write(
            f"VITE_SUPABASE_URL=https://{args.project_ref}.supabase.co\n"
            f"VITE_SUPABASE_PUBLISHABLE_KEY={public_key}\n"
        )
    print(json.dumps({"account_id": account_id, "public_env": str(args.public_env)}))


if __name__ == "__main__":
    main()
