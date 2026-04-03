#!/usr/bin/env python3

import argparse
import json
import os
import sys


def parse_args():
    parser = argparse.ArgumentParser(description="Send supported-agents sync summary to Feishu/Lark.")
    parser.add_argument("--summary-json", required=True, help="Path to summary JSON produced by sync-supported-agents.js")
    parser.add_argument("--repo", default=os.getenv("GITHUB_REPOSITORY", ""), help="GitHub repository name")
    parser.add_argument("--pr-url", default="", help="Pull request URL")
    parser.add_argument("--commit-url", default="", help="Commit URL")
    parser.add_argument("--run-url", default="", help="GitHub Actions run URL")
    parser.add_argument("--mode", default="pr", help="Workflow mode: direct / pr / notify")
    parser.add_argument("--title", default="skillmanager upstream agent sync", help="Card title")
    return parser.parse_args()


def build_markdown(summary, repo, pr_url, commit_url, run_url, mode):
    lines = [
        f"# {repo or 'skillmanager'} upstream agent sync",
        "",
        f"- Mode: `{mode}`",
        f"- Retrieved at: `{summary.get('retrievedAt', '-')}`",
        f"- Changed: `{summary.get('changed', False)}`",
        f"- Added: `{summary.get('counts', {}).get('added', 0)}`",
        f"- Removed: `{summary.get('counts', {}).get('removed', 0)}`",
        f"- Updated: `{summary.get('counts', {}).get('updated', 0)}`",
    ]

    added = summary.get("added", [])
    removed = summary.get("removed", [])
    updated = summary.get("updated", [])

    if added:
        lines.extend(["", "## Added", ""])
        for item in added:
            lines.append(
                f"- `{item['id']}`: `{item['projectPath']}` | `{item['globalPath']}`"
            )

    if removed:
        lines.extend(["", "## Removed", ""])
        for item in removed:
            lines.append(f"- `{item['id']}`")

    if updated:
        lines.extend(["", "## Updated", ""])
        for item in updated:
            changed_keys = ", ".join(item.get("changes", {}).keys())
            lines.append(f"- `{item['id']}`: {changed_keys}")

    if pr_url:
        lines.extend(["", f"- PR: {pr_url}"])
    if commit_url:
        lines.extend(["", f"- Commit: {commit_url}"])
    if run_url:
        lines.extend(["", "- Action Run: " + run_url])

    return "\n".join(lines)


def main():
    args = parse_args()

    app_id = os.getenv("LARK_APP_ID", "").strip()
    app_secret = os.getenv("LARK_APP_SECRET", "").strip()
    chat_id = os.getenv("LARK_CHAT_ID", "").strip()
    user_open_id = os.getenv("LARK_USER_OPEN_ID", "").strip()

    if not (app_id and app_secret) or not (chat_id or user_open_id):
        print("Lark env vars are not fully configured; skip notification.", file=sys.stderr)
        return 0

    try:
        from pywayne.lark_bot import LarkBot
    except Exception as exc:
        print(f"pywayne.lark_bot import failed: {exc}", file=sys.stderr)
        return 0

    with open(args.summary_json, "r", encoding="utf-8") as f:
        summary = json.load(f)

    bot = LarkBot(app_id=app_id, app_secret=app_secret)
    md_text = build_markdown(summary, args.repo, args.pr_url, args.commit_url, args.run_url, args.mode)
    if chat_id:
        bot.send_markdown_to_chat(
            chat_id=chat_id,
            md_text=md_text,
            title=args.title,
            prefer="card_v2",
        )
    else:
        bot.send_text_to_user(user_open_id=user_open_id, text=md_text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
