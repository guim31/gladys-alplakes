# Alplakes

Amène dans Gladys la **température de l'eau des lacs alpins** : le Léman, le lac d'Annecy, le
lac du Bourget, le lac de Constance, le lac de Zurich, le lac des Quatre-Cantons, le lac Majeur,
le lac de Garde, le lac de Côme et plus d'une centaine de lacs suisses, français, italiens,
allemands, autrichiens et slovènes, avec une **prévision pour les deux prochains jours**. Les
valeurs viennent d'**Alplakes**, la plateforme lacustre de l'**Eawag**, l'Institut fédéral
suisse des sciences et technologies de l'eau. Ni compte, ni clé.

> **Des simulations calées sur des mesures, pas des mesures directes.** Alplakes fait tourner
> des modèles hydrodynamiques de chaque lac, pilotés par la prévision météo et vérifiés sur
> des mesures : la valeur peut s'écarter d'un degré ou plus de ce que lit un thermomètre à
> votre plage. Cette intégration n'est pas affiliée à l'Eawag.

## Ce que vous obtenez

- **Un appareil par lac** suivi, d'après le modèle 1D du lac entier (Simstrat) : la
  **température de l'eau maintenant**, le **maximum des prochaines 24 heures** et des
  **prochaines 48 heures**, et l'**évolution attendue sur 24 heures** (par exemple +0,6 °C).
- **Un appareil par point précis** (une plage, un port, un ponton) sur les lacs qui ont un
  modèle 3D (Léman, Annecy, Bourget, Zurich, Quatre-Cantons, Lugano, Garde, Bienne, Neuchâtel,
  Zoug, Morat…) : les mêmes quatre valeurs, à la maille du modèle la plus proche du point.
- La température en **surface** (pour la baignade) ou à **1, 2, 5 ou 10 m** de profondeur.
- Un **déclencheur de scène** : l'eau atteint une température (10 à 28 °C), maintenant ou dans
  la prévision des 48 prochaines heures, ou repasse en dessous.
- Un **widget de tableau de bord** : vos lacs, leur température, le maximum des 48 prochaines
  heures et la tendance.
- Un bouton **« Chercher des lacs »** qui liste les lacs par nom, avec leur clé.

## Prérequis

- Gladys Assistant **5.3.0** ou plus récent.
- Un accès Internet depuis Gladys (l'intégration interroge l'API publique d'Alplakes).

## Configuration

Installez l'intégration depuis **Intégrations → Installer depuis GitHub** avec l'adresse
`https://github.com/guim31/gladys-alplakes`, puis ouvrez son onglet **Configuration**.

### Réglages

- **Lacs** : des noms ou des clés, séparés par des virgules, 10 au plus. Un nom marche en
  français, anglais, allemand ou italien, avec ou sans article : `Léman`, `Lake Geneva`,
  `Genfersee`, `Annecy`, `Lac du Bourget`, `Thunersee`. Certains lacs sont découpés en bassins
  (Zurich, Constance, Lugano, Quatre-Cantons) : donnez la clé du bassin (`upperzurich`,
  `lowerconstance`…).
- **Points précis (facultatif)** : `lac: latitude, longitude nom`, séparés par des
  points-virgules, 10 au plus, par exemple `Léman: 46.2107, 6.1613 Bains des Pâquis`. Le nom
  est facultatif. Les coordonnées sont en degrés décimaux avec un point (copiez-les depuis une
  carte) ; quatre décimales sont gardées.
- **Profondeur** : surface (par défaut), 1, 2, 5 ou 10 m. Elle vaut pour tous les lacs et
  points.
- **Langue des noms** : la langue des noms des appareils et des fonctionnalités, fixée à la
  création des appareils dans Gladys.

Enregistrez, puis créez les appareils dans l'onglet **Découverte**. L'état de connexion de
l'onglet Configuration dit ce qui ne peut pas être suivi : un lac inconnu, un nom qui
correspond à plusieurs lacs, un point illisible, un lac sans modèle 3D, un point trop loin du
lac (à plus de 1,5 km de la maille la plus proche du modèle).

### Trouver vos lacs

Le bouton **Chercher des lacs** liste les lacs qui correspondent à un nom, avec leur clé, et
indique ceux qui ont un modèle 3D (points précis possibles). Laissé vide, il liste les lacs qui
ont un modèle 3D. Copiez un nom ou une clé dans **Lacs**, puis enregistrez.

## Appareils

Chaque lac ou point est un appareil à quatre fonctionnalités en lecture seule, en °C :

| Fonctionnalité       | Contenu                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| Température de l'eau | La température maintenant, entre les deux pas du modèle qui l'encadrent |
| Max. prochaines 24 h | La valeur la plus chaude des 24 prochaines heures (au moins l'actuelle) |
| Max. prochaines 48 h | La valeur la plus chaude des 48 prochaines heures                       |
| Évolution sur 24 h   | La température dans 24 heures moins l'actuelle (signée)                 |

La température et l'évolution sont publiées comme des températures de « sonde » : un lac rangé
dans une pièce de Gladys ne change pas la température de cette pièce. Les valeurs sont
calculées toutes les heures à partir de la série du modèle, et Alplakes est réinterrogé toutes
les 3 heures.

## Widget de tableau de bord

Ajoutez le widget **Alplakes → Lacs** à un tableau de bord.

- **Sans lac choisi** : une ligne par lac ou point (10 au plus) avec la température actuelle,
  le maximum des 48 prochaines heures et l'icône de tendance (se réchauffe, stable, se
  refroidit).
- **Avec un lac choisi** : ses quatre valeurs, en direct.

Des réglages masquent la prévision et le lien vers le site d'Alplakes. Le widget se termine par
la mention « Données : Alplakes, Eawag (CC BY 4.0) » et l'heure des dernières données.

## Déclencheur de scène

**Seuil de température de l'eau franchi** se déclenche quand l'eau d'un lac ou d'un point suivi
atteint une température, ou repasse 0,3 °C en dessous (une valeur qui oscille autour d'un seuil
ne déclenche qu'une fois). Filtres : le lac ou point, la valeur (la température actuelle, ou le
maximum des 48 prochaines heures), les températures (10 à 28 °C) et le sens (atteinte, repasse
en dessous). La scène peut utiliser le nom du lac, la température de l'eau, le seuil, le code de
la valeur (`current`, `forecast_48h`) et le code du sens (`rising`, `falling`).

Pour toute autre condition (au-dessus de 21,5 °C, entre deux valeurs…), utilisez le
déclencheur d'appareil habituel de Gladys sur les fonctionnalités de l'appareil.

## Exemples de scènes

- **Saison de baignade** : quand le lac d'Annecy atteint 20 °C (température actuelle,
  atteinte), envoyer « Le lac est à {température} °C, c'est l'heure de la baignade ! ».
