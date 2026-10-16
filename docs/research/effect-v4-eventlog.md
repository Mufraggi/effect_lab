# Effect v4 EventLog : recherche pour la démo todo-list collaborative hors-ligne

> Version étudiée : `effect@4.0.2` (installée).
> Source primaire : le code installé. Dans ce document, `E/` est un raccourci pour
> `node_modules/.pnpm/effect@4.0.2/node_modules/effect/src/eventlog/`, et `S/` pour
> `node_modules/.pnpm/effect@4.0.2/node_modules/effect/src/`.
> J'ai vérifié que les sources GitHub `Effect-TS/effect` au tag `effect@4.0.2` sont identiques octet pour octet
> aux fichiers installés (comparaison faite avec `cmp` sur `EventLog.ts`, `EventJournal.ts`,
> `EventLogServerUnencrypted.ts` et `EventLogRemote.ts`). Les tests cités viennent de ce tag
> (`packages/effect/test/eventlog/*`).
> Source secondaire : https://effect.website/docs/v4/api/effect/eventlog/EventLog (la page documente la 4.0.4, avec les mêmes noms d'export).

## Résumé

- **Import** : on importe depuis `effect/eventlog` (barrel), ou depuis `effect/eventlog/EventLog`, etc. Il n'y a **pas** de chemin `effect/unstable/eventlog` en 4.0.2 (`package.json` de effect, export `"./eventlog"`, ligne 41 ; `E/index.ts`). Tous les modules sont marqués `@stability unstable`.
- Le plan est **globalement juste**. `EventLogServerUnencrypted.layer(schema, handlers)`, `layerStorageMemory`, `StoreMapping`, `EventLogServerAuthorization`, `EventJournal.layerIndexedDb({ database })`, `EventLogRemote.layerUnencrypted` et `EventLog.Identity` existent tous.
- **Correction 1 (conflits)** : un conflit exige le **même tag d'événement ET la même primaryKey**. `TodoToggled` contre `TodoDeleted` n'est **jamais** un conflit au sens de `conflicts` (scénario 3). Il faut le gérer dans la logique des handlers (tombstones), ou fusionner les événements en un seul tag.
- **Correction 2 (conflits)** : `conflicts` est **toujours vide lors d'une écriture locale**. Il n'est rempli que lors du rejeu d'entrées distantes, côté client comme côté serveur. Les conflits sont les entrées déjà présentes **plus récentes** (horodatage UUIDv7 de l'horloge client) que l'entrée entrante. Le mécanisme sert donc naturellement à faire du **last-write-wins** : si `conflicts.length > 0`, on ignore l'entrée.
- **Correction 3 (offline)** : il n'existe **aucune API online/offline**. Pour une déconnexion propre, on ferme le `Scope` dans lequel la couche `EventLogRemote` a été construite, et on la reconstruit pour se reconnecter. Les écritures faites hors-ligne restent dans le journal local et sont poussées automatiquement à la reconnexion.
- **Correction 4 (identité)** : une `Identity` n'est pas une vraie paire de clés. `publicKey` est un `randomUUID()` et `privateKey` 32 octets aléatoires ; la clé de signature Ed25519 en est dérivée. Le mode **chiffré** ne permet **pas** à deux identités de partager un store. La démo doit donc rester en **non chiffré**.
- **UI** : il n'y a pas d'intégration Atom dédiée à l'EventLog. On passe par `EventLog.groupReactivity` (clés `Reactivity`) et `Atom.runtime(...).withReactivity`, ou par un `SubscriptionRef` maintenu par les handlers. `journal.changes` ne publie que les écritures **locales**.

---

## 1. Modules, exports et signatures (4.0.2)

