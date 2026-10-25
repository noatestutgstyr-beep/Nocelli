#!/usr/bin/env bash
# Teste backend/supabase/schema.sql sur un PostgreSQL local jetable :
# règles du club, droits des clients, et commandes simultanées.
# Usage : bash backend/tests/test-schema.sh
set -eo pipefail
ICI="$(cd "$(dirname "$0")" && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)"
[ -n "$BIN" ] || BIN="$(dirname "$(command -v initdb)")"
DIR="$(mktemp -d)"; PORT=55432
if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; AS="su postgres -c"; else AS="bash -c"; fi
$AS "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
$AS "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR -c max_connections=200' -l $DIR/log -w start >/dev/null"
trap '$AS "$BIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null"; rm -rf "$DIR"' EXIT
PSQL="psql -X -q -v ON_ERROR_STOP=1 -h $DIR -p $PORT -U postgres -d postgres"

$PSQL -f "$ICI/supabase-stub.sql" >/dev/null
PGOPTIONS="-c client_min_messages=warning" $PSQL -f "$ICI/../supabase/schema.sql" >/dev/null
$PSQL -f "$ICI/test-regles.sql" 2>&1 >/dev/null | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  /\1 /; s/^NOTICE //'

echo "— Concurrence : 60 paiements NC-01 simultanés"
$PSQL -c "select test_preparer_commandes(60)" >/dev/null
for c in $($PSQL -t -A -c "select id from commandes where produit='NC-01' and statut='en_attente'"); do
  $PSQL -c "select confirmer_paiement_commande('$c', 'conc_$c')" >/dev/null &
done
wait
$PSQL -t -A -c "select case when count(*) = 50 and count(distinct numero) = 50 and min(numero) = 1 and max(numero) = 50
                  then 'ok   50 fondateurs, numéros 1 à 50 uniques' else 'ÉCHEC ' || count(*) end
                from places_fondateurs where statut = 'confirme'" | tee "$DIR/r1"

echo "— Concurrence : 20 inscriptions simultanées pour 5 places"
$PSQL -c "select test_preparer_evenement(20, 5)" >/dev/null
for u in $($PSQL -t -A -c "select id from profils where email like 'sig%'"); do
  $PSQL -c "set role authenticated; set request.jwt.claim.sub = '$u'; select inscrire_evenement((select id from evenements where titre = 'Test concurrence'))" >/dev/null &
done
wait
$PSQL -t -A -c "select case when count(*) filter (where statut='confirme') = 5 and count(*) filter (where statut='attente') = 15
                  then 'ok   5 confirmés, 15 en liste d''attente' else 'ÉCHEC ' || count(*) filter (where statut='confirme') end
                from inscriptions i join evenements e on e.id = i.evenement_id where e.titre = 'Test concurrence'" | tee "$DIR/r2"

echo "— Concurrence : 12 achats simultanés pour 3 pièces"
$PSQL -c "select test_preparer_stock(3)" >/dev/null
for u in $($PSQL -t -A -c "select id from profils where email like 'sig%' limit 12"); do
  $PSQL -c "set role authenticated; set request.jwt.claim.sub = '$u'; select reserver_piece((select id from lancements where nom = 'Test stock'), 'M')" >/dev/null 2>&1 &
done
wait
$PSQL -t -A -c "select case when (select count(*) from commandes c join lancements l on l.id = c.lancement_id where l.nom = 'Test stock') = 3
                  and (select quantite from stock_lancement s join lancements l on l.id = s.lancement_id where l.nom = 'Test stock') = 0
                  then 'ok   3 commandes, stock à 0, jamais négatif' else 'ÉCHEC' end" | tee "$DIR/r3"

if grep -q ÉCHEC "$DIR"/r1 "$DIR"/r2 "$DIR"/r3; then echo "Des tests ont échoué."; exit 1; fi
echo "Tous les tests SQL sont passés."
