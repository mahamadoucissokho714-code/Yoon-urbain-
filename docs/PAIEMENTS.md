# Paiements : Orange Money et Wave

## État actuel : simulation

Le formulaire propose **Orange Money**, **Wave** et **Espèces en agence**. Les deux moyens mobiles sont **simulés** : le site ne contacte ni Orange ni Wave, ne débite rien et n'envoie aucune donnée. Une fois la saisie validée, un délai de 1,4 s imite la confirmation, puis les billets sont créés et la vente est enregistrée avec son moyen de paiement (`method`), dans le navigateur uniquement.

| Moyen | Numéro demandé | Règle de validation |
|---|---|---|
| Orange Money | oui | numéro Orange : préfixes 77 ou 78, avec ou sans +221 |
| Wave | oui | tout mobile sénégalais : 70, 75, 76, 77 ou 78, avec ou sans +221 |
| Espèces en agence | non | réservation de 48 h, pas de vente tant que ce n'est pas réglé |

Les ventes sont réparties par moyen de paiement dans le tableau « Ventes de billets ». Les billets achetés avant l'ajout de ces moyens s'affichent comme « Mobile money (ancien) ».

Ajouter un moyen de paiement : une entrée dans `PAYMENT_METHODS` (`js/views/tickets.js`). Le menu, la validation, le message d'erreur, le libellé du bouton et la répartition des ventes s'adaptent seuls.

## Passer à de vrais paiements

C'est impossible avec un site 100 % navigateur : **les clés d'API d'Orange Money et de Wave sont secrètes et ne doivent jamais se trouver dans le code du site**, et la confirmation d'un paiement ne doit jamais être décidée par le navigateur (n'importe qui pourrait la falsifier). Il faut donc ajouter un petit serveur. Le schéma habituel :

1. **Compte marchand** : ouvrir un compte professionnel chez Wave (Wave Business) et chez Orange Money (offre marchand / paiement web) et obtenir les identifiants d'API ainsi que la documentation officielle. Les détails exacts (adresses d'API, authentification, format des échanges, frais) viennent de ces documentations, pas de ce projet.
2. **Serveur** (fonction serverless ou petit service) qui garde les clés dans ses variables d'environnement et expose deux routes :
   - `POST /paiements` : reçoit le panier (identifiants de produits et quantités, jamais les prix), recalcule le total côté serveur, demande au fournisseur de créer le paiement et renvoie l'adresse de paiement ou la demande de confirmation.
   - `POST /webhooks/<fournisseur>` : reçoit la confirmation signée du fournisseur, vérifie la signature, puis marque la commande comme payée. **Seul ce webhook crée les billets et les ventes.**
3. **Navigateur** : remplacer le contenu de `ticketsView.finalize` (le seul endroit qui crée billets et ventes) par un appel à `POST /paiements`, puis afficher « en attente de confirmation » jusqu'à ce que le serveur indique que la commande est payée (redirection de retour ou interrogation régulière).
4. **Données** : les billets et les ventes doivent être stockés côté serveur (base de données), sinon un client peut les modifier dans son navigateur. Cela remplace `store.get/set('tickets' | 'sales')`.
5. **CSP** : ajouter l'adresse de votre serveur à `connect-src` (variable `YOON_REPORT_URL` pour la supervision, à étendre pour l'API) dans `scripts/security.js`.
6. **Tests** : utiliser les environnements de test (sandbox) des fournisseurs, couvrir paiement réussi, refusé, abandonné et webhook rejoué deux fois (il ne doit créer qu'un seul billet).

Points d'attention : conservation du minimum de données (numéro de téléphone seulement le temps du paiement), journalisation sans numéro complet, et conditions des fournisseurs (frais, délais de reversement, remboursements).
