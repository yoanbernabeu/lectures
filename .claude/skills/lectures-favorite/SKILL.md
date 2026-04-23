---
name: lectures-favorite
description: "Bascule le champ `favorite` d'un livre de public/data/books.json (site lectures.yoandev.co) à partir de son titre en langage naturel. Utilise cette skill dès que l'utilisateur veut ajouter un livre à ses favoris, retirer un livre de ses favoris, marquer un livre comme favori, enlever l'étoile d'un livre, ou gérer sa liste de favoris — même s'il ne mentionne pas explicitement le fichier books.json. À utiliser uniquement depuis le repo ~/YoanDev/lectures."
---

# lectures-favorite — Ajout / retrait d'un livre dans les favoris

Cette skill met à jour le champ booléen `favorite` d'un livre dans `public/data/books.json`. Elle gère **les deux sens** : ajout (`--add`) et retrait (`--remove`). L'opération est **idempotente** — si l'état demandé est déjà celui du livre, le script ne touche pas au fichier.

L'utilisateur donne un titre en langage naturel (parfois approximatif, avec ou sans accents). La skill s'occupe de trouver le bon livre, d'écrire le JSON, et de proposer un commit + push.

## Préconditions

- Travailler depuis le repo : `pwd` doit être sous `~/YoanDev/lectures`.
- Python 3 disponible (aucune dépendance externe).

## Workflow

### Étape 1 — Lancer le script avec la bonne intention

Choisis `--add` si l'utilisateur veut marquer le livre comme favori, `--remove` s'il veut le retirer :

```bash
# Ajout
python3 .claude/skills/lectures-favorite/scripts/toggle_favorite.py --add "<titre>"

# Retrait
python3 .claude/skills/lectures-favorite/scripts/toggle_favorite.py --remove "<titre>"
```

Le script fait toute la recherche (insensible à la casse et aux accents, substring match), applique l'intention demandée et réécrit `books.json` en préservant le formatage 2-espaces + caractères UTF-8 non échappés.

### Étape 2 — Interpréter le code de sortie

| Code | Cas | Ce que la skill doit faire |
| ---- | --- | -------------------------- |
| `0`  | Changement appliqué | Passer à l'étape 3 (proposer commit) |
| `1`  | Livre non référencé | Indiquer à l'utilisateur que le livre n'est pas dans `books.json` et s'arrêter. Ne propose **pas** d'ajouter le livre — c'est le rôle de `lectures-sync`. |
| `2`  | Plusieurs candidats | Afficher la liste imprimée par le script, demander à l'utilisateur lequel il vise, puis rappeler avec `--id <id>` (en conservant `--add` ou `--remove`). |
| `3`  | Erreur d'usage / fichier | Corriger l'appel, ne pas insister. |
| `4`  | No-op (état déjà conforme) | Le signaler à l'utilisateur (ex : "Dune était déjà dans tes favoris, rien à faire"). **Ne propose pas de commit**, il n'y a rien à commiter. |

### Étape 3 — Proposer le commit + push (uniquement si code 0)

Montre à l'utilisateur le changement (le script l'affiche déjà : `favorite: false → true` ou l'inverse), puis demande s'il veut **commiter et pusher**.

Choisis le message selon le sens du changement :

- ajout : `⭐ Ajouter "<titre>" aux favoris`
- retrait : `🗑️ Retirer "<titre>" des favoris`

Commit + push si l'utilisateur valide :

```bash
git add public/data/books.json \
  && git commit -m "⭐ Ajouter \"<titre>\" aux favoris" \
  && git push
```

Si l'utilisateur refuse le push, arrête-toi là : le fichier est déjà modifié, il fera ce qu'il veut avec.

## Cas d'usage

### Cas nominal (1 match)

```
Utilisateur : "ajoute Dune dans mes favoris"
→ script --add "Dune" → 1 match → favorite passe à true (code 0)
→ proposer commit "⭐ Ajouter \"Dune\" aux favoris" + push
```

### Déjà dans l'état demandé (no-op)

```
Utilisateur : "ajoute Dune dans mes favoris"
→ script --add "Dune" → code 4 (déjà favori)
→ informer l'utilisateur : "Dune est déjà dans tes favoris, rien à faire."
→ ne rien commiter
```

### Ambiguïté (plusieurs matches)

```
Utilisateur : "ajoute Fondation aux favoris"
→ script --add "Fondation" → code 2 → 3 matches (Tome 1, Tome 2, Tome 3)
→ afficher la liste produite par le script (avec id et état ⭐ actuel)
→ demander lequel il vise
→ rappeler : script --add --id <id>
```

Exception : si l'utilisateur a déjà précisé dans son message initial (ex : "ajoute Fondation tome 2"), tente d'abord une recherche plus précise (`"Fondation (Tome 2)"`), et seulement si ça rate, demande.

### Livre absent (0 match)

```
Utilisateur : "ajoute Cryptonomicon aux favoris"
→ script --add "Cryptonomicon" → code 1
→ informer : "Cryptonomicon n'est pas référencé dans books.json."
→ ne pas proposer d'ajouter le livre ni de lancer lectures-sync
```

Si tu sens une faute de frappe évidente, tu peux retenter une seule fois avec une correction. Pas de fishing expedition au-delà.

## Principes

- **Un seul point d'entrée** : le script. Ne réécris pas `books.json` à la main avec Edit — tu risques de casser le formatage ou l'ordre des clés. Le script préserve tout.
- **Intention explicite** : toujours passer `--add` ou `--remove`. Ne pas réinterpréter : si l'utilisateur dit "ajoute", c'est `--add`, même si le livre est peut-être déjà favori — c'est le script qui détectera le no-op (code 4) et tu pourras l'en informer.
- **Push explicite** : toujours demander avant de push, même si le diff paraît trivial. L'utilisateur peut vouloir grouper avec d'autres changements en cours.
