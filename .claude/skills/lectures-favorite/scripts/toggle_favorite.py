#!/usr/bin/env python3
"""
Bascule le champ `favorite` d'un livre dans public/data/books.json.

Usage:
    toggle_favorite.py --add "<titre>"       # met favorite=True (idempotent)
    toggle_favorite.py --remove "<titre>"    # met favorite=False (idempotent)
    toggle_favorite.py --add --id <id>       # via id exact
    toggle_favorite.py --remove --id <id>

Codes de sortie:
    0 : changement appliqué
    1 : livre non référencé
    2 : plusieurs candidats, désambiguation nécessaire (liste imprimée)
    3 : erreur d'usage / fichier
    4 : no-op (état déjà conforme — pas d'écriture)
"""
from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path


def normalize(s: str) -> str:
    """Casefold + strip diacritics for robust French matching."""
    nfkd = unicodedata.normalize("NFKD", s)
    no_accents = "".join(c for c in nfkd if not unicodedata.combining(c))
    return no_accents.casefold().strip()


def find_books_json() -> Path:
    # Le script vit dans .claude/skills/lectures-favorite/scripts/
    # books.json est à <repo>/public/data/books.json
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
    # Préserve le style 2-espaces + newline final, pas d'échappement ASCII
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
        fav = b.get("favorite", False)
        marker = "⭐" if fav else "  "
        authors = ", ".join(b.get("authors", [])) or "?"
        print(f'  {marker} id={b["id"]:>4}  "{b.get("title", "?")}" — {authors}')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--add", action="store_true", help="Marquer comme favori")
    action.add_argument("--remove", action="store_true", help="Retirer des favoris")
    parser.add_argument("title", nargs="?", help="Titre (recherche insensible aux accents)")
    parser.add_argument("--id", dest="book_id", help="ID exact du livre")
    args = parser.parse_args()

    if not args.title and not args.book_id:
        parser.print_help()
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

    target_state = bool(args.add)
    before = target.get("favorite", False)
    authors = ", ".join(target.get("authors", [])) or "?"

    if before == target_state:
        state_label = "déjà favori" if target_state else "déjà hors favoris"
        print(f'"{target["title"]}" — {authors}')
        print(f"  {state_label}, aucune modification.")
        return 4

    target["favorite"] = target_state
    save(path, data)

    verb = "ajouté aux favoris" if target_state else "retiré des favoris"
    print(f'"{target["title"]}" — {authors}')
    print(f"  favorite: {before} → {target_state}  ({verb})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
