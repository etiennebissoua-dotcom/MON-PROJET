# GLC SAV — Sécurisation (auth réelle + RLS)

Vos données existantes sont conservées. 3 étapes, dans cet ordre.

## 1. Verrouiller la base

Dans Supabase → **SQL Editor**, coller et exécuter tout le contenu de `SECURITE.sql`.

Ce script :
- coupe **tout accès anonyme direct** aux tables (clients, appareils, réparations, factures…) ;
- active RLS : seules les personnes présentes dans `user_roles` peuvent lire/écrire ;
- crée une fonction publique unique `suivi_reparation(code, téléphone)` pour le portail client — le client ne voit **que son ticket**, et ni son adresse ni son e-mail ne sont renvoyés ;
- remplace la numérotation `GLC-2026-XXXX` par une séquence en base (plus de doublons) ;
- ajoute l'historique de statut automatiquement (trigger), donc traçable même hors application.

## 2. Créer les comptes de l'équipe

1. Supabase → **Authentication → Users → Add user** : e-mail + mot de passe pour chaque technicien.
   Décochez l'auto-confirmation seulement si vous voulez valider par e-mail.
2. Supabase → **Authentication → Providers** : désactivez « Enable signups » pour empêcher toute inscription publique.
3. Revenez dans SQL Editor et exécutez, pour chaque compte :

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'patron@glc.cm'
on conflict do nothing;
```

(`'technicien'` pour les autres). **Un compte sans ligne dans `user_roles` est refusé à la connexion.**

## 3. Déployer le site mis à jour

Les fichiers `index.html` et `app.js` de ce dossier remplacent ceux de Netlify.

Ce qui a changé côté application :
- l'écran « Espace technicien » demande maintenant **e-mail + mot de passe** (le code `2026` en dur a été supprimé) ;
- après connexion, l'application vérifie que le compte a bien un rôle atelier ;
- toutes les requêtes utilisent le **jeton de la session** (plus la clé publique), avec rafraîchissement automatique et reconnexion si la session expire ;
- la session est gardée dans l'onglet uniquement (`sessionStorage`), donc fermer l'onglet déconnecte ;
- le portail client passe par la fonction `suivi_reparation` : plus aucune lecture directe des tables depuis le navigateur.

## À noter

La clé `sb_publishable_…` reste visible dans le code : c'est normal et sans danger **une fois le script SQL appliqué**, car elle ne donne plus accès à rien sans session valide. Avant l'étape 1, en revanche, toutes vos données clients sont lisibles publiquement — c'est l'étape à faire en priorité.

Prochaines étapes possibles : impression PDF ticket/facture + QR de suivi, notifications WhatsApp au changement de statut, tableau de bord chiffré (CA, délais, retards, impayés).
