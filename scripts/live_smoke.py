#!/usr/bin/env python3
"""Verify deployed trip APIs without printing tokens or private itinerary data."""

import argparse
import getpass
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-env", type=Path, default=Path(".env.local"))
    parser.add_argument("--password-file", type=Path)
    parser.add_argument("--remove-password-file", action="store_true")
    parser.add_argument("--initialize-from", type=Path)
    parser.add_argument("--session-output", type=Path)
    parser.add_argument("--origin", default="https://minoplay.github.io")
    args = parser.parse_args()
    fields = dict(
        line.split("=", 1) for line in args.public_env.read_text().splitlines()
        if line.startswith("VITE_SUPABASE_") and "=" in line
    )
    base = fields["VITE_SUPABASE_URL"]
    key = fields["VITE_SUPABASE_PUBLISHABLE_KEY"]
    token = key

    def request(path, method="GET", body=None, raw=None, content_type="application/json", expected=(200,)):
        payload = raw if raw is not None else json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            base + path, data=payload, method=method,
            headers={"apikey": key, "Authorization": f"Bearer {token}", "Origin": args.origin,
                     "Content-Type": content_type, "Prefer": "return=representation"},
        )
        try:
            response = urllib.request.urlopen(req, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            text = response.read().decode()
            data = json.loads(text) if text else None
            if response.status not in expected:
                # Do not echo arbitrary backend bodies that could contain private row data.
                code = data.get("code", "") if isinstance(data, dict) else ""
                raise RuntimeError(f"{method} {path.split('?')[0]} returned {response.status} ({code}). Check Supabase logs.")
            return data

    anonymous = request("/rest/v1/thailand_trips?select=id", expected=(200, 401, 403))
    if isinstance(anonymous, list) and anonymous:
        raise RuntimeError("Anonymous trip access was not denied.")
    if args.password_file:
        if os.name == "posix" and args.password_file.stat().st_mode & 0o077:
            raise RuntimeError("The password file must be readable only by its owner.")
        password = args.password_file.read_text().removesuffix("\n")
    else:
        password = getpass.getpass("Shared trip password: ")
    session = request("/functions/v1/thailand-shared-login", "POST", {"password": password})
    del password
    if args.password_file and args.remove_password_file:
        args.password_file.unlink()
    token = session["access_token"]
    if args.initialize_from:
        private = json.loads(args.initialize_from.read_text())
        payload = {
            "p_title": private["title"], "p_start_date": private["start_date"], "p_end_date": private["end_date"],
            "p_timezone": private.get("timezone", "Asia/Bangkok"),
            "p_items": private.get("items", []), "p_tasks": private.get("tasks", []), "p_notes": private.get("notes", []),
        }
        request("/rest/v1/rpc/thailand_initialize_trip", "POST", payload)
    trips = request("/rest/v1/thailand_trips?select=id")
    if len(trips) != 1:
        raise RuntimeError("Expected exactly one authorized shared trip.")
    trip_id = trips[0]["id"]
    item = request("/rest/v1/thailand_itinerary_items", "POST", {
        "trip_id": trip_id, "type": "activity", "title": f"Deployment smoke check {uuid.uuid4()}",
    }, expected=(201,))[0]
    attachment = None
    try:
        updated = request(f"/rest/v1/thailand_itinerary_items?id=eq.{item['id']}&version=eq.{item['version']}",
                          "PATCH", {"preparation": "ready"})[0]
        stale = request(f"/rest/v1/thailand_itinerary_items?id=eq.{item['id']}&version=eq.{item['version']}",
                        "PATCH", {"preparation": "done"})
        if stale:
            raise RuntimeError("A stale update unexpectedly succeeded.")
        item = updated
        attachment_id = str(uuid.uuid4())
        path = f"{trip_id}/{attachment_id}/smoke.pdf"
        document = b"%PDF-1.4\n% Deployment smoke check\n%%EOF\n"
        attachment = request("/rest/v1/thailand_attachments", "POST", {
            "id": attachment_id, "trip_id": trip_id, "item_id": item["id"], "name": "smoke.pdf",
            "path": path, "mime_type": "application/pdf", "size": len(document), "status": "uploading",
        }, expected=(201,))[0]
        request("/storage/v1/object/thailand-documents/" + path, "POST", raw=document, content_type="application/pdf")
        attachment = request(f"/rest/v1/thailand_attachments?id=eq.{attachment['id']}&version=eq.{attachment['version']}",
                             "PATCH", {"status": "ready"})[0]
        signed = request("/storage/v1/object/sign/thailand-documents/" + path, "POST", {"expiresIn": 30})
        if not signed.get("signedURL"):
            raise RuntimeError("Storage did not issue a signed download URL.")
        result = request("/functions/v1/thailand-delete-content", "POST", {"table": "attachments", "id": attachment["id"], "version": attachment["version"]})
        if not result.get("ok"):
            raise RuntimeError("Attachment deletion was not confirmed.")
        attachment = None
    finally:
        if attachment:
            request("/functions/v1/thailand-delete-content", "POST", {"table": "attachments", "id": attachment["id"], "version": attachment["version"]})
        result = request("/functions/v1/thailand-delete-content", "POST", {"table": "itinerary_items", "id": item["id"], "version": item["version"]})
        if not result.get("ok"):
            raise RuntimeError("Smoke item cleanup was not confirmed.")
    if args.session_output:
        descriptor = os.open(args.session_output, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w") as file:
            json.dump(session, file)
    print("Live login, private initialization/read/write, stale-update rejection, upload, signed URL, and deletion verified.")


if __name__ == "__main__":
    main()
