# MatheoIQ Médico Móvil Command Hub

Preview live-ready safe pour le hub opérationnel MatheoIQ Médico Móvil.

- Ne contient aucune donnée patient réelle.
- Ne contient aucun secret.
- Ne déclenche aucun dispatch, paiement, WhatsApp/SMS/email ou write patient live.
- Clone le pattern de command hub observé dans `alma-fina-b2b-command-hub`, mais sans contenu Alma Fina.
- Sert de prototype pour: cliniques connectées, queue demandes, médecins vérifiés, dispatch IA, escalations.

## Priority blocks / passage live preview

Le hub expose `GET /api/live-readiness` avec les 6 blocs priorité :

1. Backend guards
2. Licencia médica obligatoria
3. Conformité MX
4. Paiements
5. Ops IA dispatch
6. Pilote fermé

Statut attendu tant qu’aucune action externe n’est autorisée :

```txt
LIVE_PREVIEW_READY_EXTERNAL_ACTIONS_BLOCKED
```

Les routes sensibles retournent volontairement `403 external_live_action_disabled` :

- `POST /api/dispatch/live`
- `POST /api/payments/capture`
- `POST /api/patients/write`

## Vérification

```bash
npm run smoke:live-readiness
```

Le smoke vérifie : UI, health, readiness, data clinics/doctors/queue, 6 priority blocks, absence de contenu Alma Fina, et blocage des actions externes.

## Déploiement preview

Ouvrir `index.html`, servir ce dossier avec `npm start`, ou depuis `web-prototypes/index.html`.

Pour production réelle : ne pas bypasser les gates. Brancher d’abord backend + RLS + cédula/licence + privacy/legal + paiement test mode + pilot fermé.