| Module (import) | Exports utiles | Source |
|---|---|---|
| `effect/eventlog/Event` | `make({ tag, primaryKey, payload?, success?, error? })`, `addError` | `E/Event.ts:421-454` |
| `effect/eventlog/EventGroup` | `empty`, `.add({ tag, primaryKey, payload?, success?, error? })`, `.addError` | `E/EventGroup.ts:59-85`, `:205` |
| `effect/eventlog/EventLog` | `EventLog` (service : `write`, `entries`, `destroy`), `Registry`, `layerRegistry`, `Identity`, `schema(...groups)`, `group(group, h => h.handle(...))`, `groupCompaction`, `groupReactivity`, `layer(schema, handlersLayer)`, `layerEventLog`, `makeClient(schema)`, `makeIdentity`, `encodeIdentityString`/`decodeIdentityString`, `IdentitySchema`, `CurrentStoreId`, `makeReplayFromRemote` | `E/EventLog.ts:53-64`, `:74`, `:114`, `:189-192`, `:241`, `:558`, `:596`, `:695`, `:729`, `:996`, `:1034`, `:1059`, `:436-438`, `:480-511` |
| `effect/eventlog/EventJournal` | `EventJournal` (service), `layerMemory`, `makeMemory`, `layerIndexedDb({ database? })`, `makeIndexedDb`, `Entry`, `RemoteEntry`, `EntryId`, `RemoteId`, `EventJournalError` | `E/EventJournal.ts:44-115`, `:544`, `:395`, `:822-828`, `:559`, `:298`, `:378` |
| `effect/eventlog/EventLogRemote` | `EventLogRemote` (service : `id`, `changes`, `write`, `whenAuthenticated`), `layerUnencrypted`, `layerEncrypted`, `makeUnencrypted`, `makeEncrypted`, `makeWith`, `EventLogRemoteClient`, `EventLogRemoteError` | `E/EventLogRemote.ts:61-76`, `:392-398`, `:376-383`, `:354`, `:318`, `:167`, `:139` |
| `effect/eventlog/EventLogServer` | **Pas de `layer`** : seulement `layerRpcHandlers(options)` (bas niveau, partagé), `layerAuthMiddleware`, `AuthenticatedIdentities`, `ChunkedMessageState` | `E/EventLogServer.ts:51`, `:79`, `:252`, `:269` |
| `effect/eventlog/EventLogServerUnencrypted` | `layer(schema, handlersLayer)`, `layerNoRpcServer`, `layerServer`, `layerRpcHandlers`, `Storage`, `layerStorageMemory`, `makeStorageMemory`, `StoreMapping`, `layerStoreMappingStatic({ storeId })`, `EventLogServerAuthorization`, `EventLogServerAuthError`, `EventLogServerStoreError`, `EventLogServerUnencrypted` (service `makeWrite`), `makeWrite`, `compactBacklog` | `E/EventLogServerUnencrypted.ts:839-855`, `:865`, `:800`, `:114`, `:387-404`, `:701`, `:593`, `:322-333`, `:356-367`, `:294-307`, `:274`, `:259`, `:59`, `:83` |
| `effect/eventlog/EventLogServerEncrypted` | `layer` (pas de paramètre schema/handlers), `layerRpcHandlers`, `Storage` (**un autre** service que celui du non chiffré), `layerStorageMemory` | `E/EventLogServerEncrypted.ts:123`, `:44`, `:170-186`, `:277` |
| `effect/eventlog/EventLogEncryption` | `EventLogEncryption`, `layerSubtle`, `makeEncryptionSubtle` | `E/EventLogEncryption.ts:81`, `:172`, `:108` |
| `effect/eventlog/EventLogMessage` | `StoreId` (string brandé), `EventLogRemoteRpcs`, `EventLogProtocolError`, … | `E/EventLogMessage.ts:50-59`, `:386`, `:73` |
| Variantes SQL | `SqlEventJournal.layer`, `SqlEventLogServerUnencrypted.layerStorage`, `SqlEventLogServerEncrypted` | `E/SqlEventJournal.ts:324`, `E/SqlEventLogServerUnencrypted.ts:502` |

Signatures clés :

```ts
// E/EventLog.ts:1034-1044
EventLog.layer(schema, handlersLayer): Layer<EventLog | Registry, E, Exclude<R, EventLog | Registry> | EventJournal | Identity>

// E/EventLog.ts:296-310 — un handler
handle(tag, ({ storeId, payload, entry, conflicts }) => Effect<Success, Error, R1>)
//   conflicts: ReadonlyArray<{ entry: Entry; payload: Payload }>

// E/EventLogServerUnencrypted.ts:839-855
EventLogServerUnencrypted.layer(schema, handlersLayer):
  Layer<never, E, … | EventLogServerAuthorization | RpcServer.Protocol | Storage | StoreMapping>

// E/EventLogRemote.ts:392-398
EventLogRemote.layerUnencrypted: Layer<EventLogRemote, EventLogRemoteError, RpcClient.Protocol | Registry>

// E/EventJournal.ts:822-828
EventJournal.layerIndexedDb(options?: { database?: string }): Layer<EventJournal, EventJournalError>
// nom de base par défaut : "effect_event_journal" (E/EventJournal.ts:563)
```

**Écarts avec le plan :**
- `EventLogServer.layer` n'existe pas. On utilise `EventLogServerUnencrypted.layer`, qui est bien celui du plan.
- `Identity` est `EventLog.Identity` (`E/EventLog.ts:189`). Ce n'est pas un module à part entière.
- `Storage` existe en **deux** versions incompatibles, une non chiffrée et une chiffrée. Il faut importer celle de `EventLogServerUnencrypted`.
- `StoreMapping` n'a qu'une implémentation fournie : `layerStoreMappingStatic`.
- `EventLogServerAuthorization` n'a **aucune** implémentation fournie. Il faut l'écrire avec `Layer.succeed`, comme le font les tests (`packages/effect/test/eventlog/EventLogServerUnencrypted.test.ts:89-93`).

---

## 2. Détection des conflits

### Qu'est-ce qu'un conflit ?
C'est une entrée existante qui a **le même `event` (tag) ET la même `primaryKey`** que l'entrée entrante, et qui est **plus récente** qu'elle. Ce critère est identique dans les trois implémentations.

**Journal mémoire côté client** (`E/EventJournal.ts:465-482`) :
```ts
for (const originEntry of compacted) {
  const entryMillis = entryIdMillis(originEntry.id)
  const conflicts: Array<Entry> = []
  for (let i = journal.length - 1; i >= -1; i--) {
    const entry = journal[i]
    if (entry !== undefined && entry.createdAtMillis > entryMillis) {
      continue
    }
    for (let j = i + 1; j < journal.length; j++) {
      const scannedEntry = journal[j]!
      if (scannedEntry.event === originEntry.event && scannedEntry.primaryKey === originEntry.primaryKey) {
        conflicts.push(scannedEntry)
      }
    }
    yield* options.effect({ entry: originEntry, conflicts })
    break
  }
}
```

**Journal IndexedDB côté client** (`E/EventJournal.ts:658-686`). Il parcourt les entrées dont l'`id` est strictement supérieur à celui de l'entrée entrante (`IDBKeyRange.lowerBound(originEntry.id, true)`), avec le même filtre `event` + `primaryKey`.

