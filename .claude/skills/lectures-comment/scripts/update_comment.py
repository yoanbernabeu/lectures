#!/usr/bin/env python3
"""
Met à jour le champ `comment` (et optionnellement `rating`) d'un livre dans public/data/books.json.

Usage:
    update_comment.py "<titre>" --comment "<texte>"
    update_comment.py "<titre>" --comment "<texte>" --rating 4
    update_comment.py --id <id>  --comment "<texte>" [--rating N]
    update_comment.py "<titre>" --clear-comment            # remet comment à null

Codes de sortie:
    0 : changement appliqué
    1 : livre non référencé
    2 : plusieurs candidats, désambiguation nécessaire (liste imprimée)
    3 : erreur d'usage / fichier
    4 : no-op (comment + rating déjà conformes — pas d'écriture)
"""
from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path


def normalize(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s)
    no_accents = "".join(c for c in nfkd if not unicodedata.combining(c))
    return no_accents.casefold().strip()


def find_books_json() -> Path:
    here = Path(__file__).resolve()
    repo = here.parents[4]
    target = repo / "public" / "data" / "books.json"
    if not target.exists():
        print(f"ERREUR: {target} introuvable.", file=sys.stderr)
        sys.exit(3)
    return target


def load(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save(path: Path, data: dict) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def search(books: list[dict], query: str) -> list[dict]:
    q = normalize(query)
    exact = [b for b in books if normalize(b.get("title", "")) == q]
    if exact:
        return exact
    return [b for b in books if q in normalize(b.get("title", ""))]


def print_candidates(matches: list[dict]) -> None:
    print(f"{len(matches)} livres correspondent — précisez avec --id <id>:")
    for b in matches:
        has_comment = "💬" if b.get("comment") else "  "
        rating = b.get("rating")
        rating_str = f"[{rating}/5]" if rating else "[—]"
        authors = ", ".join(b.get("authors", [])) or "?"
        print(f'  {has_comment} id={b["id"]:>4} {rating_str}  "{b.get("title", "?")}" — {authors}')


def preview(s: str | None, width: int = 80) -> str:
    if not s:
        return "∅ (vide)"
    s = s.replace("\n", " ")
    return s if len(s) <= width else s[: width - 1] + "…"


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("title", nargs="?", help="Titre (recherche insensible aux accents)")
    parser.add_argument("--id", dest="book_id", help="ID exact du livre")

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--comment", help="Nouveau texte de critique")
    group.add_argument(
        "--clear-comment", action="store_true", help="Remet comment à null"
    )

    parser.add_argument(
        "--rating",
        type=int,
        choices=range(1, 6),
        metavar="{1..5}",
        help="Note 1-5 (optionnel — ne touche pas au rating si omis)",
    )
    parser.add_argument(
        "--clear-rating", action="store_true", help="Remet rating à null"
    )

    args = parser.parse_args()

    if not args.title and not args.book_id:
        parser.print_help()
        return 3

    if args.rating is not None and args.clear_rating:
        print("ERREUR: --rating et --clear-rating sont mutuellement exclusifs.", file=sys.stderr)
        return 3

    path = find_books_json()
    data = load(path)
    books = data.get("books", [])

    if args.book_id:
        matches = [b for b in books if str(b.get("id")) == str(args.book_id)]
        if not matches:
            print(f"Aucun livre avec id={args.book_id}.")
            return 1
        target = matches[0]
    else:
        matches = search(books, args.title)
        if not matches:
            print(f'Livre non référencé : "{args.title}" ne matche aucun titre dans books.json.')
            return 1
        if len(matches) > 1:
            print_candidates(matches)
            return 2
        target = matches[0]

    new_comment = None if args.clear_comment else args.comment
    old_comment = target.get("comment")

    if args.rating is not None:
        new_rating = args.rating
        rating_changes = True
    elif args.clear_rating:
        new_rating = None
        rating_changes = True
    else:
        new_rating = target.get("rating")
        rating_changes = False

    old_rating = target.get("rating")

    comment_changes = (new_comment or None) != (old_comment or None)
    actually_rating_changes = rating_changes and new_rating != old_rating

    authors = ", ".join(target.get("authors", [])) or "?"
    print(f'"{target["title"]}" — {authors}')

    if not comment_changes and not actually_rating_changes:
        print("  Rien à changer (comment et rating déjà conformes).")
        return 4

    if comment_changes:
        print(f"  comment: {preview(old_comment)}")
        print(f"       →  {preview(new_comment)}")
        target["comment"] = new_comment
    if actually_rating_changes:
        print(f"  rating : {old_rating}  →  {new_rating}")
        target["rating"] = new_rating

    save(path, data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