- **Prévoir le week-end** : quand le maximum des 48 prochaines heures de votre plage atteint
  22 °C, envoyer un message le jeudi soir.
- **Fin de saison** : quand le lac repasse sous 16 °C, vous rappeler de rentrer le paddle.

## Sources des données, licence et quotas

- **Alplakes** (Eawag, https://www.alplakes.eawag.ch) : API `https://alplakes-api.eawag.ch`,
  modèles Simstrat (1D, un par lac ou bassin), Delft3D-FLOW et MITgcm (3D), pilotés par la
  prévision de MétéoSuisse. Noms des lacs : la liste statique du site d'Alplakes.
- **Licence** : CC BY 4.0. Mention : « Données : Alplakes, Eawag (CC BY 4.0) », affichée dans le
  widget et dans l'onglet Configuration. Mention exigée en anglais : Alplakes, Eawag (CC BY 4.0).
- **Usage raisonnable** : l'API est limitée par client. L'intégration demande une série par lac
  ou point toutes les 3 heures (le rythme des modèles), espacées d'une seconde, avec un
  User-Agent identifiable, et la liste des lacs une fois par jour. Une requête qui échoue garde
  la dernière série : la prévision reste utilisable environ deux jours.
- Rien n'est envoyé à Alplakes que les clés des lacs, la profondeur et les coordonnées de vos
  points.

## Dépannage

- **« Lac inconnu »** : utilisez **Chercher des lacs** ; les petits lacs ont leur propre clé
  (`rotsee`, `oeschinensee`).
- **« Plusieurs lacs correspondent »** : le lac est découpé en bassins : donnez la clé du bassin.
- **« Pas de modèle 3D »** : les points précis ne sont possibles que sur les lacs qui ont un
  modèle 3D ; suivez plutôt le lac entier.
- **« Point trop loin du lac »** : les coordonnées sont sans doute inversées (la latitude
  d'abord) ou sur la terre ferme.
- **« Alplakes ne répond pas »** : les valeurs continuent d'après la dernière prévision ; elles
  reviennent avec le service.
- Journaux : `LOG_LEVEL=debug` montre chaque passage.

## Limites

- **Des simulations, pas des mesures** : les modèles sont bons en moyenne, moins près d'une
  embouchure, dans une baie peu profonde ou après un orage.
- Le modèle 1D donne une valeur pour tout le lac ; pour une plage, utilisez un point précis.
- Un changement de profondeur redemande toutes les séries ; un franchissement pendant un
  redémarrage ne déclenche rien.
- Les noms espagnols des lacs n'existent que pour les grands lacs ; les autres gardent leur nom
  anglais.
- Pas affiliée à l'Eawag. Données : Alplakes, Eawag (CC BY 4.0).
