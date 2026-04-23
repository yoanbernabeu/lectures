---
name: lectures-comment
description: "Ajoute, remplace ou affine la critique (`comment`) d'un livre de public/data/books.json (site lectures.yoandev.co), en t'aidant à formaliser une courte critique via quelques questions adaptatives. Utilise cette skill dès que l'utilisateur veut commenter un livre, écrire une critique, noter ce qu'il a pensé d'un bouquin, rédiger un petit avis, raffiner / remplacer une critique existante, ou simplement dire deux mots sur sa lecture — même s'il ne mentionne pas explicitement `comment` ou `books.json`. Peut aussi mettre à jour la note (`rating` 1-5) dans la foulée. À utiliser uniquement depuis le repo ~/YoanDev/lectures."
---

# lectures-comment — Rédaction interactive d'une critique courte

Cette skill met à jour le champ `comment` (et optionnellement `rating`) d'un livre dans `public/data/books.json`. Elle **aide l'utilisateur à formaliser** une critique courte en posant quelques questions adaptatives, puis propose une rédaction à valider.

Le champ `comment` est un texte libre (null ou string). Le style maison est **court** (1 à 3 phrases en général), **direct**, pas littéraire, pas ampoulé. Vise le ton d'un ami qui résume sa lecture à table, pas celui d'un critique professionnel.

## Préconditions

- Travailler depuis le repo : `pwd` doit être sous `~/YoanDev/lectures`.
- Python 3 disponible (aucune dépendance externe).

## Workflow

### Étape 1 — Trouver le livre

Lance une recherche à blanc pour vérifier qu'on parle du bon livre, en passant un commentaire bidon que tu ne commiteras pas. En pratique, utilise plutôt `jq` ou une lecture directe pour trouver et afficher l'état actuel sans toucher au JSON :

```bash
jq --arg q "<titre approximatif>" '.books[] | select(.title | ascii_downcase | contains($q | ascii_downcase)) | { id, title, authors, rating, comment, status, abandoned }' public/data/books.json
```

Si plusieurs livres matchent, demande à l'utilisateur lequel il vise (affiche-lui `id`, titre et auteur). Garde l'`id` précis en mémoire pour la suite — tu rappelleras le script avec `--id` à la fin pour éviter toute ambiguïté.

Si aucun livre ne matche, dis-le et **arrête-toi** : ne propose pas d'ajouter le livre ici, c'est le rôle de `lectures-sync`.

### Étape 2 — Gérer un commentaire existant

Si le livre a **déjà** un `comment` non vide :

1. Affiche-le tel quel à l'utilisateur.
2. Demande-lui ce qu'il veut faire, en proposant trois options :
   - **Remplacer** par une nouvelle critique (repart de zéro, étape 3).
   - **Raffiner / améliorer** (on part du commentaire existant comme base, on le retouche à partir de ses précisions — étape 3 en mode édition).
   - **Vider** (`--clear-comment`).

Si le livre n'a pas de commentaire, passe directement à l'étape 3.

### Étape 3 — Recueillir la matière (questions adaptatives)

**Pose peu de questions. Adapte-les aux réponses. Arrête-toi dès qu'il y a matière à rédiger une critique courte.**

Commence par **une seule question ouverte** pour capter l'essentiel. Par exemple :

> « Alors, tu en retiens quoi globalement ? »

Ou, si c'est un raffinement, montre la critique actuelle et demande :

> « Tu veux tirer dans quelle direction : nuancer, durcir, ajouter un point, préciser un ressenti ? »

Ensuite, **relance selon la réponse** — pas un questionnaire fixe. Quelques pistes dans lesquelles piocher **selon ce qui manque** :

