#!/usr/bin/env python3
"""Configure only the trip's Edge secrets and public GitHub Actions variables."""

import argparse
import os
from pathlib import Path
import secrets
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--origin", action="append", required=True)
    parser.add_argument("--public-env", type=Path, default=Path(".env.local"))
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="thailand-config-") as directory:
        path = Path(directory) / "functions.env"
        descriptor = os.open(path, os.O_CREAT | os.O_WRONLY, 0o600)
        with os.fdopen(descriptor, "w") as file:
            file.write(
                f"THAILAND_SHARED_ACCOUNT_EMAIL={args.email}\n"
                f"THAILAND_ALLOWED_ORIGINS={','.join(args.origin)}\n"
                f"THAILAND_LOGIN_HMAC_SECRET={secrets.token_urlsafe(48)}\n"
            )
        subprocess.run(
            ["supabase", "secrets", "set", "--project-ref", args.project_ref, "--env-file", str(path)],
            check=True,
        )
    fields = dict(
        line.split("=", 1)
        for line in args.public_env.read_text().splitlines()
        if line.startswith("VITE_SUPABASE_") and "=" in line
    )
    for name in ("VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"):
        if name not in fields:
            raise RuntimeError(f"Missing {name} in the public environment file.")
        subprocess.run(
            ["gh", "variable", "set", name, "--repo", args.repository],
            input=fields[name], text=True, check=True,
        )
    print("Trip function secrets and public Pages variables configured.")


if __name__ == "__main__":
    main()
