---
name: lectures-sync
description: "Synchronise les lectures Babelio de l'utilisateur vers public/data/books.json du site lectures.yoandev.co. Utilise cette skill dès que l'utilisateur dit qu'il veut mettre à jour son journal de lecture, ajouter des livres récents, importer ses dernières lectures depuis Babelio, synchroniser sa bibliothèque, ou faire un point sur les nouveaux livres lus / en cours / à lire / abandonnés. Remplace le parcours manuel via /admin (recherche Google Books + JSON download + copier-coller). À utiliser uniquement depuis le repo ~/YoanDev/lectures."
---

# lectures-sync — Synchronisation Babelio → books.json

Cette skill remplace le parcours manuel d'ajout de livres via `/admin`. Elle pull les étagères Babelio de l'utilisateur, calcule le diff avec `public/data/books.json`, puis ajoute / met à jour les livres **un par un avec validation interactive**.

L'objectif est de garder l'humain dans la boucle pour les choix qualitatifs (quel volume Google Books correspond, quels genres, quelle critique), tout en automatisant la mécanique pénible (fetch, dédoublonnage, recherche, écriture du JSON).

## Préconditions

1. Travailler depuis le repo : `cd ~/YoanDev/lectures` (ou vérifier que `pwd` est dans le repo).
2. Session Babelio active. Vérifie systématiquement avec `babeliocli whoami`. Si la commande retourne une erreur ou si un appel ultérieur retourne `HTTP 403` / `session expired`, demande à l'utilisateur de rejouer `babeliocli login` (ou de réimporter ses cookies via `babeliocli session import` s'il est en SSO Google/Facebook). Ne tente pas de faire le login toi-même.
3. Node.js disponible (`node --version`) — utilisé par le script de diff.

## Workflow

### Étape 1 — Diff Babelio ↔ local

```bash
node .claude/skills/lectures-sync/scripts/diff.mjs
```

Ce script aggrège les 4 étagères (`lus`, `en-cours`, `a-lire`, `abandonnes`), dédoublonne, et compare à `public/data/books.json`. Il retourne un JSON :

```json
{
  "summary": { "babelio_total": N, "local_total": M, "to_add": X, "to_update": Y, "shelves": [...] },
  "to_add":    [ { "babelio": {...}, "mappedStatus": "...", "mappedAbandoned": bool } ],
  "to_update": [ { "babelio": {...}, "local": { "id", "title" }, "changes": { ... } } ]
}
```

Le matching local ↔ Babelio se fait d'abord sur `babelioBookId`, sinon sur `(titre normalisé, premier auteur normalisé)`. La première synchro va donc trouver beaucoup d'`updates` simplement pour backfiller `babelioBookId` — c'est normal et attendu.

Sauvegarde la sortie dans une variable bash ou redirige vers un fichier temporaire (`/tmp/lectures-diff.json`) pour pouvoir la requêter avec `jq` plusieurs fois sans relancer le script.

### Étape 2 — Présenter le diff à l'utilisateur