- Si la réponse est vague (« c'était bien ») → ce qui l'a marqué précisément, un moment, un personnage, une idée.
- Si ça penche très positif → s'il y a quand même un bémol, ou à qui il le recommanderait.
- Si ça penche négatif → ce qui a sauvé le livre (s'il y a), ou pourquoi il l'a quand même fini (ou pas — abandon).
- Si le ressenti est mitigé → pour quel type de lecteur ça pourrait coller malgré tout.
- Si c'est un essai / livre technique → ce qu'il en retient de concret, à qui ça peut servir.
- Si c'est une fiction → l'atmosphère, les personnages, le style, le rythme — mais ne les couvre pas tous, choisis l'angle qui ressort de ses réponses.

**Signaux d'arrêt** (dès que l'un est atteint, passe à la rédaction) :

- Tu as au moins un **angle clair** (l'utilisateur a pointé quelque chose de précis : un thème, un défaut, un point fort, un public cible…).
- L'utilisateur a dit « vas-y », « c'est bon », « avec ça ça suffit », ou quelque chose d'équivalent.
- Tu as posé **3 questions** au total — au-delà, c'est lourd. Mieux vaut un draft imparfait qu'un interrogatoire.

**Tu peux enchaîner plusieurs questions dans un seul tour** si elles sont courtes et complémentaires, au lieu d'étaler sur 3 tours. Exemple : « Ce qui t'a plu, et ce qui aurait pu être mieux ? ».

### Étape 4 — Rédiger une proposition

Rédige une critique **courte** (1 à 3 phrases, parfois une seule ligne — regarde les critiques existantes dans `books.json` pour calibrer). Respecte le style :

- **Direct et concret**, en français courant. Pas de formules toutes faites (« un véritable tour de force », « un incontournable »).
- **Jamais de tiret cadratin (`—`)** dans le texte de la critique. Interdit. Utilise une virgule, un point, un point-virgule, des parenthèses, ou deux phrases. Cette règle s'applique aussi aux drafts et reformulations que tu proposes à l'utilisateur, pas seulement à la version finale.
- **Pas de résumé du livre**, c'est une critique, pas un pitch. L'utilisateur sait ce qu'il a lu.
- **Pas de pronoms à la première personne obligatoires** — les critiques existantes alternent entre neutre (« Un livre dur mais nécessaire ») et "je" léger. Suis le ton des réponses de l'utilisateur : s'il parle à la première personne, garde-la ; s'il est plus descriptif, reste neutre.
- **Longueur proportionnelle à la matière** : s'il a donné 2 phrases d'avis, ne rends pas un paragraphe. S'il a développé, tu peux aller jusqu'à 3 phrases max.

**Exemples de bon calibrage** (vrais extraits de `books.json`) :

- « 1984, un classique de la science-fiction, étonnament (et terriblement) réaliste. »
- « Un livre dur à lire, mais nécessaire ! »
- « Intéressant, mais pas simple. »
- « Histoire intime et émouvante, une histoire de ma famille et des mes grands-parents. »

Montre la proposition à l'utilisateur clairement marquée (entre guillemets ou en bloc citation) et demande s'il la valide, veut une reformulation, ou préfère rédiger lui-même.

Boucle tant qu'il n'est pas content. Si après 2-3 itérations il tourne en rond, propose-lui de dicter lui-même — c'est sa critique, pas la tienne.

### Étape 5 — Proposer de définir / mettre à jour le rating

Regarde l'état actuel du `rating` :

- **Pas de rating** (`null` ou absent) : demande s'il veut en poser une (1-5), avec la possibilité de laisser vide.
- **Rating déjà présent** : affiche-le et demande s'il le garde tel quel, le change, ou le vide.

Ne force pas la note — s'il dit « laisse tomber », passe à l'étape suivante sans rating.

### Étape 6 — Écrire via le script

Une fois la critique (et éventuellement le rating) validés, appelle le script **avec `--id`** (à partir de l'id récupéré à l'étape 1) pour éviter toute ambiguïté :

```bash
# Cas nominal : nouveau commentaire, pas de touche au rating
python3 .claude/skills/lectures-comment/scripts/update_comment.py \
  --id <id> --comment "<la critique validée>"

# Avec mise à jour du rating
python3 .claude/skills/lectures-comment/scripts/update_comment.py \
  --id <id> --comment "<la critique validée>" --rating 4

# Vider un commentaire existant
python3 .claude/skills/lectures-comment/scripts/update_comment.py \
  --id <id> --clear-comment
```

Codes de sortie à interpréter :

| Code | Cas | Ce que tu dois faire |
| ---- | --- | -------------------- |
| `0`  | Changement appliqué | Passer à l'étape 7 (proposer commit). |
| `1`  | Livre introuvable par `--id` | Inattendu à ce stade — signale-le, n'insiste pas. |
| `2`  | Plusieurs candidats (ne doit pas arriver avec `--id`) | Idem. |
| `3`  | Erreur d'usage / fichier | Corriger l'appel, pas de retry bourrin. |
| `4`  | No-op (comment + rating déjà conformes) | Le signaler à l'utilisateur. Ne propose pas de commit. |

### Étape 7 — Proposer le commit + push (uniquement si code 0)

Le script a déjà affiché le diff lisible. Demande à l'utilisateur s'il veut **commiter et pusher**.

Choisis le message selon la nature du changement (vérifie `git diff public/data/books.json` pour être sûr de ce qui a bougé) :

- nouveau commentaire : `💬 Commenter "<titre>"`
- commentaire remplacé : `✏️ Réécrire la critique de "<titre>"`
- commentaire raffiné / retouché : `✏️ Affiner la critique de "<titre>"`
- commentaire vidé : `🗑️ Retirer la critique de "<titre>"`
- si le rating a bougé **aussi**, tu peux tout regrouper : `💬 Commenter "<titre>" (⭐<note>/5)`

Commit + push si l'utilisateur valide :

```bash
git add public/data/books.json \
  && git commit -m "💬 Commenter \"<titre>\"" \
  && git push
```

Si l'utilisateur refuse le push, arrête-toi là : la modification est déjà faite sur le disque, il décidera.

## Cas d'usage

### Cas nominal (livre sans commentaire)

```
Utilisateur : "ajoute un commentaire sur Dune"
→ 1 seul match → affiche titre/auteur/rating actuel
→ "Tu en retiens quoi globalement ?"
→ utilisateur : "C'est dense mais les personnages portent vraiment, surtout Paul et Jessica"
→ draft : « Dense, mais les personnages portent le livre, surtout Paul et Jessica. »
→ utilisateur valide
→ rating absent ? demander. utilisateur : "4"
→ script --id 12 --comment "..." --rating 4 → code 0
→ proposer commit 💬 Commenter "Dune" (⭐4/5) + push
```

### Commentaire déjà présent (raffinage)

```
Utilisateur : "je voudrais compléter ma critique sur 1984"
→ affiche : "1984, un classique de la science-fiction, étonnament (et terriblement) réaliste."
→ demande : remplacer / raffiner / vider ?
→ utilisateur : "raffiner, j'aimerais ajouter que c'est encore plus parlant en 2026"
→ draft qui intègre : « 1984, un classique de la SF, étonnament (et terriblement) réaliste — encore plus parlant en 2026. »
→ validation, pas de changement de rating, écriture → commit ✏️ Affiner la critique de "1984"
```

### Ambiguïté

```
Utilisateur : "commente Fondation"
→ jq remonte 3 tomes
→ demander lequel (affiche id, titre complet, rating actuel)
→ suite normale à partir du choix
```

### Livre absent

```
Utilisateur : "commente Cryptonomicon"
→ jq vide
→ "Cryptonomicon n'est pas référencé dans books.json. Ajoute-le d'abord via lectures-sync."
→ stop
```

### Livre en cours de lecture (`status: reading`)

Pas de règle dure — l'utilisateur peut vouloir poser un commentaire à chaud en cours de lecture, ou préférer attendre. Si le status est `reading`, demande-lui juste s'il veut quand même commenter maintenant ou attendre la fin. Ne bloque pas.

## Principes

- **Un seul point d'entrée pour écrire** : le script. N'édite pas `books.json` à la main — tu casserais le formatage.
- **Le script préserve** : 2 espaces d'indentation, UTF-8 non échappé, newline final. Ne change pas cette convention.
- **Tu es un facilitateur, pas un auteur** : la critique doit sonner comme l'utilisateur, pas comme toi. Si tu es tenté d'ajouter des formules, retire-les. Dans le doute, cours plus court.
- **N'invente rien** : si l'utilisateur n'a pas dit qu'un personnage était génial, ne l'écris pas. Reformule ses mots, ne les enrichis pas.
- **Push explicite** : toujours demander avant de push, même pour une modif triviale.