**Serveur non chiffré** (`E/EventLogServerUnencrypted.ts:417-444`, `toConflicts`). Il prend l'historique du store à partir de la plus ancienne entrée du lot (`storage.entriesAfter`, `:132`), ignore les entrées plus anciennes, marque comme doublon une entrée de même id, puis applique le même filtre `event` + `primaryKey`.

Le test officiel `"reports the first newer conflicting entry"` confirme ce comportement : une entrée à 2000 ms déjà présente est remontée comme conflit d'une entrée entrante à 1000 ms (`test/eventlog/EventJournal.test.ts:77-93`). Le test serveur `"indexes conflicts from the sliced history"` (`test/eventlog/EventLogServerUnencrypted.test.ts:43-117`) montre qu'une entrée de même clé mais **plus ancienne** n'est pas un conflit, alors qu'une entrée de même clé **plus récente** en est un.

### Ordre de référence
- L'ordre retenu est **l'horodatage de création encodé dans l'`EntryId` UUIDv7**, généré par l'horloge **du client** au moment de l'écriture (`makeEntryIdUnsafe`, `E/EventJournal.ts:270-271`, et `createdAtMillis`, `:352-354`). Le tri `Entry.Order` porte sur les octets de l'UUID (`E/EventJournal.ts:243-250`, `:334`).
- La **séquence distante** (`remoteSequence`) ne sert qu'à reprendre la synchronisation (`nextRemoteSequence`, `E/EventLog.ts:837`) et à streamer le backlog (`E/EventLogServerUnencrypted.ts:672-689`). Elle ne joue **aucun rôle** dans les conflits.
- Le journal mémoire est re-trié par `createdAtMillis` après import (`E/EventJournal.ts:495`). En revanche, **les handlers sont exécutés dans l'ordre d'arrivée** (l'ordre de séquence serveur), pas dans l'ordre chronologique. Une projection doit donc tolérer un ordre quelconque.

### Ce que reçoit le handler et quand il est appelé
- **Écriture locale** : `conflicts: []` est codé en dur (`E/EventLog.ts:941-946`). Le handler s'exécute **avant** le commit, et l'entrée n'est commitée que si le handler réussit (`E/EventJournal.ts:421-443` pour la mémoire, `:599-616` pour IndexedDB).
- **Rejeu d'entrées distantes côté client** : `journal.writeFromRemote(..., effect: replayFromRemote)` (`E/EventLog.ts:843-891`). `makeReplayFromRemote` décode le payload de chaque conflit et appelle `handler({ storeId, payload, entry, conflicts: decodedConflicts })` (`E/EventLog.ts:750-768`). **Les erreurs du handler sont seulement loguées** (`Effect.catchCause(Effect.logError)`, `:786`), et l'entrée est stockée malgré tout (`E/EventJournal.ts:483-494`).
- **Côté serveur** : à chaque écriture reçue d'un client, les handlers enregistrés sur le serveur sont appelés avec leurs conflits (`E/EventLogServerUnencrypted.ts:134-145`, `:881-933`). **Si un handler serveur échoue**, tout le lot est rejeté avec `InternalServerError "Persistence failure"` (`:218-228`), et le client réessaie **indéfiniment** (`E/EventLog.ts:794-797`, `:904-908`).
- Les doublons, c'est-à-dire l'écho de ses propres entrées renvoyé par le serveur, sont ignorés. Ils déclenchent seulement une invalidation de réactivité (`E/EventJournal.ts:449-456`, `E/EventLog.ts:889`).

### Ce que cela implique pour les scénarios
- **Scénario 2 (renommage contre renommage)** : on écrit `if (conflicts.length > 0) return Effect.void` dans `TodoRenamed`, ce qui donne du LWW sur l'horloge client. Exemple : Alice renomme hors-ligne à t2, Bob à t1 < t2. Quand l'entrée de Bob arrive chez Alice, son entrée t2 est un conflit, donc elle est ignorée. Quand l'entrée d'Alice arrive chez Bob, il n'y a pas d'entrée plus récente, donc elle est appliquée. Les deux convergent vers le titre d'Alice. *(Déduit du code ci-dessus ; non exécuté.)*
- **Scénario 3 (bascule contre suppression)** : les tags diffèrent, donc **jamais de `conflicts`**. Les handlers doivent tenir des tombstones : `TodoDeleted` ajoute l'id à `deleted`, et `TodoToggled`/`TodoRenamed`/`TodoAdded` sur un id supprimé ne font rien. Pour que l'opération soit idempotente quel que soit l'ordre d'arrivée, `TodoToggled` doit porter `done: boolean` (une valeur cible) plutôt qu'une inversion. Autre option : un seul tag `TodoChanged` avec un payload discriminé, ce qui fait jouer `conflicts` entre bascule et suppression.
- **Scénario 1** : les primaryKeys diffèrent, donc aucun conflit. C'est confirmé par le filtre ci-dessus.

---

## 3. Mécanique de synchronisation

- **Enregistrement** : `EventLogRemote.makeWith` envoie `EventLog.Hello` **dès la construction de la couche** (`E/EventLogRemote.ts:181-183`), puis appelle `registry.registerRemote(remote)` (`:300`). `registerRemote` est un `acquireRelease` lié au `Scope` de la couche : à la libération, le remote est retiré et sa fibre interrompue (`E/EventLog.ts:148-158`). L'`id` du remote est le `remoteId` du `Storage` serveur (`E/EventLogRemote.ts:238`, `E/EventLogServerUnencrypted.ts:124`, `:597`).
- **Pull** (`runRemote`, `E/EventLog.ts:835-902`) : lit `nextRemoteSequence(remote.id)`, ouvre `remote.changes({ identity, startSequence, storeId })`, puis écrit chaque lot via `journal.writeFromRemote` sous `withLock(storeId)`. En cas d'erreur, la boucle **recommence** avec `Schedule.min([exponential(200, 1.5), spaced(10s)])` (`:794-797`, `:893-901`).
- **Push** : `journal.withRemoteUncommited(remote.id, entries => remote.write(...))` envoie toutes les entrées que ce remote n'a pas encore reçues, avec retry (`E/EventLog.ts:904-908`). Un premier push a lieu au démarrage (`:917`), puis un nouveau à chaque nouvelle écriture locale (`journal.changes` alimente une `Queue.dropping(1)`, `:910-922`). Un dernier flush est tenté dans un finalizer (`:909`).
- **Entrées écrites hors-ligne** : elles sont commitées localement, puisque le handler s'exécute et que l'entrée est stockée. Elles sont ensuite poussées au prochain `withRemoteUncommited` réussi. Le test `"retries a failed remote write and flushes changes made during the retry"` montre qu'une écriture qui échoue (`cause: "offline"`) est réessayée avec les mêmes entrées, et que les écritures faites pendant le retry sont envoyées ensuite (`test/eventlog/EventLog.test.ts:63-133`). Le suivi des entrées non envoyées est en mémoire pour `layerMemory` (`missing`, `E/EventJournal.ts:398`, `:437-439`). Pour IndexedDB, il est persistant (stores `remotes` et `remoteEntryId`, `:572-577`, `:708-757`).
- **Notion online/offline** : **aucune** dans l'API EventLog. La seule « connexion » existante est la durée de vie du `Scope` du remote. Deux façons de simuler la déconnexion :
  1. **Explicite (recommandée pour la démo)** : construire `EventLogRemote.layerUnencrypted` dans un `Scope` dédié (`Layer.buildWithScope`, `S/Layer.ts:884`) puis faire `Scope.close(scope, Exit.void)` (`S/Scope.ts:583`) pour passer hors-ligne, et reconstruire pour revenir en ligne. La couche a besoin du **même** `Registry` que l'`EventLog` (son type requiert `Registry`, `E/EventLogRemote.ts:392-396`) : il faut donc la construire dans un contexte qui fournit ce `Registry`.
  2. **Coupure réseau** : le protocole socket du client RPC se reconnecte seul (`defaultRetryPolicy` exponentiel, plafonné à 5 s, `S/rpc/RpcClient.ts:1196-1199`, `:1225-1228`). Après une reconnexion, le serveur voit un nouveau client non authentifié et renvoie `Forbidden`. Le remote invalide alors son cache d'authentification et se ré-authentifie, jusqu'à 5 tentatives (`E/EventLogRemote.ts:215-233`).
- **Non vérifié** : le comportement de `Hello` à la construction quand le serveur est injoignable (blocage ou échec ?), et l'ordre exact des finalizers à la fermeture du scope, en particulier le flush final `:909` alors que le socket se ferme.

---

## 4. Mapping identité → store et autorisation

- Le client envoie toujours un `storeId`, égal à `CurrentStoreId` (`"default"` par défaut, `E/EventLog.ts:436-438`). Le serveur appelle `mapping.resolve({ publicKey, storeId })` pour les écritures (`E/EventLogServerUnencrypted.ts:185-198`) comme pour les lectures (`:233-236`).
- `layerStoreMappingStatic({ storeId })` accepte **n'importe quelle clé publique** dès lors que le `storeId` demandé correspond, et renvoie ce même store (`E/EventLogServerUnencrypted.ts:356-367`). **Avec Alice et Bob sur le `storeId` "default", ils partagent donc le même store sans autre configuration.** Pour un mapping par utilisateur, on implémente soi-même `StoreMapping.resolve` : on peut renvoyer un store commun quels que soient `publicKey` et `storeId`.
- **Authentification** (`E/EventLogServer.ts:124-183`) : `Hello` renvoie un challenge par connexion. `Authenticate` vérifie le challenge, appelle `authorizeIdentity(publicKey)` **avant** de créer le lien de session, puis fait `getOrCreateSessionAuthBinding(publicKey, signingPublicKey)` (TOFU : la première clé de signature vue pour un `publicKey` est mémorisée, `E/EventLogServerUnencrypted.ts:659-665`) et vérifie la signature Ed25519. Le `publicKey` authentifié est ajouté aux annotations de la connexion.
- **Autorisation** : le service `EventLogServerAuthorization` a trois méthodes, `authorizeIdentity({ publicKey })`, `authorizeWrite({ publicKey, storeId, entries })` et `authorizeRead({ publicKey, storeId })` (`E/EventLogServerUnencrypted.ts:294-307`). Elles sont appelées respectivement à l'authentification (`:151-161`), à l'écriture (`:199-213`) et à l'ouverture de `Changes` (`:237-240`). Un échec avec `reason: "Forbidden"` produit `EventLogProtocolError` avec le code `Forbidden`. Ce comportement est testé dans `test/eventlog/EventLogServerUnencrypted.test.ts:147-232`.
- **Identité** : `EventLog.makeIdentity` délègue à `EventLogEncryption.generateIdentity`, qui renvoie `{ publicKey: crypto.randomUUID(), privateKey: 32 octets aléatoires }` (`E/EventLogEncryption.ts:158-161`). Il faut fournir `EventLogEncryption.layerSubtle`. Les clés de chiffrement et de signature sont **dérivées** de `privateKey` (`E/internal/identityRootSecretDerivation.ts`). Une « liste blanche des deux clés publiques » consiste donc à pré-générer deux identités, à les persister avec `encodeIdentityString` (`E/EventLog.ts:496`), puis à autoriser leurs `publicKey`.
- **Pourquoi pas le mode chiffré** : le stockage chiffré est indexé par `${publicKey}/${storeId}` (`E/EventLogServerEncrypted.ts:238`, `:260`, `:283`) et n'a pas de `StoreMapping`. En plus, la clé AES est dérivée de l'identité (`E/EventLogEncryption.ts:115`). Deux identités distinctes ne peuvent donc pas partager un store chiffré. `EventLogRemote` présente d'ailleurs le non chiffré comme réservé aux « trusted transports or tests » (`E/EventLogRemote.ts:7-9`).

---

## 5. Transports

| Rôle | Couche | Paquet / source |
|---|---|---|
| Serveur RPC (protocole) sur `SocketServer` | `RpcServer.layerProtocolSocketServer` (requiert `RpcSerialization` + `SocketServer`) | `effect/rpc`, `S/rpc/RpcServer.ts:971-975` |
| Serveur RPC en WebSocket via `HttpRouter` | `RpcServer.layerProtocolWebsocket({ path })` (requiert `RpcSerialization` + `HttpRouter`) | `S/rpc/RpcServer.ts:1041-1050` |
| SocketServer WebSocket (Node, paquet `ws`) | `NodeSocketServer.layerWebSocket(wsServerOptions)` | `@effect/platform-node` (réexporte `platform-node-shared`), `.../platform-node-shared/src/NodeSocketServer.ts:267-272` |
| Serveur HTTP Node (si on passe par `HttpRouter`) | `NodeHttpServer.layer(() => createServer(), { port })` | `@effect/platform-node/src/NodeHttpServer.ts:478-489` |
| Client RPC (protocole) sur `Socket` | `RpcClient.layerProtocolSocket({ retryTransientErrors?, retryPolicy?, pingInterval? })` | `S/rpc/RpcClient.ts:1274-1288` |
| Socket WebSocket client (Node) | `NodeSocket.layerWebSocket(url)` | `@effect/platform-node/src/NodeSocket.ts:71-82` |
| Socket WebSocket client (navigateur) | `Socket.layerWebSocket(url)` + `Socket.layerWebSocketConstructorGlobal` (cœur `effect/socket`), ou `BrowserSocket.layerWebSocket(url)` de `@effect/platform-browser` | `S/socket/Socket.ts:1201-1208`, `:865` ; `packages/platform/browser/src/BrowserSocket.ts:40-57` (tag `effect@4.0.2` sur GitHub) |
| Sérialisation | `RpcSerialization.layerJson`, `layerNdjson`, `layerSchemaBinary`, … (pas de msgpack en 4.0.2) | `S/rpc/RpcSerialization.ts:595-665` |
| Tests en mémoire | `RpcTest.makeClient(EventLogRemoteRpcs)` | utilisé par `test/eventlog/EventLogServerUnencrypted.test.ts:81-95` |

- `@effect/platform-node@4.0.2` est installé (`apps/api/package.json`). `@effect/platform-browser@4.0.2` existe sur npm (`npm view`) mais **n'est pas installé**. Il n'est pas nécessaire non plus, puisque `effect/socket` fournit le constructeur global.
- **Vérifié en exécutant le prototype** (`packages/exemple/src/eventlog/`) : `RpcSerialization.layerJson` **ne marche pas**, le client échoue au handshake avec `SchemaError: Expected Uint8Array at ["value"]["challenge"]`. `RpcSerialization.layerSchemaBinary()` des deux côtés fonctionne.

---

## 6. État réactif pour l'UI

- **`EventLog.groupReactivity(group, keys)`** (`E/EventLog.ts:695-714`) : invalide `{ [key]: [entry.primaryKey] }` après une écriture locale réussie (`:950-960`), après un rejeu distant (`:775-784`) et sur les doublons (`:889`). Une invalidation sous forme d'objet déclenche à la fois `key` et `key:primaryKey` (`S/reactivity/Reactivity.ts:425-442`). Un atom enregistré sur `["todos"]` est donc bien rafraîchi.
- **Atom** : `@effect/atom-vue@4.0.2` réexporte `effect/reactivity/Atom`, `AtomRegistry`, etc., et fournit `useAtomValue`, `useAtomSet` et `useAtom`. Le chemin d'intégration est `Atom.runtime(layer)` (`S/reactivity/Atom.ts:956`), puis `runtime.atom(effect).pipe(runtime.withReactivity(["todos"]))` (`:935-946`), ou `runtime.subscriptionRef(ref)` (`:339`, `:815`).
- **Point d'attention, déduit et non vérifié à l'exécution** : `layerEventLog` fait `Layer.provide(ReactivityLayer.layer)` en interne (`E/EventLog.ts:1000`). Il faut que l'instance `Reactivity` utilisée par l'EventLog soit la même que celle d'`Atom.runtime` (`globalLayer = Reactivity.layer`, `S/reactivity/Atom.ts:895`, construite dans le même `memoMap`). La mémoïsation par référence de couche devrait garantir cela, mais je ne l'ai pas testé. L'alternative robuste consiste à faire maintenir par les handlers un `SubscriptionRef<TodoState>` exposé via `runtime.subscriptionRef`.
- **`journal.changes`** (`E/EventJournal.ts:104`) ne publie **que les écritures locales** : `PubSub.publish` n'est appelé que dans `write` (`:440`, `:614`) et pas dans `writeFromRemote`. Ce flux ne convient donc pas pour suivre les changements venant de l'autre utilisateur.
- **Attention au rechargement** : rien ne **rejoue** le journal local dans les handlers au démarrage (`make`, `E/EventLog.ts:799-986`, ne fait que lancer les remotes). Après un rechargement avec IndexedDB, une projection en mémoire est vide. Il faut la reconstruire à partir de `EventLog.entries` en décodant les payloads, ou la persister. **Non vérifié** : je n'ai trouvé aucun helper officiel pour ce rejeu.

---

## 7. Tests et exemples de référence

Aucun exemple bout en bout « deux clients, un serveur » n'existe, ni dans le paquet installé ni dans les `ai-docs` (`node_modules/.pnpm/effect@4.0.2/node_modules/effect/ai-docs/src`, qui n'a pas de section eventlog). Les tests du tag `effect@4.0.2` (https://github.com/Effect-TS/effect/tree/effect@4.0.2/packages/effect/test/eventlog) restent les meilleures références :
- `EventLog.test.ts` : assemblage minimal client (`EventLog.layer` + `layerMemory` + `Identity` via `makeIdentity`/`layerSubtle`, l.22-42), plus le retry offline d'un remote factice (l.63-133).
- `EventJournal.test.ts` : séquences distantes (l.51-75), conflit « plus récent » (l.77-93), relais entre remotes (l.14-49).
- `EventLogServerUnencrypted.test.ts` : serveur complet derrière `RpcTest` avec `StoreMapping` et `EventLogServerAuthorization` écrits à la main (l.81-95), conflits côté serveur (l.43-117), refus d'identité (l.147-232).
- `EventLogRemote.test.ts` : handshake Hello/Authenticate et ré-authentification après `Forbidden` (l.15-51).
- Il existe aussi des tests SQL : `packages/sql/sqlite-node/test/SqlEventJournal.test.ts` et `SqlEventLogServerUnencrypted.test.ts`.

---

## 8. Marqueurs « unstable », mises en garde et pièges

1. Tous les modules sont `@stability unstable` (`E/index.ts:1-90`). L'API a déjà bougé entre les versions : les annotations de migration `migration/annotations/effect__experimental__EventLog*.yaml` dans le dépôt montrent l'ancien emplacement `@effect/experimental`.
2. `conflicts` vaut `[]` pour les écritures locales (`E/EventLog.ts:946`). Le LWW ne se résout qu'au rejeu.
3. Un conflit exige le même **tag** et la même primaryKey. Il n'y a pas de conflit entre deux tags différents.
4. L'ordre repose sur l'**horloge client** (UUIDv7). Un décalage d'horloge fausse donc le LWW.
5. Les handlers distants s'exécutent dans l'ordre d'arrivée et leurs erreurs sont avalées (`E/EventLog.ts:786`). Les projections doivent être commutatives et idempotentes.
6. Une erreur dans un handler **serveur** rejette tout le lot, et le client réessaie sans fin (`E/EventLogServerUnencrypted.ts:218-228`, `E/EventLog.ts:904-908`). Les handlers serveur doivent donc être tolérants (ou des no-op).
7. `EventLogServerUnencrypted.layer` **exige** des handlers serveur pour tout le groupe, avec un `Layer` de type `EventGroup.ToService<Groups>` (`E/EventLogServerUnencrypted.ts:839-842`). On peut fournir `EventLog.group(TodoEvents, h => h.handle("TodoAdded", () => Effect.void)…)`.
8. `layerStorageMemory` côté serveur : le `remoteId` est régénéré à chaque démarrage (`E/EventLogServerUnencrypted.ts:597`). Après un redémarrage, les clients voient un nouveau remote et repartent de la séquence 0. Les liens de session (TOFU) sont aussi perdus, ce que signale le commentaire `:826-829`.
9. `layerIndexedDb` n'existe que dans le navigateur (`indexedDB.open`, `E/EventJournal.ts:564`). Pour des clients scriptés sous Node, il faut `layerMemory` ou `SqlEventJournal.layer`. Le verrou utilise `navigator.locks` sous la clé `${database}/${storeId}` (`:785-807`), donc deux onglets sur la même base se partagent le verrou.
10. `destroy` sur IndexedDB appelle `indexedDB.deleteDatabase` (`E/EventJournal.ts:778-780`).
11. Le mode chiffré ne permet pas de partager un store entre deux identités (voir §4).
12. Il n'y a pas de rejeu automatique du journal local vers les handlers au démarrage (voir §6).

---

## Verdict sur le plan de démo

**Confirmé**
- Serveur : `EventLogServerUnencrypted.layer(schema, handlers)` + `EventLogServerUnencrypted.layerStorageMemory` + transport RPC WebSocket (`RpcServer.layerProtocolSocketServer` + `NodeSocketServer.layerWebSocket`, ou `layerProtocolWebsocket` + `HttpRouter`) + `StoreMapping` + `EventLogServerAuthorization`.
- Client : `EventLog.Identity` par utilisateur, `EventJournal.layerIndexedDb({ database: "alice" | "bob" })`, `EventLogRemote.layerUnencrypted`.
- Domaine : `EventGroup.empty.add(...)` ×4, `EventLog.group(...).handle(...)`, résolution LWW via `conflicts` pour le scénario 2.
- Scénario 1 : sans conflit.

**À corriger**
- Imports : `effect/eventlog/...`, pas `effect/unstable/eventlog`.
- `StoreMapping` : `layerStoreMappingStatic({ storeId: StoreId.make("default") })` suffit, puisque les deux utilisateurs utilisent le store par défaut. Ce n'est pas un mapping par clé publique.
- `EventLogServerAuthorization` : aucune couche n'est fournie, il faut l'écrire avec `Layer.succeed`.
- `Identity` n'est pas une paire de clés asymétrique « classique » : c'est un UUID + un secret, dont la clé de signature est dérivée. On la génère avec `EventLog.makeIdentity` + `EventLogEncryption.layerSubtle`, et on la persiste avec `encodeIdentityString`.
- Scénario 3 : le mécanisme `conflicts` ne s'applique pas (tags différents). Il faut des tombstones dans les handlers, et `TodoToggled` avec `done: boolean`. Autre option : un tag unique `TodoChanged`.
- Offline : il n'y a pas d'API. On ferme puis on reconstruit le `Scope` de la couche remote.
- Clients scriptés Node : `layerIndexedDb` est indisponible, il faut `EventJournal.layerMemory`.
- Des handlers **serveur** sont obligatoires (au minimum des no-op).

**Inconnu / Non vérifié**
- Le comportement de `EventLogRemote.layerUnencrypted` si le serveur est injoignable au moment de la construction.
- Le partage effectif de l'instance `Reactivity` entre `EventLog.layer` et `Atom.runtime`.
- L'ordre des finalizers (flush final) à la fermeture du scope du remote.
- Aucun test officiel bout en bout avec deux clients réels.

---

## Squelette du prototype (noms d'API réels, non compilé)

```ts
// packages/shared/src/todo.ts — domaine partagé
import { Context, Effect, Layer, Schema, SubscriptionRef } from "effect"
import { EventGroup, EventLog } from "effect/eventlog"

const Id = Schema.Struct({ id: Schema.String })
export const TodoEvents = EventGroup.empty
  .add({ tag: "TodoAdded",   primaryKey: (p) => p.id, payload: Schema.Struct({ id: Schema.String, title: Schema.String }) })
  .add({ tag: "TodoRenamed", primaryKey: (p) => p.id, payload: Schema.Struct({ id: Schema.String, title: Schema.String }) })
  .add({ tag: "TodoToggled", primaryKey: (p) => p.id, payload: Schema.Struct({ id: Schema.String, done: Schema.Boolean }) })
  .add({ tag: "TodoDeleted", primaryKey: (p) => p.id, payload: Id })
export const TodoSchema = EventLog.schema(TodoEvents)

// Projection côté client (SubscriptionRef -> facile à brancher sur Atom)
export interface Todo { readonly id: string; readonly title: string; readonly done: boolean }
export interface TodoStateShape { readonly todos: ReadonlyMap<string, Todo>; readonly deleted: ReadonlySet<string> }
export class TodoState extends Context.Service<TodoState, SubscriptionRef.SubscriptionRef<TodoStateShape>>()("TodoState") {}
export const TodoStateLive = Layer.effect(TodoState, SubscriptionRef.make<TodoStateShape>({ todos: new Map(), deleted: new Set() }))

// Handlers client : LWW via conflicts (même tag + même clé) + tombstones pour les tags croisés
export const TodoHandlersClient = EventLog.group(TodoEvents, (h) =>
  h
    .handle("TodoAdded", ({ payload }) => TodoState.use((ref) => SubscriptionRef.update(ref, (s) =>
      s.deleted.has(payload.id) || s.todos.has(payload.id) ? s
        : { ...s, todos: new Map(s.todos).set(payload.id, { ...payload, done: false }) })))
    .handle("TodoRenamed", ({ payload, conflicts }) => conflicts.length > 0 ? Effect.void :
      TodoState.use((ref) => SubscriptionRef.update(ref, (s) => {
        const t = s.todos.get(payload.id); if (!t || s.deleted.has(payload.id)) return s
        return { ...s, todos: new Map(s.todos).set(t.id, { ...t, title: payload.title }) }
      })))
    .handle("TodoToggled", ({ payload, conflicts }) => conflicts.length > 0 ? Effect.void :
      TodoState.use((ref) => SubscriptionRef.update(ref, (s) => {
        const t = s.todos.get(payload.id); if (!t || s.deleted.has(payload.id)) return s
        return { ...s, todos: new Map(s.todos).set(t.id, { ...t, done: payload.done }) }
      })))
    .handle("TodoDeleted", ({ payload }) => TodoState.use((ref) => SubscriptionRef.update(ref, (s) => {
      const todos = new Map(s.todos); todos.delete(payload.id)
      return { todos, deleted: new Set(s.deleted).add(payload.id) }
    })))
)

// Handlers serveur : obligatoires pour EventLogServerUnencrypted.layer ; ne doivent pas échouer
export const TodoHandlersServer = EventLog.group(TodoEvents, (h) =>
  h.handle("TodoAdded", () => Effect.void)
   .handle("TodoRenamed", () => Effect.void)
   .handle("TodoToggled", () => Effect.void)
   .handle("TodoDeleted", () => Effect.void))
```

```ts
// apps/api/src/eventlog-server.ts — serveur Node
import { Effect, Layer } from "effect"
import { EventLogServerUnencrypted as S } from "effect/eventlog"
import { StoreId } from "effect/eventlog/EventLogMessage"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { NodeRuntime, NodeSocketServer } from "@effect/platform-node"
import { TodoHandlersServer, TodoSchema } from "@lab/shared/todo"

const ALLOWED = new Set([process.env.ALICE_PUBLIC_KEY!, process.env.BOB_PUBLIC_KEY!])
const deny = (publicKey: string) => Effect.fail(new S.EventLogServerAuthError({ reason: "Forbidden", publicKey }))

const AuthLive = Layer.succeed(S.EventLogServerAuthorization, {
  authorizeIdentity: ({ publicKey }) => ALLOWED.has(publicKey) ? Effect.void : deny(publicKey),
  authorizeRead:     ({ publicKey }) => ALLOWED.has(publicKey) ? Effect.void : deny(publicKey),
  authorizeWrite:    ({ publicKey }) => ALLOWED.has(publicKey) ? Effect.void : deny(publicKey)
})

const ServerLive = S.layer(TodoSchema, TodoHandlersServer).pipe(
  Layer.provide(S.layerStorageMemory),
  Layer.provide(S.layerStoreMappingStatic({ storeId: StoreId.make("default") })),
  Layer.provide(AuthLive),
  Layer.provide(RpcServer.layerProtocolSocketServer),
  Layer.provide(NodeSocketServer.layerWebSocket({ port: 3000 })),
  Layer.provide(RpcSerialization.layerJson) // Non vérifié : comparer avec layerSchemaBinary()
)

NodeRuntime.runMain(Layer.launch(ServerLive))
```

```ts
// apps/api/src/eventlog-clients.ts — deux clients scriptés (Node : journal mémoire)
import { Effect, Exit, Layer, Scope, SubscriptionRef } from "effect"
import { EventJournal, EventLog, EventLogEncryption, EventLogRemote } from "effect/eventlog"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { NodeSocket } from "@effect/platform-node"
import { TodoHandlersClient, TodoSchema, TodoState, TodoStateLive } from "@lab/shared/todo"

const makeClientLayer = (identity: EventLog.Identity["Service"]) =>
  EventLog.layer(TodoSchema, TodoHandlersClient).pipe(
    Layer.provideMerge(TodoStateLive),
    Layer.provide(EventJournal.layerMemory),           // navigateur : EventJournal.layerIndexedDb({ database: "alice" })
    Layer.provide(Layer.succeed(EventLog.Identity, identity))
  )

const RemoteLive = EventLogRemote.layerUnencrypted.pipe(
  Layer.provide(RpcClient.layerProtocolSocket({ retryTransientErrors: true })),
  Layer.provide(Layer.mergeAll(
    NodeSocket.layerWebSocket("ws://localhost:3000"),  // navigateur : Socket.layerWebSocket(url) + Socket.layerWebSocketConstructorGlobal
    RpcSerialization.layerJson
  ))
)

// "en ligne" = un Scope vivant contenant le remote ; "hors-ligne" = Scope fermé
const goOnline = Effect.gen(function*() {
  const scope = yield* Scope.make()
  yield* Layer.buildWithScope(RemoteLive, scope)       // requiert EventLog.Registry dans le contexte courant
  return scope
})
const goOffline = (scope: Scope.Closeable) => Scope.close(scope, Exit.void)

const client = (identity: EventLog.Identity["Service"]) => Effect.gen(function*() {
  const write = yield* EventLog.makeClient(TodoSchema)
  const state = yield* TodoState
  return { write, state, goOnline, goOffline, snapshot: SubscriptionRef.get(state) }
}).pipe(Effect.provide(makeClientLayer(identity)))   // garder le scope ouvert pendant tout le scénario

// Scénario 2 (esquisse) :
//   alice.goOnline ; bob.goOnline ; alice.write("TodoAdded", { id: "t1", title: "Pain" })
//   alice.goOffline(scopeA) ; alice.write("TodoRenamed", { id: "t1", title: "Pain complet" })
//   bob.write("TodoRenamed", { id: "t1", title: "Baguette" })
//   alice.goOnline -> les deux convergent vers le renommage le plus récent (horloge client)
// Scénario 3 : alice offline -> TodoToggled { id, done: true } ; bob -> TodoDeleted { id } ; reconnect -> supprimé chez les deux (tombstone)
// Identités : générées une fois par Effect.provide(EventLog.makeIdentity, EventLogEncryption.layerSubtle),
//             persistées via EventLog.encodeIdentityString / decodeIdentityString, publicKey -> ALLOWED du serveur.
```

Côté Vue (navigateur), on prend la même couche client avec `layerIndexedDb` et `Socket.layerWebSocket`. Ensuite `const rt = Atom.runtime(clientLayerAvecRemote)`, `const todos = rt.subscriptionRef(TodoState)` (un Effect qui renvoie le `SubscriptionRef`), et `useAtomValue(() => todos)`. **Non vérifié** : la forme exacte de l'accès au `SubscriptionRef` depuis `runtime.subscriptionRef` (voir `S/reactivity/Atom.ts:815-820`).