Annonce-lui les chiffres globaux et propose de commencer. Trie les `to_add` par `read_end` décroissant (les livres récemment lus d'abord — ce sont les plus intéressants à enrichir).

```bash
jq '.to_add | sort_by(.babelio.read_end // "0000") | reverse' /tmp/lectures-diff.json
```

### Étape 3 — Boucle d'ajout (livre par livre)

Pour chaque livre dans `to_add` :

#### 3.a — Recherche Google Books

```bash
TITLE="Le gouffre infini"
AUTHOR="Marta Randall"
curl -sG "https://www.googleapis.com/books/v1/volumes" \
  --data-urlencode "q=intitle:\"$TITLE\"+inauthor:\"$AUTHOR\"" \
  --data-urlencode "maxResults=5" \
  --data-urlencode "langRestrict=fr" \
  | jq '.items[] | { id, title: .volumeInfo.title, authors: .volumeInfo.authors, publisher: .volumeInfo.publisher, year: .volumeInfo.publishedDate, lang: .volumeInfo.language, hasImage: (.volumeInfo.imageLinks != null) }'
```

Récupère le top candidat (premier résultat). Vérifie qu'il a une couverture (`hasImage: true`) — sinon préfère le suivant qui en a une. Si la liste est vide, retire le `langRestrict=fr` et réessaie.

#### 3.b — Validation utilisateur

Présente le candidat (titre, auteur, éditeur, année, image) puis utilise `AskUserQuestion` avec ces options :

- **Valider** : accepte le candidat, on continue
- **Voir les autres résultats** : affiche les 4 suivants pour qu'il choisisse
- **Saisir un googleBooksId** : il colle un ID manuellement (ex: récupéré depuis books.google.fr)
- **Fallback OpenLibrary** : passe à 3.c
- **Skip** : on saute ce livre (mémorise dans une liste pour le récap final)

#### 3.c — Fallback OpenLibrary

Si Google Books n'a rien de bon :

```bash
curl -s "https://openlibrary.org/search.json?title=$(printf %s "$TITLE" | jq -sRr @uri)&author=$(printf %s "$AUTHOR" | jq -sRr @uri)&limit=3" \
  | jq '.docs[] | { key, title, author: .author_name, cover_i, first_publish_year }'
```

La couverture s'obtient via :
```
https://covers.openlibrary.org/b/id/<cover_i>-L.jpg
```

La description (si dispo) se récupère par un second call sur la `key` :
```bash
curl -s "https://openlibrary.org$KEY.json" | jq '.description'
```

Présente les résultats, fais valider à l'utilisateur. Si OK, le `googleBooksId` du livre sera `local:openlibrary:<key>` et l'`imageUrl` pointera sur covers.openlibrary.org.

#### 3.d — Fallback ultime (Babelio + OpenLibrary cover)

Si OpenLibrary ne donne rien non plus, on construit la fiche à partir des données Babelio :

```bash
babeliocli book "<book_url_path>"
# retourne synopsis, publisher, pages, avg_rating, nb_ratings
```

Babelio n'expose pas de cover URL via la CLI — utilise OpenLibrary uniquement pour la couverture (recherche par titre+auteur) ou laisse `imageUrl: ""`. Le `googleBooksId` sera `local:babelio:<book_id>`.

#### 3.e — Genres

Récupère le vocabulaire actuel des genres pour rester cohérent :

```bash
jq '[.books[].genres[]?] | unique' public/data/books.json
```

Le vocabulaire est volontairement pauvre (à l'écriture : `business`, `non-fiction`, `self-help`, `tech`). Pour les fictions, propose des nouveaux genres pertinents (`sci-fi`, `fantasy`, `polar`, `roman`, `bd`, `essai`, `poesie`…) en restant dans des libellés courts en kebab-case français/anglais courts.

Analyse le titre + description + auteur, propose 1 à 3 genres, et utilise `AskUserQuestion` pour faire valider/corriger. Ne propose **jamais** de genres sans demander : l'utilisateur a tenu à garder un contrôle qualité ici.

#### 3.f — Critique perso (optionnel)

Si la critique de l'utilisateur sur Babelio existe, on la récupère. Le user_id est récupérable via :

```bash
YOAN_ID=$(babeliocli whoami | jq -r .id_user)
```

Puis pour un livre donné :

```bash
babeliocli reviews "<book_url_path>" --limit 100 \
  | jq --arg uid "$YOAN_ID" '.reviews[] | select(.author_url | contains("id_user=" + $uid))'
```

Si une critique est trouvée, mappe son `body` dans `comment`. Sinon laisse `comment: null`.

Note : les critiques personnelles ne sont remontées que pour les livres présents dans la shelf `critiques` côté Babelio. Pour gagner du temps, ne lance le call `reviews` que si l'utilisateur le demande explicitement OU si la requête est rapide. Pour la première synchro massive, propose de skipper systématiquement les critiques (et on les remontera plus tard à la demande).

#### 3.g — Construire l'objet Book et écrire

Schéma cible (`src/types/book.ts`) :

```ts
{
  id: string;                  // UUID v4 — utilise crypto.randomUUID() ou `uuidgen | tr A-Z a-z`
  googleBooksId: string;       // ID Google Books, OU "local:openlibrary:<key>", OU "local:babelio:<book_id>"
  babelioBookId?: string;      // book_id Babelio (toujours renseigné par cette skill)
  status: 'reading' | 'finished' | 'to-read';
  genres?: string[];
  startDate?: string;          // YYYY-MM-DD
  endDate?: string;            // YYYY-MM-DD
  rating?: number | null;      // 0-5, null si non noté
  comment?: string | null;
  abandoned?: boolean;
  favorite?: boolean;          // pas dans Babelio, garde false par défaut
  title: string;
  authors: string[];
  imageUrl?: string;
  description?: string;
}
```

Écris l'objet directement dans `public/data/books.json` avec `jq` — **après chaque livre validé, pas en batch** :

```bash
NEW_BOOK_JSON='{ ...l'objet construit... }'
jq --argjson book "$NEW_BOOK_JSON" '.books += [$book]' public/data/books.json > /tmp/books.json.new \
  && mv /tmp/books.json.new public/data/books.json
```

Cette stratégie d'écriture immédiate garantit qu'en cas de crash / interruption en plein milieu d'une session de 50 livres, l'utilisateur ne perd pas tout son travail validé.

#### 3.h — Populer le cache Google Books

Le site utilise `src/data/google-books-cache.json` comme **source unique** des métadonnées Google Books (le build ne fait plus d'appel API). Dès qu'on ajoute un livre avec un vrai `googleBooksId` (non préfixé par `local:`), il faut ajouter une entrée dans ce cache — sinon la page détail sera dégradée jusqu'au prochain `npm run cache:refresh`.

Deux options :

**Option A (simple, recommandée)** : en fin de session, lancer une fois le script qui fetche tous les IDs manquants :

```bash
npm run cache:refresh
```

Le script ne fetche que les IDs absents du cache (ou ceux marqués `null` sans raison `local-id`). Rapide si on a ajouté 1-2 livres.

**Option B (atomique, dans la boucle `add_book`)** : juste après l'écriture du livre dans `books.json`, populer l'entrée directement. Recommandé pour les sessions de 20+ livres où tu veux éviter un long refresh final :

```bash
populate_cache_for_id() {
  local ID="$1"
  # Pas de fetch pour les IDs "local:"
  if [[ "$ID" == local:* ]]; then
    jq --arg id "$ID" --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '.entries[$id] = { data: null, fetchedAt: $now, reason: "local-id" }' \
      src/data/google-books-cache.json > /tmp/cache.new && mv /tmp/cache.new src/data/google-books-cache.json
    return
  fi
  local VOL=$(rtk proxy curl -s "https://www.googleapis.com/books/v1/volumes/$ID")
  local ENTRY=$(echo "$VOL" | jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{
    data: (if .volumeInfo then {
      title: (.volumeInfo.title // ""),
      authors: (.volumeInfo.authors // []),
      description: .volumeInfo.description,
      publisher: .volumeInfo.publisher,
      publishedDate: .volumeInfo.publishedDate,
      pageCount: .volumeInfo.pageCount,
      imageLinks: ((.volumeInfo.imageLinks // {}) | with_entries(.value |= (gsub("^http://"; "https://") | gsub("&zoom=\\d"; "&zoom=3") | gsub("&img=\\d"; "&img=1"))))
    } else null end),
    fetchedAt: $now
  }')
  jq --arg id "$ID" --argjson entry "$ENTRY" \
    '.entries[$id] = $entry' \
    src/data/google-books-cache.json > /tmp/cache.new && mv /tmp/cache.new src/data/google-books-cache.json
}

# À appeler immédiatement après chaque add_book :
populate_cache_for_id "$GOOGLE_BOOKS_ID"
```

Pour une session de sync classique avec moins de 10 livres ajoutés, l'option A suffit : finir tous les ajouts, puis `npm run cache:refresh`.

### Étape 4 — Boucle d'updates

Pour `to_update`, applique automatiquement (sans demander) :

- `babelioBookId` (backfill — c'est le but principal du premier passage)
- `rating` Babelio si `local.rating` est null/0
- `startDate`/`endDate` si manquants côté local

Demande explicitement avant d'appliquer :

- Changement de `status` (ex: `reading` → `finished`)
- Changement de `abandoned` (ex: `false` → `true`)

Pour ces changements majeurs, présente le résumé et utilise `AskUserQuestion` (Appliquer / Skip / Modifier autrement).

Pour appliquer un patch sur un livre existant identifié par son `id` local :

```bash
jq --arg id "$LOCAL_ID" --argjson patch "$PATCH" \
  '.books = [.books[] | if .id == $id then . + $patch else . end]' \
  public/data/books.json > /tmp/books.json.new && mv /tmp/books.json.new public/data/books.json
```

### Étape 5 — Récap final

Si tu as utilisé l'option A de l'étape 3.h (cache non populé à la volée), **lance maintenant** :

```bash
npm run cache:refresh
```

Cela remplit `src/data/google-books-cache.json` pour tous les IDs ajoutés pendant la session. Sans ça, les pages détail des nouveaux livres afficheront uniquement les infos de `books.json` (image fallback, description null), pas les métadonnées Google Books (publisher, description longue, pageCount).

Puis affiche :
- Nombre de livres ajoutés
- Nombre de livres mis à jour
- Liste des livres skippés ou en erreur (avec raison)
- Suggestion : `npm run dev` pour vérifier visuellement, puis `git diff public/data/books.json src/data/google-books-cache.json` pour relire avant commit (**les deux fichiers doivent être commités ensemble**)

## Conventions importantes

- **Statut "abandonné"** : c'est `status: "finished"` + `abandoned: true`. Pas de statut dédié — c'est ce que l'app attend déjà.
- **`crypto.randomUUID()`** est la convention pour les nouveaux IDs (les anciens livres avaient des IDs numériques séquentiels, mais le code admin a basculé sur UUID).
- **Image URL** : pour les fiches Google Books, garde l'URL d'origine non-rewritée — la fonction `fetchGoogleBooksData` du build force déjà la meilleure qualité (`zoom=3`, `img=1`, `https://`). Pour les fallbacks, utilise l'URL OpenLibrary directement.
- **`description`** : Google Books renvoie souvent du HTML (`<p>`, `<b>`…). Le template Astro `set:html` le rend tel quel — garde le HTML, ne le transforme pas en texte plat.
- **Sauvegarde du JSON** : c'est un fichier critique. Avant la première synchro massive, propose à l'utilisateur de faire un `git stash --include-untracked` ou simplement de vérifier que `git status` est propre, pour qu'un revert reste trivial.

## Gotchas

- **Session Babelio courte** : les sessions expirent vite (HTTP 403 après quelques jours). Le script `diff.mjs` détecte ce cas et exit 2 avec un message clair. Si ça arrive en plein milieu, demande à l'utilisateur de rejouer `babeliocli login` puis relance la skill — le travail déjà écrit est conservé.
- **Doublons via éditions différentes** : Babelio a un `book_id` par édition. Si l'utilisateur a "Hyperion poche 2005" et "Hyperion édition 2020" dans sa bibliothèque, ce sont 2 entrées Babelio mais probablement la même œuvre. Le matching titre+auteur normalisé devrait les dédoublonner côté local, mais préviens si tu détectes deux candidats Babelio qui mappent à un même livre local.
- **Livres sans `read_end`** : statut `Lu` sans date de fin = l'utilisateur a juste oublié la date. N'invente pas de date — laisse `endDate` vide.
- **Fictions vs essais** : la base actuelle penche fortement non-fiction (4 genres seulement). L'utilisateur ajoute beaucoup de SF/fantasy maintenant — propose des genres `sci-fi`, `fantasy`, `space-opera`, `dystopie` quand c'est pertinent.

## Pourquoi on fait ça comme ça (théorie de l'esprit)

L'utilisateur a un journal de lecture qu'il tient depuis des années sur Babelio. Il l'a déjà rempli là-bas (statut, dates, notes, parfois critiques). Le site `lectures.yoandev.co` est sa vitrine personnelle, mais le tenir à jour à la main via `/admin` était devenu une corvée — au point qu'il a 92 livres de retard.

L'idée n'est donc pas de remplacer Babelio (c'est sa source de vérité pour les dates/notes) mais d'utiliser Babelio comme **input** et de générer le `books.json` du site comme **output**. Lui ne devrait avoir qu'à valider les choix qualitatifs (image, genres, critique).

C'est aussi pour ça que **l'écriture est immédiate après chaque livre** : même si la session se coupe à la 30e validation, les 30 livres sont sauvés. Pas de batch fin de course qui peut tout perdre.

Le fallback à 3 niveaux pour les métadonnées (Google Books → OpenLibrary → Babelio) existe parce que beaucoup de SF traduite en français n'a pas de bonne fiche Google Books. Ne saute pas trop vite au fallback : Google Books est généralement le meilleur choix pour la qualité de couverture et de description, c'est juste qu'il faut parfois aller chercher dans les 5 premiers résultats au lieu du 1er.
